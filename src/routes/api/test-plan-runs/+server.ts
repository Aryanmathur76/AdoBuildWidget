import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';
import { env as publicEnv } from '$env/dynamic/public';
import { fetchTestRunsForPlan, filterAndMapTestRuns, groupTestRuns } from '$lib/utils/testPlanRuns';
import type { AzureEnv } from '$lib/utils/testPlanRuns';
import type { TestRun, TestRunGroup } from '$lib/types/testRuns';

export async function GET({ url }: { url: URL }) {
    try {
        let AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT;
        try {
            ({ AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT } = getAzureDevOpsEnvVars(env));
        } catch (e: any) {
            return json({ error: e.message || 'Missing Azure DevOps environment variables' }, { status: 500 });
        }

        // Allow overriding the testPlanId via query param for client requests
        const queryPlanId = url.searchParams.get('testPlanId');
        const testPlanId = queryPlanId || publicEnv.PUBLIC_TEST_PLAN_ID;
        if (!testPlanId) {
            return json({ error: 'testPlanId not provided and PUBLIC_TEST_PLAN_ID not configured' }, { status: 400 });
        }

        // Fetch test runs for the last 12 months in 7-day windows
        const now = new Date();
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(now.getMonth() - 12);

        const azureEnv: AzureEnv = {
            organization: AZURE_DEVOPS_ORGANIZATION,
            project: AZURE_DEVOPS_PROJECT,
            pat: AZURE_DEVOPS_PAT,
        };

        const allRuns = await fetchTestRunsForPlan(azureEnv, testPlanId, twelveMonthsAgo, now);

        if (!Array.isArray(allRuns) || allRuns.length === 0) {
            return json({ groups: [] });
        }

        const testRuns: TestRun[] = filterAndMapTestRuns(allRuns);
        const groups: TestRunGroup[] = groupTestRuns(testRuns);

        return json({ 
            groups,
            organization: AZURE_DEVOPS_ORGANIZATION,
            project: AZURE_DEVOPS_PROJECT
        });

    } catch (error: any) {
        console.error('Error fetching test plan runs:', error);
        return json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
