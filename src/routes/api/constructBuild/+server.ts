// This API should take in a date and a build definition ID
// It should then first find the correct build ID for that date and definition
// Then it should fetch the build details and construct a build object
// Then it should call into the test runs api and aggregate test results for the build
// It should then return the build object with test results included

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';
import type { Build } from '$lib/types/build';

import { getBuildPipelineStatus } from '$lib/utils/getBuildPipelineStatus';
import { getOrSetDailyTestCache } from '$lib/utils/dailyTestCache';

export async function GET({ url }: { url: URL }) {
    const date = url.searchParams.get('date');
    const buildDefinitionId = url.searchParams.get('buildDefinitionId');

    // Input validation
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json({ error: 'Invalid or missing date (YYYY-MM-DD required)' }, { status: 400 });
    }
    if (!buildDefinitionId || typeof buildDefinitionId !== 'string' || !/^\d+$/.test(buildDefinitionId)) {
        return json({ error: 'Missing or invalid buildDefinitionId (numeric string required)' }, { status: 400 });
    }

    // Use a cache key based on date and buildDefinitionId
    const cacheKey = `build:${date}:${buildDefinitionId}`;

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

        // ...existing code...

        //#region First step is to get the correct build ID given the date and definition ID
        let buildId: number;
        try {
            // Convert Central Time date to UTC range for API query
            // Use proper timezone handling to account for CDT/CST automatically
            const centralDateStart = new Date(date + 'T00:00:00');
            const centralDateEnd = new Date(date + 'T23:59:59');
        
        // Convert Central Time to UTC (this handles DST automatically)
        // Note: We'll create a broader search range since timezone conversion can be tricky
        
        // Convert to UTC for the API query - expand range to catch builds that might span timezone boundaries
        const searchStartDate = new Date(centralDateStart);
        searchStartDate.setDate(searchStartDate.getDate() - 1); // Look back 1 day to catch any timezone edge cases
        
        const minTime = searchStartDate.toISOString();
        const maxTime = new Date(centralDateEnd.getTime() + 24 * 60 * 60 * 1000).toISOString(); // Add 1 day forward
        
        const branchName = 'refs/heads/trunk'; // or your desired branch
        const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/build/builds?definitions=${buildDefinitionId}&minTime=${encodeURIComponent(minTime)}&maxTime=${encodeURIComponent(maxTime)}&queryOrder=finishTimeDescending&$top=50&branchName=${encodeURIComponent(branchName)}&api-version=7.1`;

        const res = await fetch(apiUrl, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
            }
        });

        if (!res.ok) {
            throw new Error(`Failed to fetch builds: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        var allBuilds = data.value as any[];
        
        // Filter builds to only include those that completed on the target Central Time date
        var builds = allBuilds.filter(build => {
            if (!build.finishTime) return false; // Only completed builds
            
            // Convert UTC finish time to Central Time properly
            const finishTimeUTC = new Date(build.finishTime);
            
            // Use Intl.DateTimeFormat to get the date in Central Time
            const centralFormatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Chicago',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            const finishDateCentral = centralFormatter.format(finishTimeUTC);
            
            // Also format the time for logging
            const centralTimeFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Chicago',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            const finishTimeCentralStr = centralTimeFormatter.format(finishTimeUTC);
            
            const isMatch = finishDateCentral === date;
                                    
            return isMatch;
        }) as Build[];

        // If no completed builds found and the day is today (in Central Time), check for in-progress builds
        const now = new Date();
        const todayUTC = now.toISOString();
        // Convert to Central Time (accounting for CDT/CST automatically)
        const todayCentralFormatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayCentralStr = todayCentralFormatter.format(now);
        

        if ((!builds || builds.length === 0) && date === todayCentralStr) {
            // For in-progress builds, look for builds that started on the target Central Time day
            // Look for builds that started on the target day or the day before (to catch edge cases)
            const centralStartDate = new Date(date + 'T00:00:00');
            const centralEndDate = new Date(date + 'T23:59:59');
            const centralStartDatePrev = new Date(centralStartDate);
            centralStartDatePrev.setDate(centralStartDatePrev.getDate() - 1); // Previous day

            const utcMinTime = centralStartDatePrev.toISOString();
            const utcMaxTime = centralEndDate.toISOString();
            
            const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/build/builds?definitions=${buildDefinitionId}&minTime=${encodeURIComponent(utcMinTime)}&maxTime=${encodeURIComponent(utcMaxTime)}&queryOrder=startTimeDescending&$top=10&branchName=${encodeURIComponent(branchName)}&api-version=7.1`;
            const res = await fetch(apiUrl, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
                }
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch builds: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            const inProgressBuilds = (data.value as any[]).filter(build => build.status === 'inProgress');
            builds = inProgressBuilds as Build[];
        }

        // The build with the latest startTime on that day is the one we want
        const latestBuild = builds[0];
        if (!latestBuild) {
            return { buildId: null, message: 'No build found for this day' };
        }
        buildId = latestBuild.id;
    } catch (error) {
        return { error: 'Failed to fetch build ID' };
    }
    //#endregion

    //#region Second step is to get the build details
    let buildDetails: any | null;
    try {
        const buildUrl = `https://dev.azure.com/${organization}/${project}/_apis/build/builds/${buildId}?api-version=7.1`;
        const res = await fetch(buildUrl, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
            }
        });

        if (!res.ok) {
            throw new Error(`Failed to fetch build details: ${res.status} ${res.statusText}`);
        }

        buildDetails = await res.json();
        if (!buildDetails) {
            return { error: 'No build details found' };
        }
    } catch (error) {
        return { error: 'Failed to fetch build details' };
    }

    //Construct a build object with CST time logging
    if (buildDetails.startTime) {
        const startCST = new Date(new Date(buildDetails.startTime).getTime() - 6 * 60 * 60 * 1000);
    }
    if (buildDetails.finishTime) {
        const finishCST = new Date(new Date(buildDetails.finishTime).getTime() - 6 * 60 * 60 * 1000);
    }
    
    const build: Build = {
        id: buildDetails.id,
        name: buildDetails.name,
        status: buildDetails.status, // Use actual Azure DevOps status instead of hardcoding 'unknown'
        result: buildDetails.result,
        startTime: buildDetails.startTime,
        modifiedOn: buildDetails.modifiedOn,
        completedTime: buildDetails.finishTime
    };

    //#endregion

    //#region Third step is to get the test results
    let testResults: any[] = [];
    try {
        // Fetch test runs for this build - use build start date as base and add 5 days
        const buildCreationDateUTC = new Date(buildDetails.startTime);
        const buildCreationDateCST = new Date(buildCreationDateUTC.getTime() - 6 * 60 * 60 * 1000);
        const maxDateCST = new Date(buildCreationDateCST);
        maxDateCST.setDate(buildCreationDateCST.getDate() + 5); // Add 5 days

        // Convert back to UTC for API query
        const minLastUpdatedDate = buildCreationDateUTC.toISOString();
        const maxLastUpdatedDate = new Date(maxDateCST.getTime() + 6 * 60 * 60 * 1000).toISOString();
        const testRunUrl = `https://dev.azure.com/${organization}/${project}/_apis/test/runs?buildIds=${buildId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
        const testRunResponse = await fetch(testRunUrl, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
            }
        });
        

        if (!testRunResponse.ok) {
           console.log(`Failed to fetch test results: ${testRunResponse.status} ${testRunResponse.statusText}`);
           testResults = []; // Set to empty array on failure
        } else {
            const data = await testRunResponse.json();
            testResults = data.value || [];
        }
    } catch (error) {
        return { error: 'Failed to fetch test results' };
    }
    //#endregion

    //#region Construct build objects if there are multiple test runs
    const buildsToReturn: Build[] = [];

    if (testResults.length === 0) {
        // No test runs found - return the base build with computed status
        build.status = await getBuildPipelineStatus(build);
        build.link = `https://dev.azure.com/${organization}/${project}/_build?definitionId=${buildDefinitionId}&view=mine&_a=summary&buildId=${build.id}`;
        buildsToReturn.push(build);
    } else {
        // Process each test run
        for (const testRun of testResults) {
            const buildCopy: Build = { ...build }; // Shallow copy of build details
            buildCopy.testRunName = testRun.name;
            buildCopy.passedTestCount = testRun.passedTests;
            buildCopy.failedTestCount = testRun.totalTests - testRun.passedTests;
            buildCopy.status = await getBuildPipelineStatus(buildCopy);
            buildCopy.link = `https://dev.azure.com/${organization}/${project}/_build?definitionId=${buildDefinitionId}&view=mine&_a=summary&buildId=${build.id}`;
            buildsToReturn.push(buildCopy);
        }
    }

    //#endregion
        return buildsToReturn;
    }, 3600);
    return json(data);
}