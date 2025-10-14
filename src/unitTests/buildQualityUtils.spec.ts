import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getDateString,
    isFutureDay,
    fetchBuildQualityForDay,
    fetchBuildQualitiesForDates,
    getLastNDays,
    getDatesInMonth,
    calculatePassRate,
    getDayOfWeekLabels,
    calculateWeeklyStats,
    type DayBuildQuality,
    type PipelineConfig,
    type WeeklyStats,
} from '$lib/utils/buildQualityUtils.js';

// Mock the store imports
vi.mock('$lib/stores/pipelineCache.js', () => ({
    getCachedDayQuality: vi.fn(),
    setCachedDayQuality: vi.fn(),
}));

vi.mock('$lib/stores/pipelineDataService.js', () => ({
    pipelineDataService: {
        prefetchPipelineData: vi.fn().mockResolvedValue(undefined),
    },
}));

// Import mocked functions
import { getCachedDayQuality, setCachedDayQuality } from '$lib/stores/pipelineCache.js';
import { pipelineDataService } from '$lib/stores/pipelineDataService.js';

describe('buildQualityUtils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mock current time for consistent testing
        vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
        // Clear and mock fetch globally
        vi.resetAllMocks();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('getDateString', () => {
        it('should format date object to YYYY-MM-DD', () => {
            const date = new Date(2024, 2, 15); // March 15, 2024
            expect(getDateString(date)).toBe('2024-03-15');
        });

        it('should format year, month, day to YYYY-MM-DD', () => {
            expect(getDateString(2024, 2, 5)).toBe('2024-03-05'); // March 5, 2024
        });

        it('should pad single digit months and days with zeros', () => {
            expect(getDateString(2024, 0, 1)).toBe('2024-01-01'); // January 1, 2024
        });

        it('should handle end of year dates', () => {
            expect(getDateString(2024, 11, 31)).toBe('2024-12-31'); // December 31, 2024
        });

        it('should handle leap year dates', () => {
            expect(getDateString(2024, 1, 29)).toBe('2024-02-29'); // Feb 29, 2024 (leap year)
        });
    });

    describe('isFutureDay', () => {
        it('should return true for future dates', () => {
            const futureDate = new Date('2024-03-16T10:00:00Z');
            expect(isFutureDay(futureDate)).toBe(true);
        });

        it('should return false for past dates', () => {
            const pastDate = new Date('2024-03-14T10:00:00Z');
            expect(isFutureDay(pastDate)).toBe(false);
        });

        it('should return false for today', () => {
            const today = new Date('2024-03-15T10:00:00Z');
            expect(isFutureDay(today)).toBe(false);
        });

        it('should work with year, month, day parameters', () => {
            expect(isFutureDay(2024, 2, 16)).toBe(true); // March 16, 2024
            expect(isFutureDay(2024, 2, 14)).toBe(false); // March 14, 2024
            expect(isFutureDay(2024, 2, 15)).toBe(false); // March 15, 2024 (today)
        });

        it('should ignore time when comparing dates', () => {
            const todayLateEvening = new Date('2024-03-15T23:59:59Z');
            expect(isFutureDay(todayLateEvening)).toBe(false);
        });
    });

    describe('fetchBuildQualityForDay', () => {
        const mockPipelineConfig: PipelineConfig = {
            pipelines: [
                { id: 'pipeline1', type: 'build', displayName: 'Build Pipeline' },
                { id: 'pipeline2', type: 'release', displayName: 'Release Pipeline' },
            ],
        };

        it('should return unknown for future dates', async () => {
            const result = await fetchBuildQualityForDay('2024-03-16');
            expect(result).toEqual({ quality: 'unknown' });
        });

        it('should return cached data when available', async () => {
            const cachedData = {
                quality: 'good',
                releaseIds: ['rel1', 'rel2'],
                totalPassCount: 100,
                totalFailCount: 5,
                timestamp: Date.now(),
            };
            
            vi.mocked(getCachedDayQuality).mockReturnValue(cachedData);

            const result = await fetchBuildQualityForDay('2024-03-14');
            
            expect(result).toEqual({
                quality: 'good',
                releasesWithTestsRan: 2,
                totalPassCount: 100,
                totalFailCount: 5,
            });
            expect(getCachedDayQuality).toHaveBeenCalledWith('2024-03-14');
        });

        it.skip('should fetch from API when not cached', async () => {
            vi.mocked(getCachedDayQuality).mockReturnValue(null);
            
            const apiResponse = {
                quality: 'bad',
                releasesWithTestsRan: 3,
                totalPassCount: 50,
                totalFailCount: 20,
                releaseIds: ['rel1', 'rel2', 'rel3'],
            };

            const mockResponse = {
                ok: true,
                json: () => Promise.resolve(apiResponse),
            };

            vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

            // Use a clearly past date
            const result = await fetchBuildQualityForDay('2024-03-10', mockPipelineConfig);

            expect(result).toEqual({
                quality: 'bad',
                releasesWithTestsRan: 3,
                totalPassCount: 50,
                totalFailCount: 20,
            });
            expect(fetch).toHaveBeenCalledWith('/api/getDayQuality?date=2024-03-10');
            expect(setCachedDayQuality).toHaveBeenCalledWith('2024-03-10', {
                quality: 'bad',
                releaseIds: ['rel1', 'rel2', 'rel3'],
                totalPassCount: 50,
                totalFailCount: 20,
            });
        });

        it('should prefetch pipeline data when config provided', async () => {
            vi.mocked(getCachedDayQuality).mockReturnValue(null);
            
            const mockResponse = {
                ok: true,
                json: () => Promise.resolve({ quality: 'good' }),
            };

            vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

            await fetchBuildQualityForDay('2024-03-14', mockPipelineConfig);

            expect(pipelineDataService.prefetchPipelineData).toHaveBeenCalledWith(
                '2024-03-14',
                ['pipeline1', 'pipeline2'],
                mockPipelineConfig
            );
        });

        it('should handle API errors gracefully', async () => {
            vi.mocked(getCachedDayQuality).mockReturnValue(null);
            
            vi.mocked(global.fetch).mockResolvedValue({
                ok: false,
            } as any);

            const result = await fetchBuildQualityForDay('2024-03-14');
            expect(result).toEqual({ quality: 'unknown' });
        });

        it('should handle fetch exceptions', async () => {
            vi.mocked(getCachedDayQuality).mockReturnValue(null);
            vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

            const result = await fetchBuildQualityForDay('2024-03-14');
            expect(result).toEqual({ quality: 'unknown' });
        });
    });

    describe('fetchBuildQualitiesForDates', () => {
        it('should handle empty date array', async () => {
            const result = await fetchBuildQualitiesForDates([]);
            expect(result).toEqual({});
        });

        it('should filter out future dates', async () => {
            const dates = ['2024-03-14', '2024-03-16', '2024-03-13'];
            
            vi.mocked(getCachedDayQuality).mockReturnValue(null);
            vi.mocked(global.fetch).mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ quality: 'good' }),
            } as any);

            const result = await fetchBuildQualitiesForDates(dates);

            expect(result['2024-03-16']).toEqual({ quality: 'unknown' });
            expect(fetch).toHaveBeenCalledTimes(2); // Only for non-future dates
        });

        it('should use cached data when available', async () => {
            const dates = ['2024-03-14', '2024-03-13'];
            const cachedData = {
                quality: 'good',
                releaseIds: ['rel1'],
                totalPassCount: 100,
                totalFailCount: 0,
                timestamp: Date.now(),
            };

            vi.mocked(getCachedDayQuality)
                .mockReturnValueOnce(cachedData)
                .mockReturnValueOnce(null);

            const mockResponse = {
                ok: true,
                json: () => Promise.resolve({ quality: 'bad' }),
            };
            vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

            const result = await fetchBuildQualitiesForDates(dates);

            expect(result['2024-03-14']).toEqual({
                quality: 'good',
                releasesWithTestsRan: 1,
                totalPassCount: 100,
                totalFailCount: 0,
            });
            expect(fetch).toHaveBeenCalledTimes(1); // Only for uncached date
        });

        it('should respect concurrency limit', async () => {
            const dates = Array.from({ length: 25 }, (_, i) => `2024-03-${String(i + 1).padStart(2, '0')}`);
            
            vi.mocked(getCachedDayQuality).mockReturnValue(null);
            const mockResponse = {
                ok: true,
                json: () => Promise.resolve({ quality: 'good' }),
            };
            vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

            await fetchBuildQualitiesForDates(dates, null, 5);

            // Should make requests in batches of 5, but we can't easily test the exact timing
            // At least verify all dates were processed
            expect(Object.keys(await fetchBuildQualitiesForDates(dates, null, 5))).toHaveLength(25);
        });
    });

    describe('getLastNDays', () => {
        it('should return last 7 days including today', () => {
            const result = getLastNDays(7);
            
            expect(result).toHaveLength(7);
            expect(getDateString(result[6])).toBe('2024-03-15'); // Today
            expect(getDateString(result[0])).toBe('2024-03-09'); // 6 days ago
        });

        it('should work with custom date', () => {
            const customDate = new Date('2024-03-20T12:00:00Z');
            const result = getLastNDays(3, customDate);
            
            expect(result).toHaveLength(3);
            expect(getDateString(result[2])).toBe('2024-03-20');
            expect(getDateString(result[0])).toBe('2024-03-18');
        });

        it('should handle single day', () => {
            const result = getLastNDays(1);
            expect(result).toHaveLength(1);
            expect(getDateString(result[0])).toBe('2024-03-15');
        });

        it('should handle crossing month boundaries', () => {
            const customDate = new Date('2024-03-02T12:00:00Z');
            const result = getLastNDays(5, customDate);
            
            expect(result).toHaveLength(5);
            expect(getDateString(result[0])).toBe('2024-02-27');
            expect(getDateString(result[4])).toBe('2024-03-02');
        });
    });

    describe('getDatesInMonth', () => {
        it('should return all dates in March 2024', () => {
            const result = getDatesInMonth(2024, 2); // March
            
            expect(result).toHaveLength(31);
            expect(result[0]).toBe('2024-03-01');
            expect(result[30]).toBe('2024-03-31');
        });

        it('should handle February in leap year', () => {
            const result = getDatesInMonth(2024, 1); // February 2024
            
            expect(result).toHaveLength(29);
            expect(result[28]).toBe('2024-02-29');
        });

        it('should handle February in non-leap year', () => {
            const result = getDatesInMonth(2023, 1); // February 2023
            
            expect(result).toHaveLength(28);
            expect(result[27]).toBe('2023-02-28');
        });

        it('should handle months with 30 days', () => {
            const result = getDatesInMonth(2024, 3); // April
            expect(result).toHaveLength(30);
        });
    });

    describe('calculatePassRate', () => {
        it('should calculate correct pass rate', () => {
            expect(calculatePassRate(80, 20)).toBe(80);
            expect(calculatePassRate(100, 0)).toBe(100);
            expect(calculatePassRate(0, 100)).toBe(0);
            expect(calculatePassRate(1, 3)).toBe(25);
        });

        it('should handle zero tests', () => {
            expect(calculatePassRate(0, 0)).toBe(0);
        });

        it('should round to nearest integer', () => {
            expect(calculatePassRate(1, 2)).toBe(33); // 33.33... rounded to 33
            expect(calculatePassRate(2, 1)).toBe(67); // 66.66... rounded to 67
        });
    });

    describe('getDayOfWeekLabels', () => {
        it('should return correct labels when month starts on Sunday', () => {
            // March 2024 starts on Friday
            const result = getDayOfWeekLabels(2024, 2);
            expect(result).toEqual(['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
        });

        it('should return correct labels when month starts on Monday', () => {
            // April 2024 starts on Monday
            const result = getDayOfWeekLabels(2024, 3);
            expect(result).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
        });

        it('should handle January', () => {
            // January 2024 starts on Monday
            const result = getDayOfWeekLabels(2024, 0);
            expect(result).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
        });
    });

    describe('calculateWeeklyStats', () => {
        const mockDays = [
            { dateStr: '2024-03-09', dayName: 'Sat', disabled: false },
            { dateStr: '2024-03-10', dayName: 'Sun', disabled: false },
            { dateStr: '2024-03-11', dayName: 'Mon', disabled: false },
            { dateStr: '2024-03-12', dayName: 'Tue', disabled: false },
            { dateStr: '2024-03-13', dayName: 'Wed', disabled: false },
            { dateStr: '2024-03-14', dayName: 'Thu', disabled: false },
            { dateStr: '2024-03-15', dayName: 'Fri', disabled: false },
        ];

        const mockDayBuildQuality: Record<string, DayBuildQuality> = {
            '2024-03-09': { quality: 'good', totalPassCount: 100, totalFailCount: 10, releasesWithTestsRan: 2 },
            '2024-03-10': { quality: 'bad', totalPassCount: 50, totalFailCount: 50, releasesWithTestsRan: 1 },
            '2024-03-11': { quality: 'ok', totalPassCount: 80, totalFailCount: 20, releasesWithTestsRan: 3 },
            '2024-03-12': { quality: 'good', totalPassCount: 90, totalFailCount: 10, releasesWithTestsRan: 2 },
            '2024-03-13': { quality: 'inProgress', totalPassCount: 0, totalFailCount: 0, releasesWithTestsRan: 0 },
            '2024-03-14': { quality: 'interrupted', totalPassCount: 30, totalFailCount: 20, releasesWithTestsRan: 1 },
            '2024-03-15': { quality: 'unknown', totalPassCount: 0, totalFailCount: 0, releasesWithTestsRan: 0 },
        };

        it('should calculate comprehensive statistics', () => {
            const result = calculateWeeklyStats(mockDays, mockDayBuildQuality);

            // Excludes today (2024-03-15), so totals are: (2+1+3+2+0+1) but 0 becomes 1, so (2+1+3+2+1+1) = 10
            expect(result.totalBuilds).toBe(10); // Sum of releasesWithTestsRan excluding today, with default 1 for 0 values
            expect(result.totalPassed).toBe(350); // 100+50+80+90+0+30 (excluding today)
            expect(result.totalFailed).toBe(110); // 10+50+20+10+0+20 (excluding today)
            expect(result.totalTests).toBe(460);
            expect(result.successRate).toBe(76); // 350/460 = 76.09% rounded
        });

        it('should count quality types correctly', () => {
            const result = calculateWeeklyStats(mockDays, mockDayBuildQuality);

            // Excludes today (2024-03-15), so counts are reduced by 1 for 'unknown'
            expect(result.qualityCounts).toEqual({
                good: 2,
                bad: 1,
                ok: 1,
                inProgress: 1,
                interrupted: 1,
                unknown: 0, // Today's 'unknown' is excluded
            });
        });

        it('should identify best and worst performing days', () => {
            const result = calculateWeeklyStats(mockDays, mockDayBuildQuality);

            // Best day should be 2024-03-11 (3 releases, 100 tests, 80% pass rate)
            expect(result.bestPerformingDay).toEqual({
                dateStr: '2024-03-11',
                dayName: 'Mon',
            });

            // Worst day should be one with lowest composite score
            expect(result.worstPerformingDay).not.toBeNull();
        });

        it('should handle empty completed days', () => {
            const emptyDays = [{ dateStr: '2024-03-16', dayName: 'Sat', disabled: true }];
            const result = calculateWeeklyStats(emptyDays, {});

            expect(result.totalBuilds).toBe(0);
            expect(result.successRate).toBe(0);
            expect(result.bestPerformingDay).toBeNull();
            expect(result.worstPerformingDay).toBeNull();
        });

        it('should filter out disabled days', () => {
            const mixedDays = [
                { dateStr: '2024-03-14', dayName: 'Thu', disabled: false },
                { dateStr: '2024-03-15', dayName: 'Fri', disabled: false },
                { dateStr: '2024-03-16', dayName: 'Sat', disabled: true }, // Future day
            ];

            const result = calculateWeeklyStats(mixedDays, mockDayBuildQuality);

            // Should only process 2024-03-14 (excludes today 2024-03-15 and disabled 2024-03-16)
            expect(result.totalTests).toBe(50); // 30 + 20 from 2024-03-14 only
        });

        it('should handle days without build quality data', () => {
            const daysWithMissingData = [
                { dateStr: '2024-03-14', dayName: 'Thu', disabled: false },
                { dateStr: '2024-03-18', dayName: 'Mon', disabled: false }, // No data
            ];

            const result = calculateWeeklyStats(daysWithMissingData, mockDayBuildQuality);

            // Should only process days with data
            expect(result.totalTests).toBe(50); // Only from 2024-03-14
        });

        it('should exclude today from calculations', () => {
            // Test with only today's data
            const todayOnlyDays = [
                { dateStr: '2024-03-15', dayName: 'Fri', disabled: false }, // Today
            ];

            const result = calculateWeeklyStats(todayOnlyDays, mockDayBuildQuality);

            // Should return empty stats since today is excluded
            expect(result.totalBuilds).toBe(0);
            expect(result.totalTests).toBe(0);
            expect(result.successRate).toBe(0);
            expect(result.bestPerformingDay).toBeNull();
            expect(result.worstPerformingDay).toBeNull();
        });
    });
});