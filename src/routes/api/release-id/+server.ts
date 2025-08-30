import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

export async function GET({ url }: { url: URL }) {
  try {
    const date = url.searchParams.get('date');
    const definitionId = url.searchParams.get('definitionId');
    if (!date || typeof date !== 'string' || !/\d{4}-\d{2}-\d{2}/.test(date)) {
      return errorJson('Invalid or missing date (YYYY-MM-DD required)', 400);
    }
    if (!definitionId) {
      return errorJson('Missing definitionId', 400);
    }

    const organization = env.AZURE_DEVOPS_ORGANIZATION;
    const project = env.AZURE_DEVOPS_PROJECT;
    const pat = env.AZURE_DEVOPS_PAT;
    if (!organization || !project || !pat) {
      return errorJson('Missing Azure DevOps environment variables', 500);
    }

    // Use the date as both min and max for a single day
    const minCreatedTime = `${date}T00:00:00Z`;
    const maxCreatedTime = `${date}T23:59:59Z`;
    const apiUrl = `https://vsrm.dev.azure.com/${organization}/${project}/_apis/release/releases?definitionId=${definitionId}&minCreatedTime=${encodeURIComponent(minCreatedTime)}&maxCreatedTime=${encodeURIComponent(maxCreatedTime)}&$top=10&api-version=7.1-preview.8`;

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
      return json({ releaseId: null, message: 'No release found for this day' });
    }
    // Sort by createdOn descending and pick the latest
    const latest = data.value.sort((a: { createdOn: string }, b: { createdOn: string }) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime())[0];
    return json({ releaseId: latest.id, release: latest });
  } catch (e: any) {
    const err = e instanceof Error ? e : { message: String(e) };
    return errorJson('Error fetching release ID: ' + err.message, 500);
  }
}
