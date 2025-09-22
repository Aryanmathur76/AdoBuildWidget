
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';

/**
 * GET /api/test-cases?releaseId=123&date=YYYY-MM-DD
 * Returns all test cases for all latest test runs (per environment) for a given release and date window.
 */

export async function GET({ url }: { url: URL }) {
    try {
        let AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT;
        try {
            ({ AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT } = getAzureDevOpsEnvVars(env));
        } catch (e: any) {
            return json({ error: e.message || 'Missing Azure DevOps environment variables' }, { status: 500 });
        }

        const pipelineType = url.searchParams.get('pipelineType');
        const pipelineId = url.searchParams.get('pipelineId');
        const date = url.searchParams.get('date');
        if (!pipelineType || !pipelineId) {
            return json({ error: 'Missing pipelineType or pipelineId parameter' }, { status: 400 });
        }
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return json({ error: 'Missing or invalid date (YYYY-MM-DD required)' }, { status: 400 });
        }

        if (pipelineType === 'release') {
            // Use a window of -1 to +5 days around the given date (same as test-run)
            const baseDate = new Date(date);
            const minDateObj = new Date(baseDate);
            minDateObj.setDate(baseDate.getDate() - 1);
            const maxDateObj = new Date(baseDate);
            maxDateObj.setDate(baseDate.getDate() + 5);
            const minLastUpdatedDate = minDateObj.toISOString().split("T")[0] + "T00:00:00Z";
            const maxLastUpdatedDate = maxDateObj.toISOString().split("T")[0] + "T23:59:59Z";

            // 1. Get all test runs for this release in the date window
            const runsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs?releaseIds=${pipelineId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
            const runsRes = await fetch(runsUrl, {
                headers: {
                    'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!runsRes.ok) {
                return json({ error: 'Failed to fetch test runs', details: await runsRes.text() }, { status: runsRes.status });
            }
            const runsData = await runsRes.json();
            if (!Array.isArray(runsData.value)) {
                return json({ testCases: [] });
            }

            // 2. For each unique environment, get the latest test run
            const envRuns: Record<string, any> = {};
            for (const run of runsData.value) {
                const envId = run.release?.environmentId;
                if (!envId) continue;
                if (!envRuns[envId] || new Date(run.createdDate) > new Date(envRuns[envId].createdDate)) {
                    envRuns[envId] = run;
                }
            }
            const testRunIds = Object.values(envRuns).map((run: any) => run.id);
            if (testRunIds.length === 0) {
                return json({ testCases: [] });
            }

            // 3. For each test run ID, fetch all test case results
            let allTestCases = [];
            for (const runId of testRunIds) {
                const endpoint = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/Runs/${runId}/results?api-version=7.1`;
                const res = await fetch(endpoint, {
                    headers: {
                        'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (!res.ok) {
                    // Skip failed runs, but log error
                    continue;
                }
                const data = await res.json();
                if (Array.isArray(data.value)) {
                    allTestCases.push(...data.value.map((tc: any) => ({
                        id: tc.id,
                        name: tc.testCase?.name || tc.testCaseTitle || '',
                        outcome: tc.outcome,
                        associatedBugs: tc.associatedBugs || [],
                    })));
                }
            }
            return json({ testCases: allTestCases });
        } else if (pipelineType === 'build') {
            // Build pipeline: fetch test runs for the buildId, then fetch test case results for each run
            const baseDate = new Date(date);
            const minDateObj = new Date(baseDate);
            minDateObj.setDate(baseDate.getDate() - 1);
            const maxDateObj = new Date(baseDate);
            maxDateObj.setDate(baseDate.getDate() + 5);
            const minLastUpdatedDate = minDateObj.toISOString().split("T")[0] + "T00:00:00Z";
            const maxLastUpdatedDate = maxDateObj.toISOString().split("T")[0] + "T23:59:59Z";

            // 1. Get all test runs for this build in the date window
            const runsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs?buildIds=${pipelineId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
            console.log(`[test-cases] Fetching test runs from: ${runsUrl}`);
            const runsRes = await fetch(runsUrl, {
                headers: {
                    'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!runsRes.ok) {
                return json({ error: 'Failed to fetch test runs', details: await runsRes.text() }, { status: runsRes.status });
            }
            const runsData = await runsRes.json();
            if (!Array.isArray(runsData.value)) {
                return json({ testCases: [] });
            }
            console.log("Got test runs:", runsData.value.length);

            // 2. For each test run ID, fetch all test case results
            let allTestCases = [];
            for (const runId of runsData.value.map((r: any) => r.id)) {
                const endpoint = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/Runs/${runId}/results?api-version=7.1`;
                const res = await fetch(endpoint, {
                    headers: {
                        'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (!res.ok) {
                    continue;
                }
                const data = await res.json();
                if (Array.isArray(data.value)) {
                    allTestCases.push(...data.value.map((tc: any) => ({
                        id: tc.id,
                        name: tc.testCase?.name || tc.testCaseTitle || '',
                        outcome: tc.outcome,
                        associatedBugs: tc.associatedBugs || [],
                    })));
                }
            }
            return json({ testCases: allTestCases });
        } else {
            return json({ error: 'Invalid pipelineType parameter' }, { status: 400 });
        }
    } catch (e: any) {
        console.error(`[test-cases] Error:`, e);
        const err = e instanceof Error ? e : { message: String(e) };
        return json({ error: 'Error fetching test cases', details: err.message }, { status: 500 });
    }
}
