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
import { getOrSetDailyTestCache } from '$lib/utils/dailyTestCache';

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
        const releases = releasesData.value;
        
        if (releases && releases.length > 0) {
            // Filter releases to find the one closest to the requested date (in CST)
            const cstDateStart = new Date(`${date}T00:00:00Z`).getTime() - 6 * 60 * 60 * 1000;
            const cstDateEnd = new Date(`${date}T23:59:59Z`).getTime() + 24 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000;
            
            const releasesOnTargetDate = releases.filter((rel: any) => {
                const createdTime = new Date(rel.createdOn).getTime();
                return createdTime >= cstDateStart && createdTime <= cstDateEnd;
            });
            
            if (releasesOnTargetDate.length > 0) {
                releases.splice(0, releases.length, ...releasesOnTargetDate);
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
        if(releaseId === 78128){
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
                    return stageName.toLowerCase().includes('tests') || stageName.toLowerCase().includes('checks');
                });


                // Deduplicate test runs by name, keeping only the latest run for each unique test run name
                // This allows multiple test suites (different names) in the same environment to all be counted
                const uniqueRuns: Record<string, any> = {};
                for (const run of filteredRuns) {
                    const runName = run.name;
                    if (!runName) continue;
                    
                    // If we haven't seen this run name, or this run is newer, keep it
                    if (!uniqueRuns[runName] || new Date(run.createdDate) > new Date(uniqueRuns[runName].createdDate)) {
                        uniqueRuns[runName] = run;
                    }
                }

            
                // Aggregate test results from all unique test runs
                let passCount = 0;
                let failCount = 0;

                for (const runName in uniqueRuns) {
                    const run = uniqueRuns[runName];
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
    return json(data);
}