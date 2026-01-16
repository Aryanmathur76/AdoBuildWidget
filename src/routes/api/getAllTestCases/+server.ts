import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';
import type { TestSuite, TestCase } from '$lib/types/getAllTestCases';
import { fetchAllSuites, fetchSuiteWithChildrenAndTestCases } from '$lib/utils/getAllTestCases';

/**
 * GET /api/getAllTestCases?testPlanId=123&suiteId=456
 * Returns a specific test suite and its child suites with their test cases.
 * Handles pagination using continuationToken from Azure DevOps API.
 */

interface TestSuite {
	id: number;
	name: string;
	suiteType: string;
	testCases?: TestCase[];
	childSuites?: TestSuite[];
	parentSuite?: {
		id: number;
		name?: string;
	};
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
		const suiteId = url.searchParams.get('suiteId');
		
		if (!testPlanId) {
			return json({ error: 'Missing testPlanId parameter' }, { status: 400 });
		}
		
		if (!suiteId) {
			return json({ error: 'Missing suiteId parameter' }, { status: 400 });
		}

		// Fetch all suites from the test plan once (with pagination)
		let allSuites: TestSuite[] = [];
		try {
			allSuites = await fetchAllSuites({ organization: AZURE_DEVOPS_ORGANIZATION, project: AZURE_DEVOPS_PROJECT, pat: AZURE_DEVOPS_PAT }, testPlanId);
		} catch (e: any) {
			return json({ error: e.message || 'Failed to fetch test suites' }, { status: 500 });
		}

		console.log(`Fetched ${allSuites.length} total suites from test plan`);

		// Recursively fetch the specific suite, all its child suites, and test cases
		const suite = await fetchSuiteWithChildrenAndTestCases({ organization: AZURE_DEVOPS_ORGANIZATION, project: AZURE_DEVOPS_PROJECT, pat: AZURE_DEVOPS_PAT }, testPlanId, suiteId, allSuites);

		if (!suite) {
			return json({ 
				error: 'Failed to fetch test suite' 
			}, { status: 404 });
		}

		// Count total suites and test cases recursively
		let totalSuites = 0;
		let totalTestCases = 0;
		const countSuitesAndTestCases = (s: TestSuite) => {
			totalSuites++;
			totalTestCases += s.testCases?.length || 0;
			if (s.childSuites && Array.isArray(s.childSuites)) {
				s.childSuites.forEach(countSuitesAndTestCases);
			}
		};
		countSuitesAndTestCases(suite);

		return json({
			testPlanId: parseInt(testPlanId),
			suiteId: parseInt(suiteId),
			totalSuites: totalSuites,
			totalTestCases,
			suite: suite // Return the main suite with nested structure
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
 * Recursively fetches a suite, all its child suites, and test cases for each.
 */
async function fetchSuiteWithChildrenAndTestCases(
	organization: string,
	project: string,
	pat: string,
	testPlanId: string,
	suiteId: string,
	allSuites: TestSuite[]
): Promise<TestSuite | null> {
	try {
		// Find this suite in the allSuites array
		const suite = allSuites.find(s => s.id.toString() === suiteId);
		
		if (!suite) {
			console.error(`Suite ${suiteId} not found in test plan`);
			return null;
		}

		// Fetch test cases for this suite (IMPORTANT: Every suite gets its test cases)
		suite.testCases = await fetchTestCasesForSuite(
			organization,
			project,
			pat,
			testPlanId,
			suiteId
		);

		console.log(`Suite ${suite.name} (${suite.id}) has ${suite.testCases.length} test cases`);

		// Filter to get only direct children of this suite
		const directChildren = allSuites.filter(s => s.parentSuite?.id === suite.id);
		
		if (directChildren.length > 0) {
			console.log(`Suite ${suite.name} has ${directChildren.length} child suites`);
			
			// Recursively fetch each child suite with its descendants and test cases
			const childSuitePromises = directChildren.map(childSuite => 
				fetchSuiteWithChildrenAndTestCases(
					organization,
					project,
					pat,
					testPlanId,
					childSuite.id.toString(),
					allSuites
				)
			);
			
			const fetchedChildren = await Promise.all(childSuitePromises);
			suite.childSuites = fetchedChildren.filter((child): child is TestSuite => child !== null);
		} else {
			suite.childSuites = [];
		}

		return suite;
	} catch (error) {
		console.error(`Error fetching suite ${suiteId}:`, error);
		return null;
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
