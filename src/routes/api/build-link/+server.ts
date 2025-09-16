import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function GET({ url }: { url: URL }) {
  try {
    const buildId = url.searchParams.get('buildId');
    if (!buildId) {
      return json({ error: 'Missing buildId' }, { status: 400 });
    }

    const organization = env.AZURE_DEVOPS_ORGANIZATION;
    const project = env.AZURE_DEVOPS_PROJECT;
    if (!organization || !project) {
      return json({ error: 'Missing Azure DevOps environment variables' }, { status: 500 });
    }

    // Construct the Azure DevOps build link
    const link = `https://dev.azure.com/${organization}/${project}/_build/results?buildId=${buildId}`;
    return json({ link });
  } catch (e) {
    console.error(`[build-link] Error:`, e);
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error generating build link', details: err.message }, { status: 500 });
  }
}
