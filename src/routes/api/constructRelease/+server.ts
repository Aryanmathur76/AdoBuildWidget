// This API should take in a date and a release definition ID
// It should first find the correct release ID for that date and definition
// Then it should fetch the release details and construct a release object
// Then it should call into the test runs api and aggregate test results for the release
// It should then return the release object with test results included

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';
import type { Release } from '$lib/types/release';

import { getLatestRelease, getReleasePipelineStatus, calculateReleaseCompletionTime } from '$lib/utils/getReleasePipelineStatus';
import { getOrSetDailyTestCache, shortenDailyTestCacheTtl } from '$lib/utils/dailyTestCache';

export async function GET({ url }: { url: URL }) {
    const date = url.searchParams.get('date');
    const releaseDefinitionId = url.searchParams.get('releaseDefinitionId');

    // Input validation
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json({ error: 'Invalid or missing date (YYYY-MM-DD required)' }, { status: 400 });
    }
    if (!releaseDefinitionId || typeof releaseDefinitionId !== 'string' || !/^\d+$/.test(releaseDefinitionId)) {
        return json({ error: 'Missing or invalid releaseDefinitionId (numeric string required)' }, { status: 400 });
    }

    // Use a cache key based on date and releaseDefinitionId
    const cacheKey = `release:${date}:${releaseDefinitionId}`;

    // Always return a Response object
    const data = await getOrSetDailyTestCache(cacheKey, async () => {
        let organization, project, pat;
        try {
            const envVars = getAzureDevOpsEnvVars(env);
            organization = envVars.AZURE_DEVOPS_ORGANIZATION;
            project = envVars.AZURE_DEVOPS_PROJECT;
            pat = envVars.AZURE_DEVOPS_PAT;
        } catch (e: any) {
            return { error: 'Missing Azure DevOps environment variables' };
        }
        if (!organization || !project || !pat) {
            return { error: 'Missing Azure DevOps environment variables' };
        }

        //#region First step is to get the correct release ID given the date and definition ID
        let releaseId: number;
        try {
            // Account for timezone offset - expand search to cover UTC range for the CST date
            // CST is UTC-6, so a day in CST spans from 6:00 UTC of that day to 6:00 UTC of next day
            const queryDate = new Date(`${date}T00:00:00Z`);
            const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000); // Start 6 hours earlier (previous day in CST)
            const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000); // End 30 hours later (covers whole CST day + buffer)
            
            const minCreatedTime = startDate.toISOString();
            const maxCreatedTime = endDate.toISOString();
            const releasesUrl = `https://vsrm.dev.azure.com/${organization}/${project}/_apis/release/releases?definitionId=${releaseDefinitionId}&minCreatedTime=${encodeURIComponent(minCreatedTime)}&maxCreatedTime=${encodeURIComponent(maxCreatedTime)}&$top=100&api-version=7.1-preview.8`;

        const releasesResponse = await fetch(releasesUrl, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
            }
        });

        if (!releasesResponse.ok) {
            return { error: 'Failed to fetch releases' };
        }

        const releasesData = await releasesResponse.json();
        let releases = releasesData.value;
        
        if (releases && releases.length > 0) {
            // Filter releases to only include those created on the target Central Time date
            const releasesOnTargetDate = releases.filter((rel: any) => {
                if (!rel.createdOn) return false;
                
                // Convert UTC creation time to Central Time properly
                const createdTimeUTC = new Date(rel.createdOn);
                
                // Use Intl.DateTimeFormat to get the date in Central Time
                const centralFormatter = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'America/Chicago',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                const createdDateCentral = centralFormatter.format(createdTimeUTC);
                
                return createdDateCentral === date;
            });
            
            if (releasesOnTargetDate.length > 0) {
                releases = releasesOnTargetDate;
            }
        }

        if (!releases || releases.length === 0) {
            // Return empty/null response instead of 404 when no releases found
            return null;
        }

        // Find the release with the latest creation date
        const latestRelease = getLatestRelease(releases);
        if (!latestRelease?.id) {
            // Return empty/null response instead of 404 when no valid release found
            return null;
        }
        releaseId = latestRelease.id;

    } catch (e: any) {
        return { error: 'Error fetching releases: ' + (e.message || 'Unknown error') };
    }
    //#endregion

    //#region Fetch release details
    const releaseDetailsUrl = `https://vsrm.dev.azure.com/${organization}/${project}/_apis/release/releases/${releaseId}?api-version=7.1-preview.8`;
    const releaseDetailsResponse = await fetch(releaseDetailsUrl, {
        headers: {
            'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
        }
    });

    if (!releaseDetailsResponse.ok) {
        return { error: 'Failed to fetch release details' };
    }

    const releaseDetails = await releaseDetailsResponse.json();

    //Compute the time the release pipeline was completed (take the latest finishTime)
    const latestFinishTime = calculateReleaseCompletionTime(releaseDetails.environments);
    // Construct release object
    const release: Release = {
        id: releaseDetails.id,
        name: releaseDetails.name,
        createdOn: releaseDetails.createdOn,
        modifiedOn: releaseDetails.modifiedOn,
        completedTime: latestFinishTime, // Use the calculated latest finish time
        status: releaseDetails.status, // Use actual Azure DevOps status instead of hardcoding 'unknown'
        envs: releaseDetails.environments
    };
    //#endregion

    //#region Fetch and aggregate test results
    try {
        // Fetch test runs for this release - use release creation date as base and add 5 days
        const releaseCreationDate = new Date(releaseDetails.createdOn);
        const maxDate = new Date(releaseCreationDate);
        maxDate.setDate(releaseCreationDate.getDate() + 5); // Add 5 days

        const minLastUpdatedDate = releaseCreationDate.toISOString();
        const maxLastUpdatedDate = maxDate.toISOString();
        const testRunUrl = `https://dev.azure.com/${organization}/${project}/_apis/test/runs?releaseIds=${releaseId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
        if(releaseId === 80543){
        }
        const testRunResponse = await fetch(testRunUrl, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
            }
        });
        

        if (testRunResponse.ok) {
            const testRunData = await testRunResponse.json();
            
            if (Array.isArray(testRunData.value)) {
                // Filter test runs to only include those from stages with 'tests' in the name
                const filteredRuns = testRunData.value.filter((run: any) => {
                    const envId = run.release?.environmentId;
                    const environment = releaseDetails.environments?.find((env: any) => env.id === envId);
                    const stageName = environment?.name || '';
                    const matches = stageName.toLowerCase().includes('tests') || stageName.toLowerCase().includes('checks');
                    return matches;
                });


                // Group runs by environment and find the latest attempt for each
                const runsByEnvironment: Record<number, any[]> = {};
                for (const run of filteredRuns) {
                    const envId = run.release?.environmentId;
                    if (!envId) continue;
                    if (!runsByEnvironment[envId]) {
                        runsByEnvironment[envId] = [];
                    }
                    runsByEnvironment[envId].push(run);
                }

                // Keep only runs from the latest attempt within each environment
                // This allows all test runs from the latest deployment attempt per environment to be counted
                const uniqueRuns: any[] = [];
                for (const envId in runsByEnvironment) {
                    const runsForEnv = runsByEnvironment[envId];
                    
                    // Find max attempt for this environment
                    let maxAttempt = -1;
                    for (const run of runsForEnv) {
                        const attempt = run.release?.attempt ?? -1;
                        if (attempt > maxAttempt) {
                            maxAttempt = attempt;
                        }
                    }
                    
                    // Add all runs from the latest attempt of this environment
                    for (const run of runsForEnv) {
                        if ((run.release?.attempt ?? -1) === maxAttempt) {
                            uniqueRuns.push(run);
                        }
                    }
                }
            
                // Aggregate test results from all runs in the latest attempt per environment
                let passCount = 0;
                let failCount = 0;

                for (const run of uniqueRuns) {
                    passCount += run.passedTests ?? 0;
                    failCount += (run.failedTests ?? 0) + (run.unanalyzedTests ?? 0);
                }

                // Update release object with aggregated test results
                release.passedTestCount = passCount;
                release.failedTestCount = failCount;
            }
        }
        
        // Always compute the status using our logic, regardless of whether test runs were found
        release.status = await getReleasePipelineStatus(release);
    } catch (e: any) {
       console.warn('Error fetching test results: ' + (e.message || 'Unknown error'));
       // Keep default test counts from release details, but still compute status
       release.status = await getReleasePipelineStatus(release);
    }
    //#endregion
    
    //#region Construct link to release in Azure DevOps
    release.link = `https://dev.azure.com/${organization}/${project}/_releaseProgress?_a=release-pipeline-progress&releaseId=${release.id}`;
    //#endregion

        return release;
    }, 3600);

    const isInProgress = data !== null && !Array.isArray(data) && data?.status === 'inProgress';
    if (isInProgress) await shortenDailyTestCacheTtl(cacheKey, 90);

    return json(data);
}