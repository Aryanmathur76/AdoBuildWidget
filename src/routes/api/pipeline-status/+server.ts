import { json } from '@sveltejs/kit';
import { AZURE_DEVOPS_PAT } from '$env/static/private';
import { AZURE_DEVOPS_ORGANIZATION } from '$env/static/private';
import { AZURE_DEVOPS_PROJECT } from '$env/static/private';

// Accepts ?definitionId=... and constructs the Azure DevOps REST API URL
export async function GET({ url }) {
  const definitionId = url.searchParams.get('definitionId');
  const date = url.searchParams.get('date'); // format: YYYY-MM-DD
  if (!definitionId) {
    return json({ error: 'Missing definitionId' }, { status: 400 });
  }


 // Use import.meta.env for SvelteKit env vars
  const pat = AZURE_DEVOPS_PAT;
  if (!pat) {
    return json({ error: 'Missing Azure DevOps PAT' }, { status: 500 });
  }

  const org = AZURE_DEVOPS_ORGANIZATION
  const project = AZURE_DEVOPS_PROJECT

  // Get up to 100 releases for the pipeline (increase if needed)
  const pipelineUrl = `https://vsrm.dev.azure.com/${org}/${project}/_apis/release/releases?definitionId=${definitionId}&$top=100&api-version=7.1-preview.8`;

  const auth = btoa(':' + pat);

  try {
    const res = await fetch(pipelineUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      return json({ error: 'Failed to fetch pipeline status' }, { status: res.status });
    }
    const data = await res.json();
    // Find all releases for the requested date, pick the latest by createdOn
    let status = null;
    let foundRelease = null;
    if (data.value && data.value.length > 0 && date) {
      const releasesForDate = data.value.filter((r: any) => r.createdOn && r.createdOn.startsWith(date));
      if (releasesForDate.length > 0) {
        // Sort by createdOn descending to get the latest
        releasesForDate.sort((a: any, b: any) => b.createdOn.localeCompare(a.createdOn));
        foundRelease = releasesForDate[0];
        // Fetch full release details to get up-to-date environments
        const releaseDetailsUrl = `https://vsrm.dev.azure.com/${org}/${project}/_apis/release/releases/${foundRelease.id}?api-version=7.1-preview.8`;
        const detailsRes = await fetch(releaseDetailsUrl, {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
          }
        });
        if (detailsRes.ok) {
          const details = await detailsRes.json();
          const inProgressStatuses = ['inProgress', 'notDeployed', 'active', 'pending', 'queued', 'notStarted'];
          if (details.environments && details.environments.length > 0) {
            if (details.environments.some((env: any) => inProgressStatuses.includes(env.status))) {
              // If the run is still in progress and today is after the release date, mark as 'not completed'
              const today = new Date().toISOString().split('T')[0];
              const releaseDate = details.createdOn ? details.createdOn.split('T')[0] : null;
              if (releaseDate && today > releaseDate) {
                status = 'not completed';
              } else {
                status = 'in progress';
              }
            } else if (details.environments.some((env: any) => env.status === 'rejected' || env.status === 'canceled' || env.status === 'failed')) {
              status = 'failed';
            } else if (details.environments.every((env: any) => env.status === 'succeeded')) {
              status = 'succeeded';
            } else {
              status = details.status || null;
            }
            foundRelease = details;
          } else {
            status = details.status || null;
            foundRelease = details;
          }
        } else {
          status = foundRelease.status || null;
        }
      }
    }
    // fallback: if no date or not found, return Null
    if (!status && data.value && data.value.length > 0) {
        status = "No Run Found";
        foundRelease = null;
    }
    return json({ status, raw: foundRelease || null });
  } catch (e) {
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching pipeline status', details: err.message }, { status: 500 });
  }
}