import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Returns a link to the Azure DevOps release for a given definitionId and date
export async function GET({ url }) {
  const definitionId = url.searchParams.get('definitionId');
  const date = url.searchParams.get('date'); // format: YYYY-MM-DD
  if (!definitionId || !date) {
    return json({ error: 'Missing definitionId or date' }, { status: 400 });
  }

  const { AZURE_DEVOPS_PAT, AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT } = env;
  if (!AZURE_DEVOPS_PAT || !AZURE_DEVOPS_ORGANIZATION || !AZURE_DEVOPS_PROJECT) {
    return json({ error: 'Missing Azure DevOps environment variables' }, { status: 500 });
  }

  const apiUrl = `https://vsrm.dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/release/releases?definitionId=${definitionId}&$top=100&api-version=7.1-preview.8`;
  const auth = btoa(':' + AZURE_DEVOPS_PAT);

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      return json({ error: 'Failed to fetch releases' }, { status: res.status });
    }
    const data = await res.json();
    if (!data.value || !Array.isArray(data.value)) {
      return json({ error: 'Malformed response from Azure DevOps API' }, { status: 502 });
    }
    // Find the release for the given date
    const release = data.value.find((r: { createdOn: string; }) => r.createdOn && r.createdOn.startsWith(date));
    if (!release) {
      return json({ link: null, error: 'No release found for this date' });
    }
    // Construct the Azure DevOps release link
    const link = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_release?releaseId=${release.id}`;
    return json({ link });
  } catch (e) {
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching release link', details: err.message }, { status: 500 });
  }
}
