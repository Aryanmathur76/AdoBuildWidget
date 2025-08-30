import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Helper to return error JSON
function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

export async function GET({ url }: { url: URL }) {
  try {
    const date = url.searchParams.get('date');
    const releaseDefId = url.searchParams.get('releaseDefId');
    if (!date || typeof date !== 'string' || !/\d{4}-\d{2}-\d{2}/.test(date)) {
      return errorJson('Invalid or missing date (YYYY-MM-DD required)', 400);
    }
    if (!releaseDefId) {
      return errorJson('Missing releaseDefId', 400);
    }

    // Azure DevOps API params
    const organization = env.AZURE_DEVOPS_ORGANIZATION;
    const project = env.AZURE_DEVOPS_PROJECT;
    const pat = env.AZURE_DEVOPS_PAT;
    if (!organization || !project || !pat) {
      return errorJson('Missing Azure DevOps environment variables', 500);
    }

    // Use the date as both min and max for a single day
    const minLastUpdatedDate = `${date}T00:00:00Z`;
    const maxLastUpdatedDate = `${date}T23:59:59Z`;
    const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/test/runs?minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&releaseDefIds=${releaseDefId}&api-version=7.1`;

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
    return json(data);
  } catch (e: any) {
    const err = e instanceof Error ? e : { message: String(e) };
    return errorJson('Error fetching test run: ' + err.message, 500);
  }
}
