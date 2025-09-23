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
    prefetchPipelineData: (date: string, pipelineIds: string[]) => Promise<void>;
}

class PipelineDataServiceImpl implements PipelineDataService {
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
            console.error(`Error fetching release data for pipeline ${pipelineId}:`, error);
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

    async prefetchPipelineData(date: string, pipelineIds: string[]): Promise<void> {
        // This method can be called by the heatmap to prefetch data
        // that might be needed when users click on individual days
        const prefetchPromises = pipelineIds.map(async (pipelineId) => {
            const cached = getCachedPipelineData(date, pipelineId);
            
            // Only prefetch if not already cached
            if (!cached?.releaseData && !cached?.buildData) {
                try {
                    // Try to determine if this is a release or build pipeline
                    // For now, we'll attempt both and let them fail gracefully
                    const [releaseResult, buildResult] = await Promise.allSettled([
                        this.fetchReleaseData(date, pipelineId),
                        this.fetchBuildData(date, pipelineId)
                    ]);
                    
                    // Log any errors but don't throw
                    if (releaseResult.status === 'rejected') {
                        console.debug(`Release data not available for pipeline ${pipelineId}`);
                    }
                    if (buildResult.status === 'rejected') {
                        console.debug(`Build data not available for pipeline ${pipelineId}`);
                    }
                } catch (error) {
                    console.debug(`Prefetch failed for pipeline ${pipelineId}:`, error);
                }
            }
        });

        await Promise.allSettled(prefetchPromises);
    }
}

export const pipelineDataService = new PipelineDataServiceImpl();
