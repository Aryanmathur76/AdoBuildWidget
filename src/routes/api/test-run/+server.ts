import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Helper to return error JSON
function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

export async function GET({ url }: { url: URL }) {
  try {
    const releaseId = url.searchParams.get('releaseId');
    const date = url.searchParams.get('date');
    if (!releaseId) {
      return errorJson('Missing releaseId', 400);
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorJson('Missing or invalid date (YYYY-MM-DD required)', 400);
    }

    // Azure DevOps API params
    const organization = env.AZURE_DEVOPS_ORGANIZATION;
    const project = env.AZURE_DEVOPS_PROJECT;
    const pat = env.AZURE_DEVOPS_PAT;
    if (!organization || !project || !pat) {
      return errorJson('Missing Azure DevOps environment variables', 500);
    }


    // Use a window of -2 to +2 days around the given date
    const baseDate = new Date(date);
    const minDateObj = new Date(baseDate);
    minDateObj.setDate(baseDate.getDate() - 1);
    const maxDateObj = new Date(baseDate);
    maxDateObj.setDate(baseDate.getDate() + 5);
    const minLastUpdatedDate = minDateObj.toISOString().split("T")[0] + "T00:00:00Z";
    const maxLastUpdatedDate = maxDateObj.toISOString().split("T")[0] + "T23:59:59Z";
    const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/test/runs?releaseIds=${releaseId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;

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

    // Aggregate pass/fail counts for the latest run per unique environmentId (from run.release.environmentId)
    if (!Array.isArray(data.value)) {
      return json({ passCount: 0, failCount: 0, message: 'No test run with environment found' });
    }
    // Map of environmentId to latest run
    const envRuns: Record<string, any> = {};
    for (const run of data.value) {
      const envId = run.release?.environmentId;
      if (!envId) continue;
      if (!envRuns[envId] || new Date(run.createdDate) > new Date(envRuns[envId].createdDate)) {
        envRuns[envId] = run;
      }
    }
    let passCount = 0;
    let failCount = 0;
    for (const envId in envRuns) {
      const run = envRuns[envId];
      passCount += run.passedTests ?? 0;
      failCount += (run.unanalyzedTests ?? run.failedTests ?? 0);
    }
    if (Object.keys(envRuns).length === 0) {
      return json({ passCount: 0, failCount: 0, message: 'No test run with environment found' });
    }
    return json({ passCount, failCount });
  } catch (e: any) {
    const err = e instanceof Error ? e : { message: String(e) };
    return errorJson('Error fetching test run: ' + err.message, 500);
  }
}
