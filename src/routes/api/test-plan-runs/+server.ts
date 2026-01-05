import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * GET /api/test-plan-runs
 * Returns test run history for the configured test plan.
 * Groups test runs by their execution date/time.
 */

interface TestRun {
    id: number;
    name: string;
    state: string;
    startedDate: string;
    completedDate: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    notExecutedTests: number;
}

interface TestRunGroup {
    date: string;
    runs: TestRun[];
    totalTests: number;
    passedTests: number;
    failedTests: number;
    notExecutedTests: number;
}

export async function GET() {
    try {
        let AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT;
        try {
            ({ AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT } = getAzureDevOpsEnvVars(env));
        } catch (e: any) {
            return json({ error: e.message || 'Missing Azure DevOps environment variables' }, { status: 500 });
        }

        const testPlanId = publicEnv.PUBLIC_TEST_PLAN_ID;
        if (!testPlanId) {
            return json({ error: 'PUBLIC_TEST_PLAN_ID not configured' }, { status: 500 });
        }

        // Fetch test runs for the last 12 months in 7-day windows
        const allRuns: any[] = [];
        const now = new Date();
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(now.getMonth() - 12);

        // Start from 12 months ago and work forward in 7-day windows
        let currentStart = new Date(twelveMonthsAgo);
        
        while (currentStart < now) {
            const currentEnd = new Date(currentStart);
            currentEnd.setDate(currentEnd.getDate() + 7);
            
            // Don't go beyond now
            if (currentEnd > now) {
                currentEnd.setTime(now.getTime());
            }

            const minLastUpdatedDate = currentStart.toISOString();
            const maxLastUpdatedDate = currentEnd.toISOString();

            console.log(`Fetching test runs from ${minLastUpdatedDate} to ${maxLastUpdatedDate}`);
            
            // Pagination loop for each 7-day window
            let continuationToken: string | null = null;
            let pageCount = 0;
            
            do {
                let runsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs?planIds=${testPlanId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
                
                if (continuationToken) {
                    runsUrl += `&continuationToken=${encodeURIComponent(continuationToken)}`;
                }
                
                const runsRes = await fetch(runsUrl, {
                    headers: {
                        'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (!runsRes.ok) {
                    const errorText = await runsRes.text();
                    console.error('Error response:', errorText);
                    break; // Exit pagination loop on error
                }

                const runsData = await runsRes.json();
                pageCount++;
                console.log(`  Page ${pageCount}: ${runsData.value?.length || 0} runs`);
                
                if (Array.isArray(runsData.value)) {
                    allRuns.push(...runsData.value);
                }

                // Check for continuation token in response headers or body
                continuationToken = runsRes.headers.get('x-ms-continuationtoken') || runsData.continuationToken || null;
                
                if (continuationToken) {
                    console.log(`  Found continuation token, fetching next page...`);
                }
                
            } while (continuationToken);

            console.log(`  Total in this window: ${pageCount} page(s)`);

            // Move to next window
            currentStart = new Date(currentEnd);
        }

        console.log('Total runs fetched:', allRuns.length);
        
        if (!Array.isArray(allRuns) || allRuns.length === 0) {
            return json({ groups: [] });
        }

        // Process and group test runs by date
        const testRuns: TestRun[] = allRuns
            .filter((run: any) => {
                // Only completed runs with valid dates and version numbers
                if (run.state !== 'Completed') return false;
                if (!run.startedDate) return false;
                const date = new Date(run.startedDate);
                if (isNaN(date.getTime())) return false;
                // Only include runs with version 16.0.0 or 17.0.0 in the name
                const runName = run.name || '';
                return runName.includes('16.0.0') || runName.includes('17.0.0');
            })
            .map((run: any) => ({
                id: run.id,
                name: run.name,
                state: run.state,
                startedDate: run.startedDate,
                completedDate: run.completedDate,
                totalTests: run.totalTests || 0,
                passedTests: run.passedTests || 0,
                failedTests: run.failedTests || 0,
                notExecutedTests: run.notExecutedTests || run.unanalyzedTests || 0,
            }))
            .sort((a, b) => new Date(a.startedDate).getTime() - new Date(b.startedDate).getTime()); // Sort by start date

        // Group runs into "test sessions" - runs that start within 14 days (2 weeks) of each other
        const sessions: TestRunGroup[] = [];
        let currentSession: TestRun[] = [];
        let sessionStartDate: Date | null = null;

        for (const run of testRuns) {
            const runDate = new Date(run.startedDate);
            
            if (!sessionStartDate) {
                // Start a new session
                sessionStartDate = runDate;
                currentSession = [run];
            } else {
                // Check if this run is within 14 days (2 weeks) of the session start
                const daysDiff = Math.abs((runDate.getTime() - sessionStartDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysDiff <= 14) {
                    // Add to current session
                    currentSession.push(run);
                } else {
                    // Finalize current session and start a new one
                    if (currentSession.length > 0) {
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
                    
                    // Start new session
                    sessionStartDate = runDate;
                    currentSession = [run];
                }
            }
        }

        // Don't forget the last session
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

        // Sort sessions by date (most recent first)
        const groups: TestRunGroup[] = sessions.sort((a, b) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        return json({ groups });

    } catch (error: any) {
        console.error('Error fetching test plan runs:', error);
        return json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
