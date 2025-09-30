import {
    getCachedDayQuality,
    setCachedDayQuality,
} from "$lib/stores/pipelineCache.js";
import { pipelineDataService } from "$lib/stores/pipelineDataService.js";

/**
 * Helper to get YYYY-MM-DD string for a given date
 */
export function getDateString(date: Date): string;
export function getDateString(year: number, month: number, day: number): string;
export function getDateString(dateOrYear: Date | number, month?: number, day?: number): string {
    if (dateOrYear instanceof Date) {
        const year = dateOrYear.getFullYear();
        const monthNum = dateOrYear.getMonth() + 1;
        const dayNum = dateOrYear.getDate();
        const mm = String(monthNum).padStart(2, "0");
        const dd = String(dayNum).padStart(2, "0");
        return `${year}-${mm}-${dd}`;
    } else {
        const mm = String(month! + 1).padStart(2, "0");
        const dd = String(day!).padStart(2, "0");
        return `${dateOrYear}-${mm}-${dd}`;
    }
}

/**
 * Helper to check if a given date is in the future (excluding today)
 */
export function isFutureDay(date: Date): boolean;
export function isFutureDay(year: number, month: number, day: number): boolean;
export function isFutureDay(dateOrYear: Date | number, month?: number, day?: number): boolean {
    let dayDate: Date;
    
    if (dateOrYear instanceof Date) {
        dayDate = new Date(dateOrYear);
    } else {
        dayDate = new Date(dateOrYear, month!, day!);
    }
    
    // Remove time for comparison
    dayDate.setHours(0, 0, 0, 0);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    return dayDate > todayDate;
}

/**
 * Type definition for day build quality data
 */
export type DayBuildQuality = {
    quality: string;
    releasesWithTestsRan?: number;
    totalPassCount?: number;
    totalFailCount?: number;
};

/**
 * Type definition for pipeline configuration
 */
export type PipelineConfig = {
    pipelines: Array<{ 
        id: string | number; 
        type: string; 
        displayName?: string;
    }>;
};

/**
 * Fetch build quality for a given date (YYYY-MM-DD), with caching and prefetching
 */
export async function fetchBuildQualityForDay(
    dateStr: string, 
    pipelineConfig?: PipelineConfig | null
): Promise<DayBuildQuality> {
    // Parse dateStr to year, month, day
    const [year, month, day] = dateStr.split("-").map(Number);
    if (isFutureDay(year, month - 1, day)) {
        return { quality: "unknown" };
    }

    // Check cache first
    const cached = getCachedDayQuality(dateStr);
    if (cached) {
        return {
            quality: cached.quality,
            releasesWithTestsRan: cached.releaseIds?.length || 0,
            totalPassCount: cached.totalPassCount,
            totalFailCount: cached.totalFailCount,
        };
    }

    try {
        const res = await fetch(`/api/getDayQuality?date=${dateStr}`);
        if (res.ok) {
            const data = await res.json();
            const result: DayBuildQuality = {
                quality: data.quality,
                releasesWithTestsRan: data.releasesWithTestsRan,
                totalPassCount: data.totalPassCount,
                totalFailCount: data.totalFailCount,
            };

            // Cache the result
            setCachedDayQuality(dateStr, {
                quality: data.quality,
                releaseIds: data.releaseIds || [],
                totalPassCount: data.totalPassCount || 0,
                totalFailCount: data.totalFailCount || 0,
            });

            // Optional: Prefetch pipeline data for this day to improve navigation performance
            if (pipelineConfig?.pipelines) {
                pipelineDataService
                    .prefetchPipelineData(
                        dateStr,
                        pipelineConfig.pipelines.map((p) => p.id.toString()),
                        pipelineConfig
                    )
                    .catch(() => {
                        // Silently ignore prefetch errors - this is just an optimization
                    });
            }

            return result;
        } else {
            return { quality: "unknown" };
        }
    } catch {
        return { quality: "unknown" };
    }
}

