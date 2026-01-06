import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * GET /api/sprint-test-results
 * Returns test results per sprint for the configured weekly pipeline.
 */

interface SprintTestResult {
    sprintName: string;
    sprintPath: string;
    startDate: string;
    finishDate: string;
    releaseId: number | null;
    releaseName: string | null;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    notExecutedTests: number;
    status: string;
}

export async function GET() {
    try {
        let AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT;
        try {
            ({ AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT } = getAzureDevOpsEnvVars(env));
        } catch (e: any) {
            return json({ error: e.message || 'Missing Azure DevOps environment variables' }, { status: 500 });
        }

        // Parse the weekly pipeline config
        const weeklyConfigStr = publicEnv.PUBLIC_AZURE_PIPELINE_CONFIG_WEEKLY;
        if (!weeklyConfigStr) {
            return json({ error: 'PUBLIC_AZURE_PIPELINE_CONFIG_WEEKLY not configured' }, { status: 500 });
        }

        let weeklyConfig: { pipelines: Array<{ id: number; displayName: string; type: string }> };
        try {
            weeklyConfig = JSON.parse(weeklyConfigStr);
        } catch (e) {
            return json({ error: 'Invalid PUBLIC_AZURE_PIPELINE_CONFIG_WEEKLY format' }, { status: 500 });
        }

        if (!weeklyConfig.pipelines || weeklyConfig.pipelines.length === 0) {
            return json({ error: 'No pipelines configured in PUBLIC_AZURE_PIPELINE_CONFIG_WEEKLY' }, { status: 500 });
        }

        // Fetch ALL iterations from classification nodes (not just team-configured ones)
        const iterationsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/wit/classificationnodes/iterations?$depth=2&api-version=7.1`;
        
        const iterationsRes = await fetch(iterationsUrl, {
            headers: {
                'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
                'Content-Type': 'application/json',
            },
        });

        if (!iterationsRes.ok) {
            const errorText = await iterationsRes.text();
            return json({ error: 'Failed to fetch iterations', details: errorText }, { status: iterationsRes.status });
        }

        const iterationsData = await iterationsRes.json();
        
        // Flatten nested iteration structure
        const allIterations: any[] = [];
        
        function flattenIterations(node: any, parentPath: string = '') {
            if (node.children) {
                for (const child of node.children) {
                    const path = parentPath ? `${parentPath}\\${child.name}` : child.name;
                    if (child.attributes?.startDate && child.attributes?.finishDate) {
                        allIterations.push({
                            id: child.id,
                            name: child.name,
                            path: path,
                            startDate: child.attributes.startDate,
                            finishDate: child.attributes.finishDate,
                        });
                    }
                    flattenIterations(child, path);
                }
            }
        }
        
        flattenIterations(iterationsData);

        // Filter to only sprints that have started (don't show future sprints)
        const today = new Date();
        const sprints = allIterations
            .filter((iteration: any) => new Date(iteration.startDate) <= today)
            .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .slice(0, 10);

        console.log(`Found ${sprints.length} sprints`);

        // Process each pipeline
        const pipelineResults: Array<{
            pipelineName: string;
            pipelineId: number;
            sprints: SprintTestResult[];
        }> = [];

        for (const pipeline of weeklyConfig.pipelines) {
            console.log(`Processing pipeline: ${pipeline.displayName}`);
            const sprintResults: SprintTestResult[] = [];

            for (const sprint of sprints) {
                console.log(`  Processing sprint: ${sprint.name} (${sprint.startDate} to ${sprint.finishDate})`);
                
                if (pipeline.type === 'release') {
                // Query releases for this sprint date range
                const releasesUrl = `https://vsrm.dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/release/releases?definitionId=${pipeline.id}&minCreatedTime=${encodeURIComponent(sprint.startDate)}&maxCreatedTime=${encodeURIComponent(sprint.finishDate)}&api-version=7.1-preview.8`;
                
                const releasesRes = await fetch(releasesUrl, {
                    headers: {
                        'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
                    },
                });

                if (releasesRes.ok) {
                    const releasesData = await releasesRes.json();
                    const releases = releasesData.value || [];
                    
                    if (releases.length > 0) {
                        // Get the latest release (most recent createdOn)
                        const latestRelease = releases.sort((a: any, b: any) => 
                            new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime()
                        )[0];

                        console.log(`  Found latest release: ${latestRelease.name} (ID: ${latestRelease.id})`);

                        // Fetch full release details to get environments
                        const releaseDetailsUrl = `https://vsrm.dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/release/releases/${latestRelease.id}?api-version=7.1-preview.8`;
                        
                        const releaseDetailsRes = await fetch(releaseDetailsUrl, {
                            headers: {
                                'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
                            },
                        });

                        if (releaseDetailsRes.ok) {
                            const releaseDetails = await releaseDetailsRes.json();

                            // Fetch test runs for this release
                            const releaseCreationDate = new Date(releaseDetails.createdOn);
                            const maxDate = new Date(releaseCreationDate);
                            maxDate.setDate(releaseCreationDate.getDate() + 5); // Add 5 days

                            const minLastUpdatedDate = releaseCreationDate.toISOString();
                            const maxLastUpdatedDate = maxDate.toISOString();
                            const testRunUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs?releaseIds=${latestRelease.id}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
                            
                            const testRunRes = await fetch(testRunUrl, {
                                headers: {
                                    'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
                                },
                            });

                            let passedTests = 0;
                            let failedTests = 0;
                            let totalTests = 0;

                            if (testRunRes.ok) {
                                const testRunData = await testRunRes.json();
                                
                                if (Array.isArray(testRunData.value)) {
                                    // Filter test runs to only include those from stages with 'tests' in the name
                                    const filteredRuns = testRunData.value.filter((run: any) => {
                                        const envId = run.release?.environmentId;
                                        const environment = releaseDetails.environments?.find((env: any) => env.id === envId);
                                        const stageName = environment?.name || '';
                                        return stageName.toLowerCase().includes('tests') || stageName.toLowerCase().includes('checks');
                                    });

                                    // Deduplicate test runs by name, keeping only the latest run for each unique test run name
                                    const uniqueRuns: Record<string, any> = {};
                                    for (const run of filteredRuns) {
                                        const runName = run.name;
                                        if (!runName) continue;
                                        
                                        if (!uniqueRuns[runName] || new Date(run.createdDate) > new Date(uniqueRuns[runName].createdDate)) {
                                            uniqueRuns[runName] = run;
                                        }
                                    }

                                    // Aggregate test results from all unique test runs
                                    for (const runName in uniqueRuns) {
                                        const run = uniqueRuns[runName];
                                        passedTests += run.passedTests ?? 0;
                                        failedTests += (run.failedTests ?? 0) + (run.unanalyzedTests ?? 0);
                                    }

                                    totalTests = passedTests + failedTests;
                                }
                            }

                            console.log(`  Total tests: ${totalTests}, Passed: ${passedTests}, Failed: ${failedTests}`);

                            // Determine status
                            let status = 'unknown';
                            if (totalTests > 0) {
                                const passRate = (passedTests / totalTests) * 100;
                                if (passRate >= 90) status = 'good';
                                else if (passRate >= 70) status = 'ok';
                                else status = 'bad';
                            }

                            sprintResults.push({
                                sprintName: sprint.name,
                                sprintPath: sprint.path,
                                startDate: sprint.startDate,
                                finishDate: sprint.finishDate,
                                releaseId: latestRelease.id,
                                releaseName: latestRelease.name,
                                totalTests,
                                passedTests,
                                failedTests,
                                notExecutedTests: 0,
                                status,
                            });
                        }
                    } else {
                        console.log(`    No releases found for this sprint`);
                        // No release for this sprint
                        sprintResults.push({
                            sprintName: sprint.name,
                            sprintPath: sprint.path,
                            startDate: sprint.startDate,
                            finishDate: sprint.finishDate,
                            releaseId: null,
                            releaseName: null,
                            totalTests: 0,
                            passedTests: 0,
                            failedTests: 0,
                            notExecutedTests: 0,
                            status: 'not run',
                        });
                    }
                } else {
                    console.error(`    Failed to fetch releases: ${releasesRes.status}`);
                }
                } else {
                    // Handle build pipelines if needed
                    // Similar logic but using build API
                    sprintResults.push({
                        sprintName: sprint.name,
                        sprintPath: sprint.path,
                        startDate: sprint.startDate,
                        finishDate: sprint.finishDate,
                        releaseId: null,
                        releaseName: null,
                        totalTests: 0,
                        passedTests: 0,
                        failedTests: 0,
                        notExecutedTests: 0,
                        status: 'not supported',
                    });
                }
            }

            pipelineResults.push({
                pipelineName: pipeline.displayName,
                pipelineId: pipeline.id,
                sprints: sprintResults,
            });
        }

        return json({ 
            pipelines: pipelineResults,
            organization: AZURE_DEVOPS_ORGANIZATION,
            project: AZURE_DEVOPS_PROJECT
        });

    } catch (error: any) {
        console.error('Error fetching sprint test results:', error);
        return json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
