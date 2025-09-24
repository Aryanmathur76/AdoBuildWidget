// This API should take in a date and a build definition ID
// It should then first find the correct build ID for that date and definition
// Then it should fetch the build details and construct a build object
// Then it should call into the test runs api and aggregate test results for the build
// It should then return the build object with test results included

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';
import type { Build } from '$lib/types/build';
import {getBuildPipelineStatus} from '$lib/utils/getBuildPipelineStatus';

export async function GET({ url }: { url: URL }) {

    const date = url.searchParams.get('date');
    const buildDefinitionId = url.searchParams.get('buildDefinitionId');

    //#region Input validation
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json({ error: 'Invalid or missing date (YYYY-MM-DD required)' }, { status: 400 });
    }

    if (!buildDefinitionId || typeof buildDefinitionId !== 'string' || !/^\d+$/.test(buildDefinitionId)) {
        return json({ error: 'Missing or invalid buildDefinitionId (numeric string required)' }, { status: 400 });
    }

    let organization, project, pat;
    try {
        const envVars = getAzureDevOpsEnvVars(env);
        organization = envVars.AZURE_DEVOPS_ORGANIZATION;
        project = envVars.AZURE_DEVOPS_PROJECT;
        pat = envVars.AZURE_DEVOPS_PAT;
    } 
    catch (e: any) {
        return json({ error: 'Missing Azure DevOps environment variables' }, { status: 500 });
    }

    if (!organization || !project || !pat) {
        return json({ error: 'Missing Azure DevOps environment variables' }, { status: 500 });
    }
    //#endregion

    //#region First step is to get the correct build ID given the date and definition ID
    let buildId: number;
    try {
        const minTime = `${date}T00:00:00Z`;
        const maxTime = `${date}T23:59:59Z`;
        const branchName = 'refs/heads/trunk'; // or your desired branch
        const apiUrl = `https://dev.azure.com/${organization}/${project}/_apis/build/builds?definitions=${buildDefinitionId}&minTime=${encodeURIComponent(minTime)}&maxTime=${encodeURIComponent(maxTime)}&queryOrder=queueTimeDescending&$top=10&branchName=${encodeURIComponent(branchName)}&api-version=7.1`;

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
        const builds = data.value as Build[];

        // The build with the latest startTime on that day is the one we want
        const latestBuild = builds[0];
        if (!latestBuild) {
            return json({ buildId: null, message: 'No build found for this day' });
        }
        buildId = latestBuild.id;
    } catch (error) {
        return json({ error: 'Failed to fetch build ID' }, { status: 500 });
    }
    //#endregion

    //#region Second step is to get the build details
    let buildDetails: Build | null;
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
            return json({ error: 'No build details found' }, { status: 404 });
        }
    } catch (error) {
        return json({ error: 'Failed to fetch build details' }, { status: 500 });
    }

    //Construct a build object
    const build: Build = {
        id: buildDetails.id,
        name: buildDetails.name,
        status: buildDetails.status, // Use actual Azure DevOps status instead of hardcoding 'unknown'
        result: buildDetails.result,
        startTime: buildDetails.startTime,
        modifiedOn: buildDetails.modifiedOn
    };

    //#endregion

    //#region Third step is to get the test results
    let testResults: any[] = [];
    try {
        // Fetch test runs for this release - use release creation date as base and add 7 days
        const buildCreationDate = new Date(buildDetails.startTime);
        const maxDate = new Date(buildCreationDate);
        maxDate.setDate(buildCreationDate.getDate() + 7); // Add 7 days

        const minLastUpdatedDate = buildCreationDate.toISOString();
        const maxLastUpdatedDate = maxDate.toISOString();
        const testRunUrl = `https://dev.azure.com/${organization}/${project}/_apis/test/runs?buildIds=${buildId}&minLastUpdatedDate=${encodeURIComponent(minLastUpdatedDate)}&maxLastUpdatedDate=${encodeURIComponent(maxLastUpdatedDate)}&api-version=7.1`;
        const testRunResponse = await fetch(testRunUrl, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
            }
        });
        

        if (!testRunResponse.ok) {
            throw new Error(`Failed to fetch test results: ${testRunResponse.status} ${testRunResponse.statusText}`);
        }

        const data = await testRunResponse.json();
        testResults = data.value;
    } catch (error) {
        return json({ error: 'Failed to fetch test results' }, { status: 500 });
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
    return json(buildsToReturn);
}