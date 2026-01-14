import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';

/**
 * GET /api/getTestRunGraph?planId=1310927&suiteId=123
 * Returns daily aggregated test counts for a specific test plan.
 */

interface DayData {
	date: string;
	totalTests: number;
}

export async function GET({ url }: { url: URL }) {
	try {
		let AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT;
		try {
			({ AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT } = getAzureDevOpsEnvVars(env));
		} catch (e: any) {
			return json({ error: e.message || 'Missing Azure DevOps environment variables' }, { status: 500 });
		}

		const planId = url.searchParams.get('planId');
		const suiteId = url.searchParams.get('suiteId');
		const minRocParam = url.searchParams.get('minRoc');
		const minRoc = minRocParam ? parseFloat(minRocParam) : 0;

		if (!planId) {
			return json({ error: 'Missing planId parameter' }, { status: 400 });
		}

		if (!suiteId) {
			return json({ error: 'Missing suiteId parameter' }, { status: 400 });
		}

		// Fetch all expected test cases from the suite
		const expectedTestCases = await fetchAllTestCasesFromSuite(
			planId,
			suiteId,
			AZURE_DEVOPS_ORGANIZATION,
			AZURE_DEVOPS_PROJECT,
			AZURE_DEVOPS_PAT
		);

		const expectedTestCaseIds = new Set(expectedTestCases.map(tc => tc.workItem.id));

		// Fetch all test runs for the plan
		const runsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs?planId=${planId}&api-version=7.1`;

		const runsRes = await fetch(runsUrl, {
			headers: {
				'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
				'Content-Type': 'application/json',
			},
		});

		if (!runsRes.ok) {
			return json({
				error: 'Failed to fetch test runs',
				details: await runsRes.text()
			}, { status: runsRes.status });
		}

		const runsData = await runsRes.json();
		const allRuns = Array.isArray(runsData.value) ? runsData.value : [];
		
		// Filter out runs with 'development', 'dev', or 'cloned' in their names
		const testRuns = allRuns.filter((run: any) => {
			const name = (run.name || '').toLowerCase();
			return !name.includes('development') && !name.includes('dev') && !name.includes('cloned');
		});

		const dayMap = new Map<string, number>();
		const runsByDate = new Map<string, any[]>(); // Track runs by date for later test case collection

		// Fetch runs in parallel batches for speed
		const batchSize = 50;

		for (let i = 0; i < testRuns.length; i += batchSize) {
			const batch = testRuns.slice(i, i + batchSize);
			
			const batchPromises = batch.map(async (run: { id: any; }) => {
				if (!run.id) return null;

				const runDetailUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs/${run.id}?api-version=7.1`;

				try {
					const runDetailRes = await fetch(runDetailUrl, {
						headers: {
							'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
							'Content-Type': 'application/json',
						},
					});

					if (!runDetailRes.ok) {
						return null;
					}

					return await runDetailRes.json();
				} catch (error) {
					return null;
				}
			});

			const runDetails = await Promise.all(batchPromises);

			for (const runDetail of runDetails) {
				if (!runDetail) continue;

				const runDateStr = runDetail.completedDate || runDetail.startedDate;
				if (runDateStr) {
					const runDate = new Date(runDateStr);
					const dateKey = runDate.toISOString().split('T')[0];

					const currentTotal = dayMap.get(dateKey) || 0;
					dayMap.set(dateKey, currentTotal + (runDetail.totalTests || 0));
					
					// Store the run detail for later test case collection
					if (!runsByDate.has(dateKey)) {
						runsByDate.set(dateKey, []);
					}
					runsByDate.get(dateKey)!.push(runDetail);
				}
			}
		}

		const sortedDays = Array.from(dayMap.entries())
			.map(([date, totalTests]) => ({ date, totalTests }))
			.sort((a, b) => a.date.localeCompare(b.date));

		const filledData: DayData[] = [];
		
		if (sortedDays.length > 0) {
			const startDate = new Date(sortedDays[0].date);
			const endDate = new Date(sortedDays[sortedDays.length - 1].date);
			
			const currentDate = new Date(startDate);
			
			while (currentDate <= endDate) {
				const dateKey = currentDate.toISOString().split('T')[0];
				const existingData = sortedDays.find(d => d.date === dateKey);
				
				if (existingData) {
					filledData.push(existingData);
				} else {
					filledData.push({
						date: dateKey,
						totalTests: 0
					});
				}
				
				currentDate.setDate(currentDate.getDate() + 1);
			}
		}

		const derivatives = calculateDerivatives(filledData);
		const filteredDays = derivatives.filter(d => d.change >= minRoc);
		const groupedDays = groupByWeekWindow(filteredDays);

		// Now collect unique test cases for each grouped day with dynamic buffer expansion
		const daysWithTestCases = await Promise.all(
			groupedDays.map(async (day) => {
				const result = await getTestCasesAroundDateWithBuffer(
					day.date,
					runsByDate,
					AZURE_DEVOPS_ORGANIZATION,
					AZURE_DEVOPS_PROJECT,
					AZURE_DEVOPS_PAT,
					expectedTestCaseIds
				);
				return {
					...day,
					testCaseIds: Array.from(result.foundTestCaseIds).sort((a, b) => a - b),
					testCaseCount: result.foundTestCaseIds.size,
					bufferUsed: result.bufferUsed,
					foundTestCases: Array.from(result.foundTestCaseIds).sort((a, b) => a - b),
					notFoundTestCases: Array.from(result.notFoundTestCaseIds).sort((a, b) => a - b)
				};
			})
		);

		return json({
			planId: parseInt(planId),
			suiteId: parseInt(suiteId),
			totalRuns: testRuns.length,
			minRoc,
			expectedTestCaseCount: expectedTestCaseIds.size,
			expectedTestCaseIds: Array.from(expectedTestCaseIds).sort((a, b) => a - b),
			days: daysWithTestCases
		});

	} catch (error: any) {
		return json({
			error: 'Internal server error',
			details: error.message
		}, { status: 500 });
	}
}

