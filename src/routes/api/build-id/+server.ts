import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';

function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

export async function GET({ url }: { url: URL }) {
  try {
    const date = url.searchParams.get('date');
    const definitionId = url.searchParams.get('definitionId');
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorJson('Invalid or missing date (YYYY-MM-DD required)', 400);
    }
    if (!definitionId || typeof definitionId !== 'string' || !/^\d+$/.test(definitionId)) {
      return errorJson('Missing or invalid definitionId (numeric string required)', 400);
    }

    
    let organization, project, pat;
    try {
      ({ AZURE_DEVOPS_ORGANIZATION: organization, AZURE_DEVOPS_PROJECT: project, AZURE_DEVOPS_PAT: pat } = getAzureDevOpsEnvVars(env));
    } catch (e: any) {
      return errorJson(e.message || 'Missing Azure DevOps environment variables', 500);
    }

    // Use the date as both min and max for a single day
    const minTime = `${date}T00:00:00Z`;
    const maxTime = `${date}T23:59:59Z`;
    const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/build/builds?definitions=${definitionId}&minTime=${encodeURIComponent(minTime)}&maxTime=${encodeURIComponent(maxTime)}&branchName=refs/heads/trunk&$top=10&api-version=7.1`;

    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `Basic ${btoa(':' + pat)}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      return errorJson(`Azure DevOps API error: ${res.statusText}`, res.status);
    }
    const data = await res.json();
    if (!Array.isArray(data.value) || data.value.length === 0) {
      return json({ buildId: null, message: 'No build found for this day' });
    }
    // Sort by finishTime descending and pick the latest
    const latest = data.value.sort((a: { finishTime: string }, b: { finishTime: string }) => new Date(b.finishTime).getTime() - new Date(a.finishTime).getTime())[0];
    return json({ buildId: latest.id, build: latest });
  } catch (e: any) {
    console.error(`[release-id] Error:`, e);
    const err = e instanceof Error ? e : { message: String(e) };
    return errorJson('Error fetching release ID: ' + err.message, 500);
  }
}
