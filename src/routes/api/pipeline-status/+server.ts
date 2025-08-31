

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// --- Types ---
interface Release {
  id: number;
  createdOn: string;
  environments?: Environment[];
  [key: string]: any;
}
interface Environment {
  name?: string;
  status: string;
  [key: string]: any;
}

function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

function getEnvVars() {
  const pat = env.AZURE_DEVOPS_PAT;
  const org = env.AZURE_DEVOPS_ORGANIZATION;
  const project = env.AZURE_DEVOPS_PROJECT;
  if (!pat) throw { status: 500, error: 'Missing Azure DevOps PAT' };
  if (!org || !project) throw { status: 500, error: 'Missing Azure DevOps organization or project' };
  return { pat, org, project };
}

async function fetchReleaseDetails(org: string, project: string, releaseId: number, pat: string): Promise<Release | null> {
  const url = `https://vsrm.dev.azure.com/${org}/${project}/_apis/release/releases/${releaseId}?api-version=7.1-preview.8`;
  const auth = btoa(':' + pat);
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
      return null;
  }
  const details = await res.json();
  return details;
}

function derivePipelineStatus(details: Release, passCount: number | null, failCount: number | null): string {
  const inProgress = ['inProgress', 'active', 'pending', 'queued'];
  const interrupted = ['rejected', 'canceled', 'failed'];

  if (!details.environments || details.environments.length === 0) {
    return 'No Run Found';
  }

  const allEnvs = details.environments;
  const testEnvs = allEnvs.filter(env => env.name && env.name.toLowerCase().includes('tests'));

  if (testEnvs.length === 0) {
    return 'No Run Found';
  }

  if (testEnvs.every(env => env.status === 'succeeded') && passCount !== null && passCount > 0 && failCount !== null && failCount === 0) {
    return 'succeeded';
  }

  const createdOn = details.createdOn ? new Date(details.createdOn) : null;
  if (createdOn) {
    const diffHours = (Date.now() - createdOn.getTime()) / (1000 * 60 * 60);
    if (diffHours > 24 && allEnvs.some(env => interrupted.includes(env.status))) {
      return 'failed';
    }
  }

  if (allEnvs.some(env => interrupted.includes(env.status))) {
    return 'interrupted';
  }

  if (testEnvs.some(env => env.status === 'partiallySucceeded')) {
    return 'partially succeeded';
  }

  if (allEnvs.some(env => inProgress.includes(env.status))) {
    return 'in progress';
  }

  if (failCount !== null && failCount > 0) {
    return 'failed';
  }

  return 'No Run Found';
}

export async function GET({ url }: { url: URL }) {
  try {
    const releaseId = url.searchParams.get('releaseId');
    console.log("[PipelineStatus] Received request for releaseId:", releaseId);
    if (!releaseId || typeof releaseId !== 'string' || !releaseId.trim()) {
      return errorJson('Missing or invalid releaseId', 400);
    }

    const passCount = url.searchParams.has('passCount') ? Number(url.searchParams.get('passCount')) : null;
    const failCount = url.searchParams.has('failCount') ? Number(url.searchParams.get('failCount')) : null;

    const { pat, org, project } = getEnvVars();
    const details = await fetchReleaseDetails(org, project, Number(releaseId), pat);
    if (!details) {
      return json({ status: 'No Run Found', raw: null });
    }
    const status = derivePipelineStatus(details, passCount, failCount);
    return json({ status, raw: details });
  } catch (e: any) {
    if (e && typeof e === 'object' && 'error' in e && 'status' in e) {
      return errorJson(e.error, e.status);
    }
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching pipeline status', details: err.message }, { status: 500 });
  }
}