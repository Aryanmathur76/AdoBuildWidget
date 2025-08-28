
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// --- Types ---
interface Release {
  id: number;
  createdOn: string;
  status?: string;
  environments?: Environment[];
  [key: string]: any;
}
interface Environment {
  status: string;
  [key: string]: any;
}
interface AzureDevOpsEnv {
  AZURE_DEVOPS_PAT?: string;
  AZURE_DEVOPS_ORGANIZATION?: string;
  AZURE_DEVOPS_PROJECT?: string;
}

// --- Helpers ---
function getRequiredEnv({ AZURE_DEVOPS_PAT, AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT }: AzureDevOpsEnv) {
  if (!AZURE_DEVOPS_PAT) throw { status: 500, error: 'Missing Azure DevOps PAT' };
  if (!AZURE_DEVOPS_ORGANIZATION || !AZURE_DEVOPS_PROJECT) throw { status: 500, error: 'Missing Azure DevOps organization or project' };
  return {
    pat: AZURE_DEVOPS_PAT,
    org: AZURE_DEVOPS_ORGANIZATION,
    project: AZURE_DEVOPS_PROJECT
  };
}

function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

async function fetchReleaseList(org: string, project: string, definitionId: string, pat: string) {
  const url = `https://vsrm.dev.azure.com/${org}/${project}/_apis/release/releases?definitionId=${definitionId}&$top=100&api-version=7.1-preview.8`;
  const auth = btoa(':' + pat);
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw { status: res.status, error: 'Failed to fetch pipeline status' };

  const data = await res.json();
  if (!data || typeof data !== 'object' || !Array.isArray(data.value)) {
    throw { status: 502, error: 'Malformed response from Azure DevOps API' };
  }
  if (!data.value || data.value.length === 0) {
    throw { status: 404, error: 'No releases found' };
  }
  return data;
}

async function fetchReleaseDetails(org: string, project: string, releaseId: number, pat: string) {
  const url = `https://vsrm.dev.azure.com/${org}/${project}/_apis/release/releases/${releaseId}?api-version=7.1-preview.8`;
  const auth = btoa(':' + pat);
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) return null;
  return res.json();
}

function getReleaseStatus(details: Release): string | null {

  //These statuses represent an in-progress release
  const inProgressStatuses = ['inProgress', 'active', 'pending', 'queued', 'notStarted', 'notDeployed'];

  //These statuses represent a interrupted or interrupted release
  const interruptedStatuses = ['rejected', 'canceled', 'failed'];

  if (!details.environments || details.environments.length <= 0) {
    return null;
  }

  const allEnvironments = details.environments;

  // Filter environments to only those related to tests
  const testEnvironments = details.environments.filter(env => env.name.toLowerCase().includes('tests'));

  //First check if the test environments have gone 24 hours without completion
  //indicating a not completed status

  const createdOn = details.createdOn ? new Date(details.createdOn) : null;
  const now = new Date();
  if (createdOn) {
    const diffMs = now.getTime() - createdOn.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours > 24 && (testEnvironments && testEnvironments.some((env) => interruptedStatuses.includes(env.status)))) return 'failed';
  }

  // Then check to see if any test environments are in a interrupted status
  if (allEnvironments && allEnvironments.some((env) => interruptedStatuses.includes(env.status))) {
    return 'interrupted';
  }

  if (allEnvironments && allEnvironments.some((env) => inProgressStatuses.includes(env.status))) {
    return 'in progress';
  }

  if (testEnvironments && testEnvironments.some((env) => env.status === 'partiallySucceeded')) {
    return 'partially succeeded';
  }

  if (testEnvironments && testEnvironments.every((env) => env.status === 'succeeded')) {
    return 'succeeded';
  }

  return details.status || null;
}

// --- Main Handler ---
export async function GET({ url }: { url: URL }) {
  try {
    const definitionId = url.searchParams.get('definitionId');
    const date = url.searchParams.get('date');

    if (!definitionId || typeof definitionId !== 'string' || !definitionId.trim()) {
      return errorJson('Missing or invalid definitionId', 400);
    }

    if (date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      return errorJson('Invalid date format. Expected YYYY-MM-DD', 400);
    }

    const { pat, org, project } = getRequiredEnv(env);
    const data = await fetchReleaseList(org, project, definitionId, pat);

    let status: string | null = null;
    let foundRelease: Release | null = null;

    //Only return releases for the specified date
    const releasesForDate: Release[] = data.value.filter(
      (r: Release) => r.createdOn && date && r.createdOn.startsWith(date)
    );

    if (releasesForDate.length <= 0 || !releasesForDate){
      return json({ status: 'No Run Found', raw: null });
    }

    //Sort releases by creation date descending and take the most recent one
    releasesForDate.sort((a: Release, b: Release) => b.createdOn.localeCompare(a.createdOn));
    foundRelease = releasesForDate[0];

    const details = await fetchReleaseDetails(org, project, foundRelease.id, pat);
    if (details) {
      status = getReleaseStatus(details);
      foundRelease = details;
    } else {
      status = foundRelease.status || null;
    }

    if (!status && data.value && data.value.length > 0) {
      status = 'No Run Found';
      foundRelease = null;
    }

    return json({ status, raw: foundRelease || null });

  } catch (e: any) {
    if (e && typeof e === 'object' && 'error' in e && 'status' in e) {
      return errorJson(e.error, e.status);
    }
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching pipeline status', details: err.message }, { status: 500 });
  }
}