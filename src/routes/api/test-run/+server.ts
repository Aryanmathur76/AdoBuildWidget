import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';

// Helper to return error JSON
function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

export async function GET({ url }: { url: URL }) {
  try {
    const pipelineId = url.searchParams.get('pipelineId');
    const pipelineType = url.searchParams.get('pipelineType');
    const date = url.searchParams.get('date');
    if (!pipelineId) {
      return errorJson('Missing pipelineId', 400);
    }
    if (pipelineType !== 'build' && pipelineType !== 'release') {
      return errorJson('Invalid pipelineType, must be "build" or "release"', 400);
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorJson('Missing or invalid date (YYYY-MM-DD required)', 400);
    }

    let organization, project, pat;
    try {
      ({ AZURE_DEVOPS_ORGANIZATION: organization, AZURE_DEVOPS_PROJECT: project, AZURE_DEVOPS_PAT: pat } = getAzureDevOpsEnvVars(env));
    } catch (e: any) {
      return errorJson(e.message || 'Missing Azure DevOps environment variables', 500);
    }


    // Use a window of -2 to +2 days around the given date
    const baseDate = new Date(date);
    const minDateObj = new Date(baseDate);
    minDateObj.setDate(baseDate.getDate() - 1);
    const maxDateObj = new Date(baseDate);
    maxDateObj.setDate(baseDate.getDate() + 5);
    const minLastUpdatedDate = minDateObj.toISOString().split("T")[0] + "T00:00:00Z";
    const maxLastUpdatedDate = maxDateObj.toISOString().split("T")[0] + "T23:59:59Z";
    let apiUrl;
    if (pipelineType === 'build') {
          apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/test/runs?buildIds=${pipelineId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
    }
    else if (pipelineType === 'release') {
          apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/test/runs?releaseIds=${pipelineId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
    }

    if (!apiUrl) {
      return errorJson('Failed to construct API URL', 500);
    }

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
    if(pipelineType==='build'){
      const run = data.value?.[0] ?? {};
      return json({
        passCount: run.passedTests ?? 0,
        failCount: (run.notApplicableTests ?? 0) + (run.unanalyzedTests ?? 0) + (run.failedTests ?? 0) + (run.incompleteTests ?? 0),
        message: 'No message available for build pipelines'
      });
    }

    // Aggregate pass/fail cournts for the latest run per unique environmentId (from run.release.environmentId)
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
    console.error(`[test-run] Error:`, e);
    const err = e instanceof Error ? e : { message: String(e) };
    return errorJson('Error fetching test run: ' + err.message, 500);
  }
}
