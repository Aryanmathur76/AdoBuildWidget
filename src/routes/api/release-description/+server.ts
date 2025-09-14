import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Returns the description of the Azure DevOps release for a given definitionId and date
import type { RequestEvent } from '@sveltejs/kit';

export async function GET({ url }: RequestEvent) {
  const releaseId = url.searchParams.get('releaseId');
  if (!releaseId) {
    return json({ error: 'Missing releaseId' }, { status: 400 });
  }

  const { AZURE_DEVOPS_PAT, AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT } = env;
  if (!AZURE_DEVOPS_PAT || !AZURE_DEVOPS_ORGANIZATION || !AZURE_DEVOPS_PROJECT) {
    return json({ error: 'Missing Azure DevOps environment variables' }, { status: 500 });
  }

  const apiUrl = `https://vsrm.dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/release/releases/${releaseId}?api-version=7.1-preview.8`;
  const auth = btoa(':' + AZURE_DEVOPS_PAT);

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      return json({ error: 'Failed to fetch release' }, { status: res.status });
    }
    const data = await res.json();
    // Return the description field (may be empty string)
    return json({ description: data.description ?? '' });
  } catch (e) {
    console.error(`[release-description] Error:`, e);
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching release description', details: err.message }, { status: 500 });
  }
}