/**
 * Calculate rate of change (derivatives) for each day
 */
function calculateDerivatives(data: DayData[]) {
	if (data.length < 2) {
		return [];
	}

	const result = [];
	for (let i = 1; i < data.length; i++) {
		const change = data[i].totalTests - data[i - 1].totalTests;
		result.push({
			date: data[i].date,
			change: change,
			testsBefore: data[i - 1].totalTests,
			testsAfter: data[i].totalTests
		});
	}

	return result;
}

/**
 * Get unique test case IDs executed within a dynamically expanding buffer window around a specific date.
 * Starts with buffer=0 and expands up to 5 days until all expected test cases are found or max buffer is reached.
 */
async function getTestCasesAroundDateWithBuffer(
	targetDate: string,
	runsByDate: Map<string, any[]>,
	org: string,
	project: string,
	pat: string,
	expectedTestCaseIds: Set<number>
): Promise<{
	foundTestCaseIds: Set<number>;
	notFoundTestCaseIds: Set<number>;
	bufferUsed: number;
}> {
	const MAX_BUFFER = 5;
	
	for (let bufferDays = 0; bufferDays <= MAX_BUFFER; bufferDays++) {
		const testCaseIds = await getTestCasesAroundDate(
			targetDate,
			bufferDays,
			runsByDate,
			org,
			project,
			pat
		);
		
		// Check if we found all expected test cases
		const foundTestCaseIds = new Set<number>();
		const notFoundTestCaseIds = new Set<number>();
		
		for (const expectedId of expectedTestCaseIds) {
			if (testCaseIds.has(expectedId)) {
				foundTestCaseIds.add(expectedId);
			} else {
				notFoundTestCaseIds.add(expectedId);
			}
		}
		
		// If all test cases found, return immediately
		if (notFoundTestCaseIds.size === 0) {
			return {
				foundTestCaseIds,
				notFoundTestCaseIds,
				bufferUsed: bufferDays
			};
		}
		
		// If we've reached max buffer, return what we have
		if (bufferDays === MAX_BUFFER) {
			return {
				foundTestCaseIds,
				notFoundTestCaseIds,
				bufferUsed: bufferDays
			};
		}
	}
	
	// Fallback (should never reach here)
	return {
		foundTestCaseIds: new Set(),
		notFoundTestCaseIds: expectedTestCaseIds,
		bufferUsed: MAX_BUFFER
	};
}

/**
 * Get unique test case IDs executed within a buffer window around a specific date
 */
async function getTestCasesAroundDate(
	targetDate: string,
	bufferDays: number,
	runsByDate: Map<string, any[]>,
	org: string,
	project: string,
	pat: string
): Promise<Set<number>> {
	const testCaseIds = new Set<number>();
	const target = new Date(targetDate);
	
	// Iterate through dates within the buffer window
	for (let offset = -bufferDays; offset <= bufferDays; offset++) {
		const checkDate = new Date(target);
		checkDate.setDate(checkDate.getDate() + offset);
		const dateKey = checkDate.toISOString().split('T')[0];
		
		const runsForDay = runsByDate.get(dateKey);
		if (!runsForDay || runsForDay.length === 0) continue;
		
		// Fetch test results for each run on this day
		for (const run of runsForDay) {
			try {
				const resultsUrl = `https://dev.azure.com/${org}/${project}/_apis/test/runs/${run.id}/results?api-version=7.1`;
				
				const resultsRes = await fetch(resultsUrl, {
					headers: {
						'Authorization': `Basic ${btoa(':' + pat)}`,
						'Content-Type': 'application/json',
					},
				});
				
				if (resultsRes.ok) {
					const resultsData = await resultsRes.json();
					if (Array.isArray(resultsData.value)) {
						for (const result of resultsData.value) {
							if (result.testCase && result.testCase.id) {
								testCaseIds.add(parseInt(result.testCase.id));
							}
						}
					}
				}
			} catch (error) {
				// Continue on error, just skip this run
				console.error(`Error fetching test results for run ${run.id}:`, error);
			}
		}
	}
	
	return testCaseIds;
}

