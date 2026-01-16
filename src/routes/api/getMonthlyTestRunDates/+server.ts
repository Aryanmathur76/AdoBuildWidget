import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';
import { calculateDerivatives, groupByWeekWindow, determineExecutionBoundaries, calculatePassRates, getMedianDate } from '$lib/utils/monthlyTestRuns';
import type { DayData } from '$lib/types/monthlyTestRuns';

export async function GET({ url }: { url: URL }) {
	const streamMode = url.searchParams.get('stream') === 'true';
	
	// If streaming is enabled, return a streaming response
	if (streamMode) {
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				
				const sendProgress = (stage: string, message: string, progress?: number, completed?: boolean) => {
					const data = JSON.stringify({ 
						type: 'progress', 
						stage, 
						message, 
						progress: progress || 0,
						completed: completed || false
					});
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				};

				const sendComplete = (data: any) => {
					const msg = JSON.stringify({ type: 'complete', data });
					controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
					controller.close();
				};

				const sendError = (error: string) => {
					const msg = JSON.stringify({ type: 'error', error });
					controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
					controller.close();
				};

				try {
					const result = await getMonthlyTestData(url, sendProgress);
					sendComplete(result);
				} catch (error: any) {
					sendError(error.message || 'Internal server error');
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
			}
		});
	}
	
	// Non-streaming mode - original behavior
	try {
		const result = await getMonthlyTestData(url);
		return json(result);
	} catch (error: any) {
		return json({
			error: 'Internal server error',
			details: error.message
		}, { status: 500 });
	}
}

