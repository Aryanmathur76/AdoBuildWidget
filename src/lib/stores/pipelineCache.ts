import { writable } from 'svelte/store';

// Types for cached data
export interface CachedDayQuality {
    quality: string;
    releaseIds: string[];
    totalPassCount: number;
    totalFailCount: number;
    timestamp: number;
}

export interface CachedPipelineData {
    releaseData?: any;
    buildData?: any;
    testRunData?: { passCount: number | null; failCount: number | null };
    pipelineStatus?: string;
    timestamp: number;
}

export interface CachedTestCases {
    testCases: any[];
    timestamp: number;
}

// Cache stores
export const dayQualityCache = writable<Record<string, CachedDayQuality>>({});
export const pipelineDataCache = writable<Record<string, CachedPipelineData>>({});
export const testCasesCache = writable<Record<string, CachedTestCases>>({});

// Cache TTL (25 minutes like the server-side cache)
const CACHE_TTL = 25 * 60 * 1000;

// Helper functions
export function isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < CACHE_TTL;
}

export function createCacheKey(date: string, pipelineId?: string, releaseId?: string): string {
    if (releaseId) return `${date}-${releaseId}`;
    if (pipelineId) return `${date}-${pipelineId}`;
    return date;
}

// Cache management functions
export function getCachedDayQuality(date: string): CachedDayQuality | null {
    let cache: Record<string, CachedDayQuality> = {};
    dayQualityCache.subscribe(value => cache = value)();
    
    const cached = cache[date];
    if (cached && isCacheValid(cached.timestamp)) {
        return cached;
    }
    return null;
}

export function setCachedDayQuality(date: string, data: Omit<CachedDayQuality, 'timestamp'>): void {
    dayQualityCache.update(cache => ({
        ...cache,
        [date]: { ...data, timestamp: Date.now() }
    }));
}

export function getCachedPipelineData(date: string, pipelineId: string): CachedPipelineData | null {
    let cache: Record<string, CachedPipelineData> = {};
    pipelineDataCache.subscribe(value => cache = value)();
    
    const key = createCacheKey(date, pipelineId);
    const cached = cache[key];
    if (cached && isCacheValid(cached.timestamp)) {
        return cached;
    }
    return null;
}

export function setCachedPipelineData(date: string, pipelineId: string, data: Omit<CachedPipelineData, 'timestamp'>): void {
    const key = createCacheKey(date, pipelineId);
    pipelineDataCache.update(cache => ({
        ...cache,
        [key]: { ...data, timestamp: Date.now() }
    }));
}

export function getCachedTestCases(releaseId: string): CachedTestCases | null {
    let cache: Record<string, CachedTestCases> = {};
    testCasesCache.subscribe(value => cache = value)();
    
    const cached = cache[releaseId];
    if (cached && isCacheValid(cached.timestamp)) {
        return cached;
    }
    return null;
}

export function setCachedTestCases(releaseId: string, testCases: any[]): void {
    testCasesCache.update(cache => ({
        ...cache,
        [releaseId]: { testCases, timestamp: Date.now() }
    }));
}

// Clear expired cache entries
export function clearExpiredCache(): void {
    const now = Date.now();
    
    dayQualityCache.update(cache => {
        const filtered: Record<string, CachedDayQuality> = {};
        for (const [key, value] of Object.entries(cache)) {
            if (isCacheValid(value.timestamp)) {
                filtered[key] = value;
            }
        }
        return filtered;
    });
    
    pipelineDataCache.update(cache => {
        const filtered: Record<string, CachedPipelineData> = {};
        for (const [key, value] of Object.entries(cache)) {
            if (isCacheValid(value.timestamp)) {
                filtered[key] = value;
            }
        }
        return filtered;
    });
    
    testCasesCache.update(cache => {
        const filtered: Record<string, CachedTestCases> = {};
        for (const [key, value] of Object.entries(cache)) {
            if (isCacheValid(value.timestamp)) {
                filtered[key] = value;
            }
        }
        return filtered;
    });
}

// Auto-cleanup expired cache every 5 minutes
if (typeof window !== 'undefined') {
    setInterval(clearExpiredCache, 5 * 60 * 1000);
}
