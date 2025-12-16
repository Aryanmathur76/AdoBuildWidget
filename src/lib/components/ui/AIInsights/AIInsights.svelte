<script lang="ts">
    import type { Release } from "$lib/types/release";
    import type { Build } from "$lib/types/build";
    import { Card } from "$lib/components/ui/card/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import { env } from "$env/dynamic/public";
    import { parseDate } from "@internationalized/date";
    import {dateValueToString, createErrorPipeline, type PipelineConfig } from "$lib/utils/buildQualityUtils.js";
    import { getPipelineConfig } from "$lib/utils.js";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";

    let insights = $state<string>("");

    // Load cached weekly trend analysis on mount
    $effect(() => {
        if (typeof window !== "undefined") {
            const now = new Date();
            const year = now.getFullYear();
            // Get ISO week number
            const week = Math.ceil((now.getDate() + 6 - now.getDay()) / 7);
            const cacheKey = `buildHeatmap-weeklyTrend-${year}-${week}`;
            const cachedInsights = localStorage.getItem(cacheKey);
            if (cachedInsights) {
                insights = cachedInsights;
            }
        }
    });
    let loading = $state(false);
    let error = $state<string>("");

    // Get pipeline configuration
    let pipelineConfig: PipelineConfig | null = null;
    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        } else {
            throw new Error("Missing PUBLIC_AZURE_PIPELINE_CONFIG environment variable.");
        }
    } catch (e) {
        throw new Error(
            "Failed to parse pipeline configuration: " +
                (e instanceof Error ? e.message : String(e)),
        );
    }

    if (!pipelineConfig?.pipelines || pipelineConfig.pipelines.length === 0) {
        throw new Error("Pipeline configuration contains no pipelines.");
    }

    // Array of release objects to fetch release details for
    let releasePipelines = $state<Release[]>([]);

    // Array of build objects - don't pre-allocate since we might get multiple builds per config
    let buildPipelines = $state<Build[]>([]);


    async function fetchReleasePipelineDetails(pipelines: any[], date: any) {
        //releasePipelines = []; // Clear the array
        
        const releasePipes = pipelines.filter((p: any) => p.type === 'release');
        const dateStr = dateValueToString(date);

        for (let i = 0; i < releasePipes.length; i++) {
            const pipeline = releasePipes[i];

            try {
                const releaseDetails = await pipelineDataService.fetchReleaseData(
                    dateStr, 
                    pipeline.id
                );
                releaseDetails.name = pipeline.displayName;

                const response = await fetch(
                        `/api/test-cases?pipelineId=${releaseDetails.id}&pipelineType=${pipeline.type}&date=${encodeURIComponent(dateStr)}`
                    );

                const data = await response.json();
                let testCases = data.testCases
                    .filter((tc: any) => tc.outcome !== 'Passed')
                    .map((tc: { id: string; name: string; outcome: string }) => {
                        const { id, name, outcome } = tc;
                        return { id, name, outcome };
                    });

                releaseDetails.failedTestCases = testCases;
                console.log('fetched release details: ', releaseDetails);
                releasePipelines.push(releaseDetails);
            } catch (error) {
                console.log(`Error fetching release details for pipeline ID ${pipeline.id}:`, error);
                // Add error placeholder
                releasePipelines.push(createErrorPipeline(pipeline.id, pipeline.displayName));
            }
        }
    }

    async function fetchBuildPipelineDetails(pipelines: any[], date: any){
        //buildPipelines = []; // Clear the array
        
        const buildPipes = pipelines.filter((p: any) => p.type === 'build');
        const dateStr = dateValueToString(date);

        for (let i = 0; i < buildPipes.length; i++) {
            const pipeline = buildPipes[i];
            try {
                const buildDetailsArr = await pipelineDataService.fetchBuildData(
                    dateStr, 
                    pipeline.id
                );
                
                // If multiple builds, add all of them
                if (Array.isArray(buildDetailsArr) && buildDetailsArr.length > 0) {
                    for (const buildDetails of buildDetailsArr) {
                        if (!buildDetails.testRunName) {
                            buildDetails.name = pipeline.displayName;
                        } else {
                            buildDetails.name = buildDetails.testRunName;
                        }
                        const response = await fetch(
                            `/api/test-cases?pipelineId=${buildDetails.id}&pipelineType=${pipeline.type}&date=${encodeURIComponent(dateStr)}`
                        );

                        const data = await response.json();
                        let testCases = data.testCases
                        .filter((tc: any) => tc.outcome !== 'Passed')
                        .map((tc: { id: string; name: string; outcome: string }) => {
                            const { id, name, outcome } = tc;
                            return { id, name, outcome };
                        });

                        buildDetails.failedTestCases = testCases;
                        console.log('fetched build details: ', buildDetails);
                        buildPipelines.push(buildDetails);
                    }
                } else {
                    buildPipelines.push(createErrorPipeline(pipeline.id, pipeline.displayName));
                }
            } catch (error) {
                console.error(`Error fetching build details for pipeline ID ${pipeline.id}:`, error);
                // Add error placeholder
                buildPipelines.push(createErrorPipeline(pipeline.id, pipeline.displayName));
            }
        }
    }

    async function fetchAllPipelineDetails(pipelines: any[], date: any) {
        
        // Fetch release pipelines first
        await fetchReleasePipelineDetails(pipelines, date);

        // Then fetch build pipelines
        await fetchBuildPipelineDetails(pipelines, date);
    }


    async function fetchInsights() {
        loading = true;
        error = "";
        insights = "";

        try {
            // Get last 7 days as DateValue objects (YYYY-MM-DD)
            const last7Days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const iso = d.toISOString().slice(0, 10);
                return parseDate(iso);
            });

            for (const date of last7Days) {
                if (pipelineConfig && pipelineConfig.pipelines) {
                    await fetchAllPipelineDetails(pipelineConfig.pipelines, date);
                } else {
                    throw new Error("Pipeline configuration is missing or invalid.");
                }
            }

            // Prepare data for AI analysis
            const buildData = {
                days: last7Days.map(dateValue => {
                    const dateStr = dateValueToString(dateValue);
                    // Gather all pipelines for this day
                    const pipelines: any[] = [];
                    // Add release pipelines for this day
                    releasePipelines
                        .filter(p => p.completedTime && dateValueToString(parseDate(p.completedTime.slice(0, 10))) === dateStr)
                        .forEach(p => {
                            pipelines.push({
                                pipelineType: 'release',
                                pipelineName: p.name,
                                passCount: p.passedTestCount,
                                failCount: p.failedTestCount,
                                failedTestNames: Array.isArray(p.failedTestCases) ? p.failedTestCases : [],
                                completedDate: p.completedTime,
                            });
                        });
                    // Add build pipelines for this day
                    buildPipelines
                        .filter(p => p.completedTime && dateValueToString(parseDate(p.completedTime.slice(0, 10))) === dateStr)
                        .forEach(p => {
                            pipelines.push({
                                pipelineType: 'build',
                                pipelineName: p.name,
                                passCount: p.passedTestCount,
                                failCount: p.failedTestCount,
                                failedTestNames: Array.isArray(p.failedTestCases) ? p.failedTestCases : [],
                                completedDate: p.completedTime,
                            });
                        });
                    return {
                        date: dateStr,
                        pipelines
                    };
                })
            };

            console.log('Build Data for AI:', buildData);

            const response = await fetch('/api/ai-insights', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ buildData })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch insights');
            }

            const result = await response.json();
            insights = result.insights;
            // Cache weekly trend analysis insights in localStorage
            if (typeof window !== "undefined") {
                const now = new Date();
                const year = now.getFullYear();
                const week = Math.ceil((now.getDate() + 6 - now.getDay()) / 7);
                const cacheKey = `buildHeatmap-weeklyTrend-${year}-${week}`;
                localStorage.setItem(cacheKey, insights);
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'An error occurred';
            console.error('Error fetching AI insights:', err);
        } finally {
            loading = false;
        }
    }