async function getMonthlyTestData(url: URL, sendProgress?: (stage: string, message: string, progress?: number, completed?: boolean) => void) {
	try {
		let AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT;
		try {
			({ AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT } = getAzureDevOpsEnvVars(env));
		} catch (e: any) {
			throw new Error(e.message || 'Missing Azure DevOps environment variables');
		}

		const planId = url.searchParams.get('planId');
		const suiteId = url.searchParams.get('suiteId');

		// minRoc will be computed after fetching expected test cases (25% of expected count)
		let minRoc = 0;

		const processingConcurrencyParam = url.searchParams.get('processingConcurrency');
		const processingConcurrency = processingConcurrencyParam ? Math.max(1, parseInt(processingConcurrencyParam)) : 20;

		if (!planId) {
			throw new Error('Missing planId parameter');
		}

		if (!suiteId) {
			throw new Error('Missing suiteId parameter');
		}

		// Stage 1: Fetch test cases from suite (and all descendants)
		sendProgress?.('Fetching Test Cases', 'Loading expected test cases from suite...', 0);
		const expectedTestCases = await fetchAllTestCasesFromSuite(
			planId,
			suiteId,
			AZURE_DEVOPS_ORGANIZATION,
			AZURE_DEVOPS_PROJECT,
			AZURE_DEVOPS_PAT
		);
		sendProgress?.('Fetching Test Cases', `Loaded ${expectedTestCases.length} expected test cases`, 100, true);

		// Compute minRoc as 25% of expected test cases (rounded up)
		minRoc = Math.max(1, Math.ceil(expectedTestCases.length * 0.25));
		sendProgress?.('Fetching Test Cases', `Computed minRoc = ${minRoc} (25% of ${expectedTestCases.length})`, 100, true);

		// Set of all valid test case IDs for the suite (and descendants)
		const validTestCaseIds = new Set(expectedTestCases.map(tc => tc.workItem.id));

		// Create a map of test case ID to name for quick lookup
		const testCaseIdToName = new Map<number, string>();
		for (const tc of expectedTestCases) {
			testCaseIdToName.set(tc.workItem.id, tc.workItem.name);
		}

		// Stage 2: Fetch all test runs for the plan
		sendProgress?.('Fetching Test Runs', 'Fetching and filtering test runs for the plan...', 0);
		const runsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs?planId=${planId}&api-version=7.1`;

		const runsRes = await fetch(runsUrl, {
			headers: {
				'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
				'Content-Type': 'application/json',
			},
		});

		if (!runsRes.ok) {
			throw new Error(`Failed to fetch test runs: ${runsRes.status}`);
		}

		const runsData = await runsRes.json();
		const allRuns = Array.isArray(runsData.value) ? runsData.value : [];

		// Filter out runs with 'development', 'dev', or 'cloned' in their names
		let testRuns = allRuns.filter((run: any) => {
			const name = (run.name || '').toLowerCase();
			return !name.includes('development') && !name.includes('dev') && !name.includes('cloned');
		});

		// For each run, fetch the executed test cases and filter out runs with any test case not in the suite
		// Use the same stage name so the UI shows a single combined stage
		sendProgress?.('Fetching Test Runs', 'Filtering test runs to only those with test cases in the suite...', 0);
		const filteredRuns: any[] = [];
		let filteredCount = 0;
		const filterBatchSize = 100;
		for (let i = 0; i < testRuns.length; i += filterBatchSize) {
			const batch = testRuns.slice(i, i + filterBatchSize);
			const batchPromises = batch.map(async (run: any) => {
				const resultsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs/${run.id}/results?api-version=7.1`;
				try {
					const resultsRes = await fetch(resultsUrl, {
						headers: {
							'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
							'Content-Type': 'application/json',
						},
					});
					if (resultsRes.ok) {
						const resultsData = await resultsRes.json();
						const executedTestCaseIds = new Set((resultsData.value || []).map((r: any) => parseInt(r.testCase?.id)));
						// If any executed test case is not in the suite, skip this run
						let allInSuite = true;
						for (const id of executedTestCaseIds) {
							if (!validTestCaseIds.has(Number(id))) {
								allInSuite = false;
								break;
							}
						}
						if (allInSuite) {
							return run;
						} else {
							filteredCount++;
							return null;
						}
					}
				} catch (e) {
					filteredCount++;
				}
				return null;
			});
			const batchResults = await Promise.all(batchPromises);
			for (const result of batchResults) {
				if (result) filteredRuns.push(result);
			}
			sendProgress?.('Fetching Test Runs', `Filtered ${Math.min(i + filterBatchSize, testRuns.length)} of ${testRuns.length} runs...`, Math.round((Math.min(i + filterBatchSize, testRuns.length) / testRuns.length) * 100));
		}
		testRuns = filteredRuns;
		sendProgress?.('Fetching Test Runs', `Filtered out ${filteredCount} runs with cases outside the suite. ${testRuns.length} runs remain.`, 100, true);

		// Mark fetching/filtering as completed before starting next stage
		sendProgress?.('Fetching Test Runs', 'Completed fetching and filtering test runs.', 100, true);

		const dayMap = new Map<string, number>();
		const runsByDate = new Map<string, any[]>(); // Track runs by date for later test case collection
		const runResultsCache = new Map<number, any[]>(); // Cache results for runs to avoid duplicate fetches
		const testCaseExecutionDates = new Map<number, Set<string>>(); // Track when each expected test case was executed
		let earliestTestCaseDate: string | null = null;
		let latestTestCaseDate: string | null = null;

		// Stage 3: Process test runs with concurrency-limited parallelism
		sendProgress?.('Processing Test Runs', `Processing ${testRuns.length} test runs with concurrency ${processingConcurrency}...`, 0);

		let completed = 0;
		const updateEvery = Math.max(1, Math.floor(testRuns.length / 50));

		// concurrency-limited async pool
		async function asyncPool<T, R>(limit: number, list: T[], iteratorFn: (item: T) => Promise<R | null>) {
			const results: Array<R | null> = new Array(list.length).fill(null);
			let i = 0;
			const workers = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
				while (true) {
					const idx = i++;
					if (idx >= list.length) break;
					try {
						results[idx] = await iteratorFn(list[idx]);
					} catch (e) {
						results[idx] = null;
					}
					completed++;
					if (completed % updateEvery === 0 || completed === list.length) {
						const prog = Math.round((completed / list.length) * 100);
						sendProgress?.('Processing Test Runs', `Processed ${completed} of ${list.length} runs...`, prog);
					}
				}
			});
			await Promise.all(workers);
			return results;
		}

		// iteratorFn: fetch run detail and results (use cache) and update maps
		const processRun = async (run: any) => {
			if (!run || !run.id) return null;
			const runId = run.id;
			const runDetailUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs/${runId}?api-version=7.1`;
			const resultsUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/runs/${runId}/results?api-version=7.1`;
			let runDetail: any = null;
			let results: any[] | undefined = runResultsCache.get(runId);
			try {
				// Fetch run detail
				const rdRes = await fetch(runDetailUrl, {
					headers: {
						'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
						'Content-Type': 'application/json'
					}
				});
				if (rdRes.ok) runDetail = await rdRes.json();
			} catch (e) {
				// ignore
			}

			// Fetch results if not cached
			if (!results) {
				try {
					const resRes = await fetch(resultsUrl, {
						headers: {
							'Authorization': `Basic ${btoa(':' + AZURE_DEVOPS_PAT)}`,
							'Content-Type': 'application/json'
						}
					});
					if (resRes.ok) {
						const resData = await resRes.json();
						results = resData.value || [];
						runResultsCache.set(runId, results || []);
					}
				} catch (e) {
					console.error(`Error fetching test results for run ${runId}:`, e);
				}
			}

			if (!runDetail) return null;

			const runDateStr = runDetail.completedDate || runDetail.startedDate;
			if (runDateStr) {
				const runDate = new Date(runDateStr);
				const dateKey = runDate.toISOString().split('T')[0];

				const currentTotal = dayMap.get(dateKey) || 0;
				dayMap.set(dateKey, currentTotal + (runDetail.totalTests || 0));

				if (!runsByDate.has(dateKey)) runsByDate.set(dateKey, []);
				runsByDate.get(dateKey)!.push(runDetail);

				if (Array.isArray(results)) {
					for (const result of results) {
						if (result.testCase && result.testCase.id) {
							const testCaseId = parseInt(result.testCase.id);
							// Only track if this is a valid test case for the suite
							if (validTestCaseIds.has(testCaseId)) {
								if (!testCaseExecutionDates.has(testCaseId)) testCaseExecutionDates.set(testCaseId, new Set());
								testCaseExecutionDates.get(testCaseId)!.add(dateKey);
								if (!earliestTestCaseDate || dateKey < earliestTestCaseDate) earliestTestCaseDate = dateKey;
								if (!latestTestCaseDate || dateKey > latestTestCaseDate) latestTestCaseDate = dateKey;
							}
						}
					}
				}
			}

			return runDetail;
		};

		await asyncPool(processingConcurrency, testRuns, processRun);
		sendProgress?.('Processing Test Runs', `Processed all ${testRuns.length} test runs`, 100, true);

		const sortedDays = Array.from(dayMap.entries())
			.map(([date, totalTests]) => ({ date, totalTests }))
			.sort((a, b) => a.date.localeCompare(b.date));

		// Stage 4: Calculate derivatives and filter
		sendProgress?.('Analyzing Data', 'Calculating rate of change and filtering significant runs...', 50);
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
		sendProgress?.('Analyzing Data', `Found ${groupedDays.length} monthly runs to analyze`, 100, true);

		// Stage 5: Collect test case details for each monthly run
		sendProgress?.('Collecting Test Details', `Analyzing ${groupedDays.length} monthly runs...`, 0);
		const totalRuns = groupedDays.length;
		
		// Process each run sequentially to show proper progress
		const daysWithTestCases = [];
		for (let index = 0; index < groupedDays.length; index++) {
			const day = groupedDays[index];
			const progress = Math.round(((index + 1) / totalRuns) * 100);
			sendProgress?.('Collecting Test Details', `Processing run ${index + 1} of ${totalRuns} (${day.date})...`, progress);
			
			const result = await getTestCasesAroundDateWithBuffer(
				day.date,
				runsByDate,
				AZURE_DEVOPS_ORGANIZATION,
				AZURE_DEVOPS_PROJECT,
				AZURE_DEVOPS_PAT,
				validTestCaseIds,
				runResultsCache
			);

			// Determine actual execution boundaries for this monthly run
			const boundaries = determineExecutionBoundaries(
				day.date,
				result.bufferUsed,
				result.executionDates
			);

			// Identify flaky test cases (executed more than once)
			const flakyTests: Array<{ testCaseId: number; testCaseName: string; executionCount: number }> = [];
			for (const [testCaseId, count] of result.executionCounts.entries()) {
				if (count > 1) {
					flakyTests.push({ 
						testCaseId, 
						testCaseName: testCaseIdToName.get(testCaseId) || 'Unknown',
						executionCount: count 
					});
				}
			}
			flakyTests.sort((a, b) => b.executionCount - a.executionCount); // Sort by execution count descending

			// Calculate pass rates
			const passRates = calculatePassRates(
				result.foundTestCaseIds,
				result.testCaseExecutions
			);

			// Identify test cases that were run but are not in the test plan
			const casesRunThatAreNotInTestPlan: Array<{ testCaseId: number; testCaseName: string }> = [];
			for (const testCaseId of result.allExecutedTestCaseIds) {
				if (!validTestCaseIds.has(testCaseId)) {
					casesRunThatAreNotInTestPlan.push({ 
						testCaseId,
						testCaseName: 'Not in test plan - fetch details if needed'
					});
				}
			}
			casesRunThatAreNotInTestPlan.sort((a, b) => a.testCaseId - b.testCaseId);

			// Create detailed test case info for found and not found
			const foundTestCasesWithNames = Array.from(result.foundTestCaseIds)
				.map(id => ({ testCaseId: id, testCaseName: testCaseIdToName.get(id) || 'Unknown' }))
				.sort((a, b) => a.testCaseId - b.testCaseId);

			const notFoundTestCasesWithNames = Array.from(result.notFoundTestCaseIds)
				.map(id => ({ testCaseId: id, testCaseName: testCaseIdToName.get(id) || 'Unknown' }))
				.sort((a, b) => a.testCaseId - b.testCaseId);

			daysWithTestCases.push({
				date: day.date,
				testCaseCount: result.foundTestCaseIds.size,
				bufferUsed: result.bufferUsed,
				foundTestCases: foundTestCasesWithNames,
				notFoundTestCases: notFoundTestCasesWithNames,
				casesRunThatAreNotInTestPlan: casesRunThatAreNotInTestPlan,
				flakyTests: flakyTests,
				flakyTestCount: flakyTests.length,
				passRates: {
					initialPassRate: passRates.initialPassRate,
					finalPassRate: passRates.finalPassRate,
					initialPassedCount: passRates.initialPassedCount,
					finalPassedCount: passRates.finalPassedCount,
					totalTestsFound: passRates.totalTestsFound
				},
				runBoundaries: {
					startDate: boundaries.startDate,
					endDate: boundaries.endDate,
					durationDays: boundaries.durationDays
				}
			});
		}
		sendProgress?.('Collecting Test Details', `Completed analysis of all ${totalRuns} monthly runs`, 100, true);

		// Stage 6: Calculate final statistics
		sendProgress?.('Finalizing Results', 'Calculating test execution statistics...', 100, true);
		
		// Calculate test case execution statistics
		const executedTestCaseIds = Array.from(testCaseExecutionDates.keys()).map(Number);
		const neverExecutedTestCaseIds = Array.from(validTestCaseIds).map(Number).filter(id => !testCaseExecutionDates.has(id));

		// Calculate duration if we have both boundaries
		let durationDays = null;
		if (earliestTestCaseDate && latestTestCaseDate) {
			const start = new Date(earliestTestCaseDate);
			const end = new Date(latestTestCaseDate);
			durationDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
		}

		return {
			planId: parseInt(planId),
			suiteId: parseInt(suiteId),
			totalRuns: testRuns.length,
			minRoc,
			overallBoundaries: {
				startDate: earliestTestCaseDate,
				endDate: latestTestCaseDate,
				durationDays: durationDays
			},
			testCaseSummary: {
				expectedCount: validTestCaseIds.size,
				executedCount: executedTestCaseIds.length,
				neverExecutedCount: neverExecutedTestCaseIds.length,
				expectedTestCaseIds: Array.from(validTestCaseIds).map(Number).sort((a, b) => a - b),
				executedTestCaseIds: executedTestCaseIds.sort((a, b) => a - b),
				neverExecutedTestCaseIds: neverExecutedTestCaseIds.sort((a, b) => a - b)
			},
			monthlyRuns: daysWithTestCases
		};

	} catch (error: any) {
		throw error;
	}
}

