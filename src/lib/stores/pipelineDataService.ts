// Removed cache imports

export interface PipelineDataService {
    fetchReleaseData: (date: string, pipelineId: string) => Promise<any>;
    fetchBuildData: (date: string, pipelineId: string) => Promise<any>;
    fetchTestCases: (releaseId: string) => Promise<any[]>;
    prefetchPipelineData: (date: string, pipelineIds: string[], pipelineConfig?: any) => Promise<void>;
    // Prefetch all pipeline data for all days in a month
    prefetchAllPipelineDataForMonth: (dateStrings: string[], pipelineConfig: any) => Promise<void>;
    // Silent methods that don't throw errors for missing data (useful for interactive elements)
    fetchReleaseDataSilent: (date: string, pipelineId: string) => Promise<any | null>;
    fetchBuildDataSilent: (date: string, pipelineId: string) => Promise<any | null>;
    // Clear the client-side in-memory cache (optionally for a specific key)
    clearLocalCache: (key?: string) => void;
}

class PipelineDataServiceImpl implements PipelineDataService {
    private inFlightRequests = new Map<string, Promise<any>>();
    private localCache = new Map<string, { data: any; timestamp: number }>();
    private readonly LOCAL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    private getCached(key: string): { hit: true; data: any } | { hit: false } {
        const entry = this.localCache.get(key);
        if (entry && Date.now() - entry.timestamp < this.LOCAL_CACHE_TTL_MS) {
            return { hit: true, data: entry.data };
        }
        return { hit: false };
    }

    private setCached(key: string, data: any): void {
        this.localCache.set(key, { data, timestamp: Date.now() });
    }

    private async runDedupedRequest<T>(key: string, requestFactory: () => Promise<T>): Promise<T> {
        // 1. Check local cache first
        const cached = this.getCached(key);
        if (cached.hit) return cached.data;

        // 2. Dedup in-flight requests
        const existing = this.inFlightRequests.get(key);
        if (existing) {
            return existing as Promise<T>;
        }

        const requestPromise = requestFactory().then((result) => {
            this.setCached(key, result);
            return result;
        }).finally(() => {
            this.inFlightRequests.delete(key);
        });

        this.inFlightRequests.set(key, requestPromise as Promise<any>);
        return requestPromise;
    }

    clearLocalCache(key?: string): void {
        if (key) this.localCache.delete(key);
        else this.localCache.clear();
    }

    /**
     * Prefetches and caches all pipeline data for all days in a month.
     * @param dateStrings Array of date strings (YYYY-MM-DD) for the month
     * @param pipelineConfig Pipeline config object (must have .pipelines array)
     */
    async prefetchAllPipelineDataForMonth(dateStrings: string[], pipelineConfig: any): Promise<void> {
        if (!pipelineConfig?.pipelines) return;
        // For each day, prefetch all pipeline data
        const allPrefetches: Promise<any>[] = [];
        for (const date of dateStrings) {
            for (const pipeline of pipelineConfig.pipelines) {
                if (pipeline.type === 'build') {
                    allPrefetches.push(this.fetchBuildDataSilent(date, pipeline.id));
                } else if (pipeline.type === 'release') {
                    allPrefetches.push(this.fetchReleaseDataSilent(date, pipeline.id));
                } else if (pipeline.type === 'build/release') {
                    allPrefetches.push(this.fetchBuildDataSilent(date, pipeline.id));
                    allPrefetches.push(this.fetchReleaseDataSilent(date, pipeline.id));
                }
            }
        }
        await Promise.allSettled(allPrefetches);
    }
    // Silent version of fetchReleaseData that doesn't log 404s as errors
    async fetchReleaseDataSilent(date: string, pipelineId: string): Promise<any | null> {
        const requestKey = `release:${date}:${pipelineId}`;
        return this.runDedupedRequest(requestKey, async () => {
            try {
                const response = await fetch(`/api/constructRelease?date=${date}&releaseDefinitionId=${pipelineId}`);
                if (response.ok) {
                    const data = await response.json();
                    
                    // Handle null response (no releases found)
                    if (data === null) {
                        return null;
                    }
                    
                    return data;
                } else {
                    console.log(`Error fetching release data for pipeline ${pipelineId}: ${response.status}`);
                    return null;
                }
            } catch (error) {
                console.log(`Network error fetching release data for pipeline ${pipelineId}:`, error);
                return null;
            }
        });
    }