</script>

<Card class="pt-2 p-4 flex-1 flex flex-col w-full bg-background/60 border border-border/50">
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary" style="font-size: 1.5em;">psychology</span>
            <h3 class="text-sm font-semibold">Weekly Trend Analysis</h3>
        </div>
        <Button size="sm" variant="outline" onclick={fetchInsights} disabled={loading}>
            {loading ? 'Analyzing...' : 'Get Insights'}
        </Button>
    </div>
    <div class="flex-1 flex items-start justify-start">
        {#if loading}
            <div class="w-full space-y-2">
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-5/6" />
                <Skeleton class="h-4 w-4/6" />
            </div>
        {:else if error}
            <div class="text-sm text-red-600">
                <p class="font-medium">Error: {error}</p>
                <p class="text-xs text-muted-foreground mt-1">Please check your Azure OpenAI configuration</p>
            </div>
        {:else if insights}
            <div class="text-sm text-foreground leading-relaxed max-h-[200px] xl:max-h-full overflow-y-auto">
                <p>{insights}</p>
            </div>
        {:else}
            <div class="flex flex-col items-center justify-center text-center w-full p-4 xl:p-10 space-y-4">
                <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <span class="material-symbols-outlined text-muted-foreground">auto_awesome</span>
                </div>
                <div>
                    <p class="text-xs text-muted-foreground font-medium">AI-Powered Analysis</p>
                    <p class="text-xs text-muted-foreground/70">Click "Get Insights" to analyze your build data</p>
                </div>
            </div>
        {/if}
    </div>
</Card>
