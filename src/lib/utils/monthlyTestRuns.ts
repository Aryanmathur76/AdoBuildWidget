import type { DayData, Derivative, MonthlyRunDetail } from '$lib/types/monthlyTestRuns';

export function calculateDerivatives(data: DayData[]): Derivative[] {
  if (data.length < 2) return [];
  const result: Derivative[] = [];
  for (let i = 1; i < data.length; i++) {
    const change = data[i].totalTests - data[i - 1].totalTests;
    result.push({ date: data[i].date, change, testsBefore: data[i - 1].totalTests, testsAfter: data[i].totalTests });
  }
  return result;
}

export function getMedianDate(group: Array<{ date: string; change: number; testsBefore: number; testsAfter: number }>) {
  if (group.length === 1) return group[0];
  const firstDate = new Date(group[0].date);
  const lastDate = new Date(group[group.length - 1].date);
  const medianTime = (firstDate.getTime() + lastDate.getTime()) / 2;
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

export function groupByWeekWindow(days: Array<{ date: string; change: number; testsBefore: number; testsAfter: number }>) {
  if (days.length === 0) return [];
  const result: any[] = [];
  let currentGroup = [days[0]];
  for (let i = 1; i < days.length; i++) {
    const groupFirstDate = new Date(currentGroup[0].date);
    const currDate = new Date(days[i].date);
    const daysDiff = Math.abs((currDate.getTime() - groupFirstDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 14) {
      currentGroup.push(days[i]);
    } else {
      result.push(getMedianDate(currentGroup));
      currentGroup = [days[i]];
    }
  }
  if (currentGroup.length > 0) result.push(getMedianDate(currentGroup));
  return result;
}

export function determineExecutionBoundaries(
  targetDate: string,
  bufferUsed: number,
  executionDates: Set<string>
): { startDate: string | null; endDate: string | null; durationDays: number | null } {
  if (executionDates.size === 0) return { startDate: null, endDate: null, durationDays: null };
  const sortedDates = Array.from(executionDates).sort();
  const startDate = sortedDates[0];
  const endDate = sortedDates[sortedDates.length - 1];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const durationDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return { startDate, endDate, durationDays };
}

export function calculatePassRates(
  foundTestCaseIds: Set<number>,
  testCaseExecutions: Map<number, Array<{ outcome: string; completedDate: string }>>
): {
  initialPassRate: number;
  finalPassRate: number;
  initialPassedCount: number;
  finalPassedCount: number;
  totalTestsFound: number;
} {
  let initialPassedCount = 0;
  let finalPassedCount = 0;
  const totalTestsFound = foundTestCaseIds.size;
  for (const testCaseId of foundTestCaseIds) {
    const executions = testCaseExecutions.get(testCaseId);
    if (executions && executions.length > 0) {
      const sortedExecutions = [...executions].sort((a, b) => a.completedDate.localeCompare(b.completedDate));
      const firstExecution = sortedExecutions[0];
      if (firstExecution.outcome === 'Passed') initialPassedCount++;
      const lastExecution = sortedExecutions[sortedExecutions.length - 1];
      if (lastExecution.outcome === 'Passed') finalPassedCount++;
    }
  }
  const initialPassRate = totalTestsFound > 0 ? (initialPassedCount / totalTestsFound) * 100 : 0;
  const finalPassRate = totalTestsFound > 0 ? (finalPassedCount / totalTestsFound) * 100 : 0;
  return {
    initialPassRate: Math.round(initialPassRate * 100) / 100,
    finalPassRate: Math.round(finalPassRate * 100) / 100,
    initialPassedCount,
    finalPassedCount,
    totalTestsFound
  };
}