    // Silent version of fetchBuildData that doesn't log 404s as errors
    async fetchBuildDataSilent(date: string, pipelineId: string): Promise<any | null> {
        const requestKey = `build:${date}:${pipelineId}`;
        return this.runDedupedRequest(requestKey, async () => {
            try {
                const response = await fetch(`/api/constructBuild?date=${date}&buildDefinitionId=${pipelineId}`);
                if (response.ok) {
                    const data = await response.json();
                    
                    return data;
                } else if (response.status === 404) {
                    // 404 is expected for pipelines that don't have build data
                    return null;
                } else {
                    console.error(`Error fetching build data for pipeline ${pipelineId}: ${response.status}`);
                    return null;
                }
            } catch (error) {
                console.error(`Network error fetching build data for pipeline ${pipelineId}:`, error);
                return null;
            }
        });
    }

    async fetchReleaseData(date: string, pipelineId: string): Promise<any> {
        const key = `release:${date}:${pipelineId}`;
        const cached = this.getCached(key);
        if (cached.hit) {
            if (cached.data === null) throw new Error(`No release data found for pipeline ${pipelineId} on ${date}. This might indicate no releases were created on this date.`);
            return cached.data;
        }

        try {
            const response = await fetch(`/api/constructRelease?date=${date}&releaseDefinitionId=${pipelineId}`);
            if (response.ok) {
                const data = await response.json();

                // Handle null response (no releases found)
                if (data === null) {
                    this.setCached(key, null);
                    throw new Error(`No release data found for pipeline ${pipelineId} on ${date}. This might indicate no releases were created on this date.`);
                }

                this.setCached(key, data);
                return data;
            } else {
                throw new Error(`Failed to fetch release data: ${response.status}`);
            }
        } catch (error) {
            console.log(`Error fetching release data for pipeline ${pipelineId}:`, error);
            throw error;
        }
    }

    async fetchBuildData(date: string, pipelineId: string): Promise<any> {
        const key = `build:${date}:${pipelineId}`;
        const cached = this.getCached(key);
        if (cached.hit) {
            if (cached.data === null) throw new Error(`No build data found for pipeline ${pipelineId} on ${date}. This might indicate a pipeline configuration issue.`);
            return cached.data;
        }

        try {
            const response = await fetch(`/api/constructBuild?date=${date}&buildDefinitionId=${pipelineId}`);
            if (response.ok) {
                const data = await response.json();
                this.setCached(key, data);
                return data;
            } else if (response.status === 404) {
                this.setCached(key, null);
                throw new Error(`No build data found for pipeline ${pipelineId} on ${date}. This might indicate a pipeline configuration issue.`);
            } else {
                throw new Error(`Failed to fetch build data: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching build data for pipeline ${pipelineId}:`, error);
            throw error;
        }
    }

    async fetchTestCases(releaseId: string): Promise<any[]> {
        const key = `testcases:${releaseId}`;
        return this.runDedupedRequest(key, async () => {
            try {
                const response = await fetch(`/api/test-cases?releaseId=${releaseId}`);
                if (response.ok) {
                    const data = await response.json();
                    return data.testCases || [];
                } else {
                    throw new Error(`Failed to fetch test cases: ${response.status}`);
                }
            } catch (error) {
                console.error(`Error fetching test cases for release ${releaseId}:`, error);
                return [];
            }
        });
    }

    async prefetchPipelineData(date: string, pipelineIds: string[], pipelineConfig?: any): Promise<void> {
        // This method can be called by the heatmap to prefetch data
        // that might be needed when users click on individual days
        const prefetchPromises = pipelineIds.map(async (pipelineId) => {
            // Always prefetch, no cache check
            if (pipelineConfig?.pipelines) {
                const pipeline = pipelineConfig.pipelines.find((p: any) => p.id.toString() === pipelineId);
                if (pipeline) {
                    if (pipeline.type === 'build') {
                        await this.fetchBuildDataSilent(date, pipelineId);
                    } else if (pipeline.type === 'release') {
                        await this.fetchReleaseDataSilent(date, pipelineId);
                    } else if (pipeline.type === 'build/release') {
                        await Promise.all([
                            this.fetchReleaseDataSilent(date, pipelineId),
                            this.fetchBuildDataSilent(date, pipelineId)
                        ]);
                    }
                } else {
                    await Promise.all([
                        this.fetchReleaseDataSilent(date, pipelineId),
                        this.fetchBuildDataSilent(date, pipelineId)
                    ]);
                }
            } else {
                await Promise.all([
                    this.fetchReleaseDataSilent(date, pipelineId),
                    this.fetchBuildDataSilent(date, pipelineId)
                ]);
            }
        });

        await Promise.allSettled(prefetchPromises);
    }
}

export const pipelineDataService = new PipelineDataServiceImpl();
