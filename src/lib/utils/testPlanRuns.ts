import type { TestRun, TestRunGroup } from '$lib/types/testRuns';

export type AzureEnv = {
    organization: string;
    project: string;
    pat: string;
};

function encodePat(pat: string) {
    if (typeof btoa !== 'undefined') {
        return btoa(':' + pat);
    }

    // Node fallback
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(':' + pat).toString('base64');
    }

    throw new Error('No base64 encoder available for PAT');
}

export async function fetchTestRunsForPlan(azureEnv: AzureEnv, testPlanId: string, fromDate: Date, toDate: Date) {
    if (!testPlanId) throw new Error('testPlanId is required');
    const allRuns: any[] = [];
    const now = toDate;
    let currentStart = new Date(fromDate);

    while (currentStart < now) {
        const currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + 7);

        if (currentEnd > now) currentEnd.setTime(now.getTime());

        const minLastUpdatedDate = currentStart.toISOString();
        const maxLastUpdatedDate = currentEnd.toISOString();

        let continuationToken: string | null = null;

        do {
            let runsUrl = `https://dev.azure.com/${azureEnv.organization}/${azureEnv.project}/_apis/test/runs?planIds=${testPlanId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
            if (continuationToken) {
                runsUrl += `&continuationToken=${encodeURIComponent(continuationToken)}`;
            }

            const runsRes = await fetch(runsUrl, {
                headers: {
                    'Authorization': `Basic ${encodePat(azureEnv.pat)}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!runsRes.ok) {
                const errorText = await runsRes.text();
                throw new Error(`Azure DevOps fetch error: ${errorText}`);
            }

            const runsData = await runsRes.json();

            if (Array.isArray(runsData.value)) {
                allRuns.push(...runsData.value);
            }

            continuationToken = runsRes.headers.get('x-ms-continuationtoken') || runsData.continuationToken || null;
        } while (continuationToken);

        currentStart = new Date(currentEnd);
    }

    return allRuns;
}

export function filterAndMapTestRuns(allRuns: any[]): TestRun[] {
    return (allRuns || [])
        .filter((run: any) => {
            if (run.state !== 'Completed') return false;
            if (!run.startedDate) return false;
            const date = new Date(run.startedDate);
            if (isNaN(date.getTime())) return false;
            const runName = run.name || '';
            return runName.includes('16.0.0') || runName.includes('17.0.0');
        })
        .map((run: any) => ({
            id: run.id,
            name: run.name,
            state: run.state,
            startedDate: run.startedDate,
            completedDate: run.completedDate,
            totalTests: Number(run.totalTests) || 0,
            passedTests: Number(run.passedTests) || 0,
            failedTests: Number(run.failedTests) || 0,
            notExecutedTests: Number(run.notExecutedTests ?? run.unanalyzedTests) || 0,
        }))
        .sort((a, b) => new Date(a.startedDate).getTime() - new Date(b.startedDate).getTime());
}

export function groupTestRuns(testRuns: TestRun[], sessionDays = 14): TestRunGroup[] {
    const sessions: TestRunGroup[] = [];
    let currentSession: TestRun[] = [];
    let sessionStartDate: Date | null = null;

    for (const run of testRuns) {
        const runDate = new Date(run.startedDate);

        if (!sessionStartDate) {
            sessionStartDate = runDate;
            currentSession = [run];
            continue;
        }

        const daysDiff = Math.abs((runDate.getTime() - sessionStartDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff <= sessionDays) {
            currentSession.push(run);
        } else {
            const totalTests = currentSession.reduce((sum, r) => sum + r.totalTests, 0);
            const passedTests = currentSession.reduce((sum, r) => sum + r.passedTests, 0);
            const failedTests = currentSession.reduce((sum, r) => sum + r.failedTests, 0);
            const notExecutedTests = currentSession.reduce((sum, r) => sum + r.notExecutedTests, 0);

            sessions.push({
                date: sessionStartDate.toISOString().split('T')[0],
                runs: currentSession,
                totalTests,
                passedTests,
                failedTests,
                notExecutedTests,
            });

            sessionStartDate = runDate;
            currentSession = [run];
        }
    }

    if (currentSession.length > 0 && sessionStartDate) {
        const totalTests = currentSession.reduce((sum, r) => sum + r.totalTests, 0);
        const passedTests = currentSession.reduce((sum, r) => sum + r.passedTests, 0);
        const failedTests = currentSession.reduce((sum, r) => sum + r.failedTests, 0);
        const notExecutedTests = currentSession.reduce((sum, r) => sum + r.notExecutedTests, 0);

        sessions.push({
            date: sessionStartDate.toISOString().split('T')[0],
            runs: currentSession,
            totalTests,
            passedTests,
            failedTests,
            notExecutedTests,
        });
    }

    return sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
