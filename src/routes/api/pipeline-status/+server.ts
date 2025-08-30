
import { fail, json } from '@sveltejs/kit';
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

function getReleaseStatus(details: Release, passCount: number | null = null, failCount: number | null = null): string | null {

  //These statuses represent an in-progress release
  const inProgressStatuses = ['inProgress', 'active', 'pending', 'queued'];

  //These statuses represent a interrupted or interrupted release
  const interruptedStatuses = ['rejected', 'canceled', 'failed'];

  if (!details.environments || details.environments.length <= 0) {
    return null;
  }

  const allEnvironments = details.environments;

  // Filter environments to only those related to tests
  const testEnvironments = details.environments.filter(env => env.name.toLowerCase().includes('tests'));

  //If the test environments all succeeded, return succeeded
  if (
    testEnvironments &&
    testEnvironments.every((env) => env.status === 'succeeded') &&
    passCount !== null && passCount > 0 &&
    failCount !== null && failCount === 0
  ) {
    console.log("Pass Count:", passCount, "Fail Count:", failCount);
    return 'succeeded';
  }

  //First check if the test environments have gone 24 hours without completion
  //indicating a not completed status

  const createdOn = details.createdOn ? new Date(details.createdOn) : null;
  const now = new Date();
  if (createdOn) {
    const diffMs = now.getTime() - createdOn.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours > 24 && (allEnvironments && allEnvironments.some((env) => interruptedStatuses.includes(env.status)))) return 'failed';
  }

  // Then check to see if any test environments are in a interrupted status
  if (allEnvironments && allEnvironments.some((env) => interruptedStatuses.includes(env.status))) {
    return 'interrupted';
  }

  if (testEnvironments && testEnvironments.some((env) => env.status === 'partiallySucceeded')) {
    return 'partially succeeded';
  }

  if (allEnvironments && allEnvironments.some((env) => inProgressStatuses.includes(env.status))) {
    return 'in progress';
  }

  if (failCount !== null && failCount > 0) {
    return 'failed';
  }

  
  return details.status || null;
}

// --- Main Handler ---
export async function GET({ url }: { url: URL }) {
  try {
    const releaseId = url.searchParams.get('releaseId');
    if (!releaseId || typeof releaseId !== 'string' || !releaseId.trim()) {
      return errorJson('Missing or invalid releaseId', 400);
    }

    // Parse passCount/failCount from query params and pass to getReleaseStatus
    const passCountParam = url.searchParams.get('passCount');
    const failCountParam = url.searchParams.get('failCount');
    const passCount = passCountParam !== null ? Number(passCountParam) : null;
    const failCount = failCountParam !== null ? Number(failCountParam) : null;

    const { pat, org, project } = getRequiredEnv(env);
    const details = await fetchReleaseDetails(org, project, Number(releaseId), pat);
    if (!details) {
      // Clean up global
      delete (globalThis as any).__pipelineStatusQueryParams;
      return json({ status: 'No Run Found', raw: null });
    }
    const status = getReleaseStatus(details, passCount, failCount);
    return json({ status, raw: details });
  } catch (e: any) {
    if (e && typeof e === 'object' && 'error' in e && 'status' in e) {
      return errorJson(e.error, e.status);
    }
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching pipeline status', details: err.message }, { status: 500 });
  }
}