/**
 * Batch fetch build qualities for multiple dates with concurrency control
 */
export async function fetchBuildQualitiesForDates(
    dates: string[],
    pipelineConfig?: PipelineConfig | null,
    concurrency: number = 10
): Promise<Record<string, DayBuildQuality>> {
    const results: Record<string, DayBuildQuality> = {};
    
    // Filter out dates that are already cached or in the future
    const datesToFetch = dates.filter(dateStr => {
        const [year, month, day] = dateStr.split("-").map(Number);
        if (isFutureDay(year, month - 1, day)) {
            results[dateStr] = { quality: "unknown" };
            return false;
        }
        
        const cached = getCachedDayQuality(dateStr);
        if (cached) {
            results[dateStr] = {
                quality: cached.quality,
                releasesWithTestsRan: cached.releaseIds?.length || 0,
                totalPassCount: cached.totalPassCount,
                totalFailCount: cached.totalFailCount,
            };
            return false;
        }
        
        return true;
    });

    // Process dates in batches with concurrency limit
    for (let i = 0; i < datesToFetch.length; i += concurrency) {
        const batch = datesToFetch.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(dateStr => fetchBuildQualityForDay(dateStr, pipelineConfig))
        );
        
        batch.forEach((dateStr, index) => {
            results[dateStr] = batchResults[index];
        });
    }

    return results;
}

/**
 * Generate date range for the last N days from today (including today)
 */
export function getLastNDays(n: number, fromDate: Date = new Date()): Date[] {
    const days: Date[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const date = new Date(fromDate);
        date.setDate(date.getDate() - i);
        days.push(date);
    }
    return days;
}

/**
 * Convert DateValue to YYYY-MM-DD string format
 */
export function dateValueToString(dateValue: any): string {
    if (!dateValue) return '';
    
    // Handle @internationalized/date DateValue objects
    if (typeof dateValue.toString === 'function') {
        return dateValue.toString();
    }
    
    // Fallback for regular Date objects
    if (dateValue instanceof Date) {
        return getDateString(dateValue);
    }
    
    return '';
}

/**
 * Create an error placeholder pipeline object
 */
export function createErrorPipeline(pipelineId: string | number, displayName?: string): any {
    return {
        id: pipelineId,
        name: displayName || `Pipeline ${pipelineId}`,
        status: 'unknown',
        createdOn: new Date().toISOString(),
        modifiedOn: new Date().toISOString(),
        envs: [],
        passedTestCount: 0,
        failedTestCount: 0
    };
}

/**
 * Generate all dates for a given month
 */
export function getDatesInMonth(year: number, month: number): string[] {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dates: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
        dates.push(getDateString(year, month, day));
    }
    return dates;
}

/**
 * Calculate pass rate from pass/fail counts
 */
export function calculatePassRate(passCount: number, failCount: number): number {
    const totalTests = passCount + failCount;
    return totalTests > 0 ? Math.round((passCount / totalTests) * 100) : 0;
}

/**
 * Calculate day of week labels based on the first day of the month
 */
export function getDayOfWeekLabels(year: number, month: number): string[] {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    // Create labels based on what day the 1st falls on
    const labels = [];
    for (let i = 0; i < 7; i++) {
        const dayIndex = (firstDayOfMonth + i) % 7;
        labels.push(dayNames[dayIndex]);
    }
    return labels;
}

/**
 * Weekly statistics calculation
 */
export type WeeklyStats = {
    totalBuilds: number;
    successRate: number;
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    bestPerformingDay: { dateStr: string; dayName: string } | null;
    worstPerformingDay: { dateStr: string; dayName: string } | null;
    qualityCounts: {
        good: number;
        bad: number;
        ok: number;
        inProgress: number;
        interrupted: number;
        unknown: number;
    };
};

/**
 * Calculate comprehensive weekly statistics from day data
 */
