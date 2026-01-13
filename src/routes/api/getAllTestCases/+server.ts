import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';

/**
 * GET /api/getAllTestCases?testPlanId=123
 * Returns all test suites and their test cases for a given test plan.
 * Handles pagination using continuationToken from Azure DevOps API.
 */

interface TestSuite {
	id: number;
	name: string;
	suiteType: string;
	testCases?: TestCase[];
	childSuites?: TestSuite[];
}

interface TestCase {
	id: number;
	name: string;
	workItem: {
		id: number;
		name: string;
	};
}

export async function GET({ url }: { url: URL }) {
	try {
		let AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT;
		try {
			({ AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT } = getAzureDevOpsEnvVars(env));
		} catch (e: any) {
			return json({ error: e.message || 'Missing Azure DevOps environment variables' }, { status: 500 });
		}

		const testPlanId = url.searchParams.get('testPlanId');
		if (!testPlanId) {
			return json({ error: 'Missing testPlanId parameter' }, { status: 400 });
		}

		// Fetch all test suites with pagination
		const allSuites: TestSuite[] = [];
		let continuationToken: string | null = null;

		do {
			let suitesUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/testplan/Plans/${testPlanId}/suites?api-version=7.1`;
			
			if (continuationToken) {
				suitesUrl += `&continuationToken=${encodeURIComponent(continuationToken)}`;
			}

			const suitesRes = await fetch(suitesUrl, {
				headers: {
					'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
					'Content-Type': 'application/json',
				},
			});

			if (!suitesRes.ok) {
				return json({ 
					error: 'Failed to fetch test suites', 
					details: await suitesRes.text() 
				}, { status: suitesRes.status });
			}

			const suitesData = await suitesRes.json();
			
			if (Array.isArray(suitesData.value)) {
				allSuites.push(...suitesData.value);
			}

			// Check for continuation token in response headers
			continuationToken = suitesRes.headers.get('x-ms-continuationtoken');
			
		} while (continuationToken);

		// Now fetch test cases for each suite
		let totalTestCases = 0;
		for (const suite of allSuites) {
			if (suite.id) {
				const testCases = await fetchTestCasesForSuite(
					AZURE_DEVOPS_ORGANIZATION,
					AZURE_DEVOPS_PROJECT,
					AZURE_DEVOPS_PAT,
					testPlanId,
					suite.id.toString()
				);
				suite.testCases = testCases;
				totalTestCases += testCases.length;
			}
		}

		return json({
			testPlanId: parseInt(testPlanId),
			totalSuites: allSuites.length,
			totalTestCases,
			suites: allSuites
		});

	} catch (error: any) {
		console.error('Error fetching test suites and cases:', error);
		return json({ 
			error: 'Internal server error', 
			details: error.message 
		}, { status: 500 });
	}
}

/**
 * Fetches all test cases for a specific test suite with pagination.
 */
async function fetchTestCasesForSuite(
	organization: string,
	project: string,
	pat: string,
	testPlanId: string,
	suiteId: string
): Promise<TestCase[]> {
	const allTestCases: TestCase[] = [];
	let continuationToken: string | null = null;

	do {
		let testCasesUrl = `https://dev.azure.com/${organization}/${project}/_apis/testplan/Plans/${testPlanId}/Suites/${suiteId}/TestCase?api-version=7.1`;
		
		if (continuationToken) {
			testCasesUrl += `&continuationToken=${encodeURIComponent(continuationToken)}`;
		}

		const testCasesRes = await fetch(testCasesUrl, {
			headers: {
				'Authorization': `Basic ${btoa(':' + pat)}`,
				'Content-Type': 'application/json',
			},
		});

		if (!testCasesRes.ok) {
			console.error(`Failed to fetch test cases for suite ${suiteId}`);
			break;
		}

		const testCasesData = await testCasesRes.json();
		
		if (Array.isArray(testCasesData.value)) {
			allTestCases.push(...testCasesData.value);
		}

		// Check for continuation token in response headers
		continuationToken = testCasesRes.headers.get('x-ms-continuationtoken');
		
	} while (continuationToken);

	return allTestCases;
}
