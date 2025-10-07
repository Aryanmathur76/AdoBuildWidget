import { 
    getCachedPipelineData, 
    setCachedPipelineData, 
    getCachedTestCases, 
    setCachedTestCases 
} from './pipelineCache.js';

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
}

class PipelineDataServiceImpl implements PipelineDataService {
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
        // Check cache first
        const cached = getCachedPipelineData(date, pipelineId);
        if (cached?.releaseData) {
            return cached.releaseData;
        }

        try {
            const response = await fetch(`/api/constructRelease?date=${date}&releaseDefinitionId=${pipelineId}`);
            if (response.ok) {
                const data = await response.json();
                
                // Handle null response (no releases found)
                if (data === null) {
                    return null;
                }
                
                // Update cache
                const existingCache = getCachedPipelineData(date, pipelineId) || {};
                setCachedPipelineData(date, pipelineId, {
                    ...existingCache,
                    releaseData: data
                });
                
                return data;
            } else {
                console.log(`Error fetching release data for pipeline ${pipelineId}: ${response.status}`);
                return null;
            }
        } catch (error) {
            console.log(`Network error fetching release data for pipeline ${pipelineId}:`, error);
            return null;
        }
    }

    // Silent version of fetchBuildData that doesn't log 404s as errors
    async fetchBuildDataSilent(date: string, pipelineId: string): Promise<any | null> {
        // Check cache first
        const cached = getCachedPipelineData(date, pipelineId);
        if (cached?.buildData) {
            return cached.buildData;
        }

        try {
            const response = await fetch(`/api/constructBuild?date=${date}&buildDefinitionId=${pipelineId}`);
            if (response.ok) {
                const data = await response.json();
                
                // Update cache
                const existingCache = getCachedPipelineData(date, pipelineId) || {};
                setCachedPipelineData(date, pipelineId, {
                    ...existingCache,
                    buildData: data
                });
                
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
    }

    async fetchReleaseData(date: string, pipelineId: string): Promise<any> {
        // Check cache first
        const cached = getCachedPipelineData(date, pipelineId);
        if (cached?.releaseData) {
            return cached.releaseData;
        }

        try {
            const response = await fetch(`/api/constructRelease?date=${date}&releaseDefinitionId=${pipelineId}`);
            if (response.ok) {
                const data = await response.json();
                
                // Handle null response (no releases found)
                if (data === null) {
                    throw new Error(`No release data found for pipeline ${pipelineId} on ${date}. This might indicate no releases were created on this date.`);
                }
                
                // Update cache
                const existingCache = getCachedPipelineData(date, pipelineId) || {};
                setCachedPipelineData(date, pipelineId, {
                    ...existingCache,
                    releaseData: data
                });
                
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
        // Check cache first
        const cached = getCachedPipelineData(date, pipelineId);
        if (cached?.buildData) {
            return cached.buildData;
        }

        try {
            const response = await fetch(`/api/constructBuild?date=${date}&buildDefinitionId=${pipelineId}`);
            if (response.ok) {
                const data = await response.json();
                
                // Update cache
                const existingCache = getCachedPipelineData(date, pipelineId) || {};
                setCachedPipelineData(date, pipelineId, {
                    ...existingCache,
                    buildData: data
                });
                
                return data;
            } else if (response.status === 404) {
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
        // Check cache first
        const cached = getCachedTestCases(releaseId);
        if (cached) {
            return cached.testCases;
        }

        try {
            const response = await fetch(`/api/test-cases?releaseId=${releaseId}`);
            if (response.ok) {
                const data = await response.json();
                const testCases = data.testCases || [];
                
                // Cache the result
                setCachedTestCases(releaseId, testCases);
                
                return testCases;
            } else {
                throw new Error(`Failed to fetch test cases: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching test cases for release ${releaseId}:`, error);
            return [];
        }
    }

    async prefetchPipelineData(date: string, pipelineIds: string[], pipelineConfig?: any): Promise<void> {
        // This method can be called by the heatmap to prefetch data
        // that might be needed when users click on individual days
        const prefetchPromises = pipelineIds.map(async (pipelineId) => {
            const cached = getCachedPipelineData(date, pipelineId);
            
            // Only prefetch if not already cached
            if (!cached?.releaseData && !cached?.buildData) {
                // If we have pipeline config, only fetch the appropriate type
                if (pipelineConfig?.pipelines) {
                    const pipeline = pipelineConfig.pipelines.find((p: any) => p.id.toString() === pipelineId);
                    if (pipeline) {
                        if (pipeline.type === 'build') {
                            await this.fetchBuildDataSilent(date, pipelineId);
                        } else if (pipeline.type === 'release') {
                            await this.fetchReleaseDataSilent(date, pipelineId);
                        } else if (pipeline.type === 'build/release') {
                            // This pipeline supports both types
                            await Promise.all([
                                this.fetchReleaseDataSilent(date, pipelineId),
                                this.fetchBuildDataSilent(date, pipelineId)
                            ]);
                        }
                    } else {
                        // Pipeline not found in config, try both (fallback to old behavior)
                        await Promise.all([
                            this.fetchReleaseDataSilent(date, pipelineId),
                            this.fetchBuildDataSilent(date, pipelineId)
                        ]);
                    }
                } else {
                    // No config provided, try both (fallback to old behavior)
                    await Promise.all([
                        this.fetchReleaseDataSilent(date, pipelineId),
                        this.fetchBuildDataSilent(date, pipelineId)
                    ]);
                }
            }
        });

        await Promise.allSettled(prefetchPromises);
    }
}

export const pipelineDataService = new PipelineDataServiceImpl();