/**
 * Original non-streaming GET handler wrapper (kept for compatibility)
 */
async function handleNonStreamingRequest({ url }: { url: URL }) {
	try {
		const result = await getMonthlyTestData(url);
		return json(result);
	} catch (error: any) {
		return json({
			error: 'Internal server error',
			details: error.message
		}, { status: 500 });
	}
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
	expectedTestCaseIds: Set<number>,
	runResultsCache: Map<number, any[]> // cache of runId -> results
): Promise<{
	foundTestCaseIds: Set<number>;
	notFoundTestCaseIds: Set<number>;
	bufferUsed: number;
	executionDates: Set<string>;
	executionCounts: Map<number, number>;
	testCaseExecutions: Map<number, Array<{ outcome: string; completedDate: string }>>;
	allExecutedTestCaseIds: Set<number>;
}> {
	const MAX_BUFFER = 5;
	
	for (let bufferDays = 0; bufferDays <= MAX_BUFFER; bufferDays++) {
		const result = await getTestCasesAroundDate(
			targetDate,
			bufferDays,
			runsByDate,
			org,
			project,
			pat,
			expectedTestCaseIds,
			runResultsCache
		);
		
		// Check if we found all expected test cases
		const foundTestCaseIds = new Set<number>();
		const notFoundTestCaseIds = new Set<number>();
		
		for (const expectedId of expectedTestCaseIds) {
			if (result.testCaseIds.has(expectedId)) {
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
				bufferUsed: bufferDays,
				executionDates: result.executionDates,
				executionCounts: result.executionCounts,
				testCaseExecutions: result.testCaseExecutions,
				allExecutedTestCaseIds: result.testCaseIds
			};
		}
		
		// If we've reached max buffer, return what we have
		if (bufferDays === MAX_BUFFER) {
			return {
				foundTestCaseIds,
				notFoundTestCaseIds,
				bufferUsed: bufferDays,
				executionDates: result.executionDates,
				executionCounts: result.executionCounts,
				testCaseExecutions: result.testCaseExecutions,
				allExecutedTestCaseIds: result.testCaseIds
			};
		}
	}
	
	// Fallback (should never reach here)
	return {
		foundTestCaseIds: new Set(),
		notFoundTestCaseIds: expectedTestCaseIds,
		bufferUsed: MAX_BUFFER,
		executionDates: new Set(),
		executionCounts: new Map(),
		testCaseExecutions: new Map(),
		allExecutedTestCaseIds: new Set()
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
	pat: string,
	expectedTestCaseIds?: Set<number>,
	runResultsCache?: Map<number, any[]>,
	concurrency: number = 20
): Promise<{ 
	testCaseIds: Set<number>; 
	executionDates: Set<string>; 
	executionCounts: Map<number, number>;
	testCaseExecutions: Map<number, Array<{ outcome: string; completedDate: string }>>;
}> {
	const testCaseIds = new Set<number>();
	const executionDates = new Set<string>();
	const executionCounts = new Map<number, number>();
	const testCaseExecutions = new Map<number, Array<{ outcome: string; completedDate: string }>>();
	const target = new Date(targetDate);
	
	// Iterate through dates within the buffer window
	for (let offset = -bufferDays; offset <= bufferDays; offset++) {
		const checkDate = new Date(target);
		checkDate.setDate(checkDate.getDate() + offset);
		const dateKey = checkDate.toISOString().split('T')[0];
		
		const runsForDay = runsByDate.get(dateKey);
		if (!runsForDay || runsForDay.length === 0) continue;
		
		// Fetch test results for runs on this day in parallel with concurrency and cache
		const runsToFetch = runsForDay.filter(r => r && r.id);
		const resultsForRuns: Array<{ runId: number; results: any[]; run?: any } | null> = [];

		// process in batches for concurrency control
		for (let j = 0; j < runsToFetch.length; j += concurrency) {
			const batch = runsToFetch.slice(j, j + concurrency);
			const batchPromises = batch.map(async (run: any) => {
				try {
					// Use cached results if available
					if (runResultsCache && runResultsCache.has(run.id)) {
						return { runId: run.id, results: runResultsCache.get(run.id) || [], run };
					}

					const resultsUrl = `https://dev.azure.com/${org}/${project}/_apis/test/runs/${run.id}/results?api-version=7.1`;
					const resultsRes = await fetch(resultsUrl, {
						headers: {
							'Authorization': `Basic ${btoa(':' + pat)}`,
							'Content-Type': 'application/json',
						},
					});

					if (resultsRes.ok) {
						const resultsData = await resultsRes.json();
						const vals = resultsData.value || [];
						if (runResultsCache) runResultsCache.set(run.id, vals);
						return { runId: run.id, results: vals, run };
					}
				} catch (error) {
					console.error(`Error fetching test results for run ${run.id}:`, error);
				}
				return null;
			});
			const batchResults = await Promise.all(batchPromises);
			resultsForRuns.push(...batchResults.filter(r => r));
		}

		// Process results
		for (const entry of resultsForRuns) {
			if (!entry) continue;
			const { runId, results, run } = entry;
			let foundExpectedTestCase = false;
			if (Array.isArray(results)) {
				for (const result of results) {
					if (result.testCase && result.testCase.id) {
						const testCaseId = parseInt(result.testCase.id);
						testCaseIds.add(testCaseId);

						const currentCount = executionCounts.get(testCaseId) || 0;
						executionCounts.set(testCaseId, currentCount + 1);

						if (!testCaseExecutions.has(testCaseId)) {
							testCaseExecutions.set(testCaseId, []);
						}
						testCaseExecutions.get(testCaseId)!.push({
							outcome: result.outcome || 'Unknown',
							completedDate: result.completedDate || result.startedDate || dateKey
						});

						if (expectedTestCaseIds && expectedTestCaseIds.has(testCaseId)) {
							foundExpectedTestCase = true;
						}
					}
				}
			}
			if (foundExpectedTestCase) {
				executionDates.add(dateKey);
			}
		}
	}
	
	return { testCaseIds, executionDates, executionCounts, testCaseExecutions };
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