export function calculateWeeklyStats(
    days: Array<{
        dateStr: string;
        dayName: string;
        disabled: boolean;
        quality?: string;
        totalPassCount?: number;
        totalFailCount?: number;
        releasesWithTestsRan?: number;
    }>,
    dayBuildQuality: Record<string, DayBuildQuality>
): WeeklyStats {
    const completedDays = days.filter(day => !day.disabled && dayBuildQuality[day.dateStr]);
    
    if (completedDays.length === 0) {
        return {
            totalBuilds: 0,
            successRate: 0,
            totalTests: 0,
            totalPassed: 0,
            totalFailed: 0,
            bestPerformingDay: null,
            worstPerformingDay: null,
            qualityCounts: {
                good: 0,
                bad: 0,
                ok: 0,
                inProgress: 0,
                interrupted: 0,
                unknown: 0
            }
        };
    }

    // Calculate totals
    const totalPassed = completedDays.reduce((sum, day) => 
        sum + (dayBuildQuality[day.dateStr]?.totalPassCount || 0), 0);
    const totalFailed = completedDays.reduce((sum, day) => 
        sum + (dayBuildQuality[day.dateStr]?.totalFailCount || 0), 0);
    const totalTests = totalPassed + totalFailed;
    const successRate = calculatePassRate(totalPassed, totalFailed);
    const totalBuilds = completedDays.reduce((sum, day) => 
        sum + (dayBuildQuality[day.dateStr]?.releasesWithTestsRan || 1), 0);

    // Count day qualities
    const qualityCounts = {
        good: completedDays.filter(day => dayBuildQuality[day.dateStr]?.quality === "good").length,
        bad: completedDays.filter(day => dayBuildQuality[day.dateStr]?.quality === "bad").length,
        ok: completedDays.filter(day => dayBuildQuality[day.dateStr]?.quality === "ok").length,
        inProgress: completedDays.filter(day => dayBuildQuality[day.dateStr]?.quality === "inProgress").length,
        interrupted: completedDays.filter(day => dayBuildQuality[day.dateStr]?.quality === "interrupted").length,
        unknown: completedDays.filter(day => dayBuildQuality[day.dateStr]?.quality === "unknown").length,
    };

    // Calculate comprehensive scores for best/worst day
    const calculateDayScore = (day: typeof completedDays[0]) => {
        const dayData = dayBuildQuality[day.dateStr];
        const dayTotalTests = (dayData?.totalPassCount || 0) + (dayData?.totalFailCount || 0);
        const dayPassRate = calculatePassRate(dayData?.totalPassCount || 0, dayData?.totalFailCount || 0) / 100;
        const dayPipelinesRan = dayData?.releasesWithTestsRan || 0;
        
        // Composite score: pipelines weight (40%) + test volume weight (30%) + pass rate weight (30%)
        return (dayPipelinesRan * 0.4) + ((dayTotalTests / 7000) * 0.3) + (dayPassRate * 0.3);
    };

    // Find best and worst performing days
    let bestPerformingDay = completedDays[0];
    let worstPerformingDay = completedDays[0];
    let bestScore = calculateDayScore(bestPerformingDay);
    let worstScore = calculateDayScore(worstPerformingDay);

    for (const day of completedDays) {
        const score = calculateDayScore(day);
        if (score > bestScore) {
            bestScore = score;
            bestPerformingDay = day;
        }
        if (score < worstScore) {
            worstScore = score;
            worstPerformingDay = day;
        }
    }

    return {
        totalBuilds,
        successRate,
        totalTests,
        totalPassed,
        totalFailed,
        bestPerformingDay: { dateStr: bestPerformingDay.dateStr, dayName: bestPerformingDay.dayName },
        worstPerformingDay: { dateStr: worstPerformingDay.dateStr, dayName: worstPerformingDay.dayName },
        qualityCounts
    };
}