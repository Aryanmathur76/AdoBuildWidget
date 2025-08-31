import { json } from '@sveltejs/kit';
import { AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT } from '$env/static/private';

/**
 * GET /api/test-cases?runId=123
 * Returns all test cases for a given test run id, including name, outcome, and associated bugs.
 */
type AzureTestCaseResult = {
    id: number;
    testCaseTitle: string;
    outcome: string;
    associatedBugs?: unknown[];
};

export async function GET({ url }) {
    const runId = url.searchParams.get('runId');
    if (!runId) {
        return json({ error: 'Missing runId parameter' }, { status: 400 });
    }

    const endpoint = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/Runs/${runId}/results?api-version=7.1`;
    const res = await fetch(endpoint, {
        headers: {
            'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
            'Content-Type': 'application/json',
        },
    });

    if (!res.ok) {
        return json({ error: 'Failed to fetch test case results', details: await res.text() }, { status: res.status });
    }


    const data = await res.json();
    // data.value is an array of test case results
    type AzureTestCaseApiResult = {
        id: number;
        testCaseTitle?: string;
        outcome: string;
        associatedBugs?: unknown[];
        testCase?: { name?: string };
    };
    const testCases = (data.value || []).map((tc: AzureTestCaseApiResult) => ({
        id: tc.id,
        name: tc.testCase?.name || tc.testCaseTitle || '',
        outcome: tc.outcome,
        associatedBugs: tc.associatedBugs || [],
    }));

    return json({ testCases });
}
