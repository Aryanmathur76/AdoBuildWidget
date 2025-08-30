import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Returns a link to the Azure DevOps release for a given definitionId and date
import type { RequestEvent } from '@sveltejs/kit';

export async function GET({ url }: RequestEvent) {
  const releaseId = url.searchParams.get('releaseId');
  if (!releaseId) {
    return json({ error: 'Missing releaseId' }, { status: 400 });
  }

  const { AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT } = env;
  if (!AZURE_DEVOPS_ORGANIZATION || !AZURE_DEVOPS_PROJECT) {
    return json({ error: 'Missing Azure DevOps environment variables' }, { status: 500 });
  }

  // Construct the Azure DevOps release link
  const link = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_release?releaseId=${releaseId}`;
  return json({ link });
}
