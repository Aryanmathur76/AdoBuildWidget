import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';

/**
 * GET /api/getTestRunGraph?planId=1310927
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
		const minRocParam = url.searchParams.get('minRoc');
		const minRoc = minRocParam ? parseFloat(minRocParam) : 0;

		if (!planId) {
			return json({ error: 'Missing planId parameter' }, { status: 400 });
		}

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

		return json({
			planId: parseInt(planId),
			totalRuns: testRuns.length,
			minRoc,
			days: groupedDays
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