/**
 * Fetch all test cases from a suite using the getAllTestCases API
 */
async function fetchAllTestCasesFromSuite(
	testPlanId: string,
	suiteId: string,
	org: string,
	project: string,
	pat: string
): Promise<Array<{ workItem: { id: number; name: string } }>> {
	const allTestCases: Array<{ workItem: { id: number; name: string } }> = [];
	
	// Recursively fetch test cases from suite and all child suites
	const fetchSuiteTestCases = async (currentSuiteId: string) => {
		// Fetch test cases for this suite
		let continuationToken: string | null = null;
		
		do {
			let testCasesUrl = `https://dev.azure.com/${org}/${project}/_apis/testplan/Plans/${testPlanId}/Suites/${currentSuiteId}/TestCase?api-version=7.1`;
			
			if (continuationToken) {
				testCasesUrl += `&continuationToken=${encodeURIComponent(continuationToken)}`;
			}

			const testCasesRes = await fetch(testCasesUrl, {
				headers: {
					'Authorization': `Basic ${btoa(':' + pat)}`,
					'Content-Type': 'application/json',
				},
			});

			if (testCasesRes.ok) {
				const testCasesData = await testCasesRes.json();
				
				if (Array.isArray(testCasesData.value)) {
					allTestCases.push(...testCasesData.value);
				}

				continuationToken = testCasesRes.headers.get('x-ms-continuationtoken');
			} else {
				break;
			}
			
		} while (continuationToken);
	};
	
	// Fetch all suites to find child suites
	const allSuites: Array<{ id: number; parentSuite?: { id: number } }> = [];
	let suiteContinuationToken: string | null = null;

	do {
		let allSuitesUrl = `https://dev.azure.com/${org}/${project}/_apis/testplan/Plans/${testPlanId}/suites?api-version=7.1`;
		
		if (suiteContinuationToken) {
			allSuitesUrl += `&continuationToken=${encodeURIComponent(suiteContinuationToken)}`;
		}

		const allSuitesRes = await fetch(allSuitesUrl, {
			headers: {
				'Authorization': `Basic ${btoa(':' + pat)}`,
				'Content-Type': 'application/json',
			},
		});

		if (allSuitesRes.ok) {
			const allSuitesData = await allSuitesRes.json();
			
			if (Array.isArray(allSuitesData.value)) {
				allSuites.push(...allSuitesData.value);
			}

			suiteContinuationToken = allSuitesRes.headers.get('x-ms-continuationtoken');
		} else {
			break;
		}
		
	} while (suiteContinuationToken);

	// Recursively find all child suite IDs
	const findChildSuites = (parentId: number): number[] => {
		const children = allSuites
			.filter(s => s.parentSuite?.id === parentId)
			.map(s => s.id);
		
		const allChildren = [...children];
		for (const childId of children) {
			allChildren.push(...findChildSuites(childId));
		}
		
		return allChildren;
	};

	// Get all suite IDs (current suite + all descendants)
	const suiteIds = [parseInt(suiteId), ...findChildSuites(parseInt(suiteId))];
	
	// Fetch test cases from all suites
	for (const id of suiteIds) {
		await fetchSuiteTestCases(id.toString());
	}
	
	return allTestCases;
}

/**
 * Group consecutive dates within 1-week windows and return the median date from each group
 */
function groupByWeekWindow(days: Array<{ date: string; change: number; testsBefore: number; testsAfter: number }>) {
	if (days.length === 0) return [];

	const result = [];
	let currentGroup = [days[0]];

	for (let i = 1; i < days.length; i++) {
		const groupFirstDate = new Date(currentGroup[0].date);
		const currDate = new Date(days[i].date);
		const daysDiff = Math.abs((currDate.getTime() - groupFirstDate.getTime()) / (1000 * 60 * 60 * 24));

		if (daysDiff <= 7) {
			// Within 1 week of group start, add to current group
			currentGroup.push(days[i]);
		} else {
			// Outside window, calculate median date of current group and start new group
			result.push(getMedianDate(currentGroup));
			currentGroup = [days[i]];
		}
	}

	// Don't forget the last group
	if (currentGroup.length > 0) {
		result.push(getMedianDate(currentGroup));
	}

	return result;
}

/**
 * Calculate the median date from a group of days
 */
function getMedianDate(group: Array<{ date: string; change: number; testsBefore: number; testsAfter: number }>) {
	if (group.length === 1) return group[0];

	const firstDate = new Date(group[0].date);
	const lastDate = new Date(group[group.length - 1].date);
	const medianTime = (firstDate.getTime() + lastDate.getTime()) / 2;

	// Find the day in the group closest to the median time
	let closestDay = group[0];
	let minDiff = Math.abs(new Date(closestDay.date).getTime() - medianTime);

	for (const day of group) {
		const diff = Math.abs(new Date(day.date).getTime() - medianTime);
		if (diff < minDiff) {
			minDiff = diff;
			closestDay = day;
		}
	}

	return closestDay;
}
