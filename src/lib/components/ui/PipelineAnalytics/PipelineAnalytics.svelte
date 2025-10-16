<script lang="ts">
    import * as Card from "$lib/components/ui/card/index.js";
    import * as Chart from "$lib/components/ui/chart/index.js";
    import { scaleBand } from "d3-scale";
    import { BarChart, Highlight, type ChartContextValue } from "layerchart";
    import { cubicInOut } from "svelte/easing";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import { env } from "$env/dynamic/public";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import { 
        getDateString, 
        getLastNDays,
        type PipelineConfig 
    } from "$lib/utils/buildQualityUtils.js";
    import { getPipelineConfig } from "$lib/utils.js";

    const today = new Date();

    let pipelineConfig: PipelineConfig | null = null;
    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch (e) {
        console.warn("Failed to parse pipeline config:", e);
    }

    const chartConfig = {
        passed: { label: "Passed", color: "var(--chart-1)" },
        failed: { label: "Failed", color: "var(--chart-2)" },
    } satisfies Chart.ChartConfig;

    type PipelineChartData = {
        pipelineId: string;
        displayName: string;
        type: 'build' | 'release';
        testRunName?: string; // For build pipelines with multiple test runs
        data: Array<{
            date: string;
            passed: number | null;
            failed: number | null;
        }>;
        loading: boolean;
        context?: ChartContextValue;
    };

    let pipelineCharts = $state<PipelineChartData[]>([]);
    const last7Days = getLastNDays(7, today);

    $effect(() => {
        if (pipelineConfig?.pipelines) {
            // Initialize with loading state for each pipeline
            // We'll expand build pipelines later when we discover multiple test runs
            pipelineCharts = pipelineConfig.pipelines.map(pipeline => ({
                pipelineId: String(pipeline.id),
                displayName: pipeline.displayName ?? "",
                type: pipeline.type === "build" ? "build" : "release",
                data: last7Days.map(date => ({
                    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    passed: null,
                    failed: null,
                })),
                loading: true,
            }));
            fetchAllPipelineData();
        }
    });

    async function fetchAllPipelineData() {
        if (!pipelineConfig?.pipelines) return;
        
        const newCharts: PipelineChartData[] = [];
        
        for (let i = 0; i < pipelineConfig.pipelines.length; i++) {
            const pipeline = pipelineConfig.pipelines[i];
            const charts = await fetchPipelineData(pipeline);
            newCharts.push(...charts);
        }
        
        pipelineCharts = newCharts;
    }

    async function fetchPipelineData(pipeline: any): Promise<PipelineChartData[]> {
        if (pipeline.type === 'build') {
            // For build pipelines, we need to track test runs separately
            // Map from testRunName to chart data
            const testRunCharts = new Map<string, Array<{ date: string; passed: number | null; failed: number | null }>>();
            
            for (let dayIndex = 0; dayIndex < last7Days.length; dayIndex++) {
                const date = last7Days[dayIndex];
                const dateStr = getDateString(date);
                const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                try {
                    const data = await pipelineDataService.fetchBuildDataSilent(dateStr, pipeline.id);
                    
                    if (data && Array.isArray(data)) {
                        // Multiple test runs for this build
                        for (const build of data) {
                            // Only track builds that have a testRunName (ignore the base build without test runs)
                            if (!build.testRunName) continue;
                            
                            const testRunName = build.testRunName;
                            if (!testRunCharts.has(testRunName)) {
                                // Initialize this test run's data array with nulls for previous days
                                testRunCharts.set(testRunName, last7Days.slice(0, dayIndex).map(d => ({
                                    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                    passed: null,
                                    failed: null
                                })));
                            }
                            
                            const hasData = (build.passedTestCount || 0) > 0 || (build.failedTestCount || 0) > 0;
                            testRunCharts.get(testRunName)!.push({
                                date: formattedDate,
                                passed: hasData ? (build.passedTestCount || 0) : null,
                                failed: hasData ? (build.failedTestCount || 0) : null
                            });
                        }
                    } else if (data) {
                        // Single test run - only add if it has a testRunName
                        if (data.testRunName) {
                            const testRunName = data.testRunName;
                            if (!testRunCharts.has(testRunName)) {
                                testRunCharts.set(testRunName, last7Days.slice(0, dayIndex).map(d => ({
                                    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                    passed: null,
                                    failed: null
                                })));
                            }
                            
                            const hasData = (data.passedTestCount || 0) > 0 || (data.failedTestCount || 0) > 0;
                            testRunCharts.get(testRunName)!.push({
                                date: formattedDate,
                                passed: hasData ? (data.passedTestCount || 0) : null,
                                failed: hasData ? (data.failedTestCount || 0) : null
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching data for ${pipeline.displayName} on ${dateStr}:`, error);
                }
                
                // Fill nulls for test runs that didn't have data this day
                for (const [testRunName, chartData] of testRunCharts.entries()) {
                    if (chartData.length <= dayIndex) {
                        chartData.push({ date: formattedDate, passed: null, failed: null });
                    }
                }
            }
            
            // Convert map to array of charts
            const charts: PipelineChartData[] = [];
            for (const [testRunName, chartData] of testRunCharts.entries()) {
                charts.push({
                    pipelineId: pipeline.id,
                    displayName: pipeline.displayName,
                    testRunName: testRunName,
                    type: 'build',
                    data: chartData,
                    loading: false
                });
            }
            
            // Return empty array if no test runs found (don't show the base pipeline)
            return charts;
            
        } else {
            // Release pipelines - simple aggregation
            const chartData: Array<{ date: string; passed: number | null; failed: number | null }> = [];
            
            for (let dayIndex = 0; dayIndex < last7Days.length; dayIndex++) {
                const date = last7Days[dayIndex];
                const dateStr = getDateString(date);
                const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                try {
                    const data = await pipelineDataService.fetchReleaseDataSilent(dateStr, pipeline.id);
                    if (data) {
                        const hasData = (data.passedTestCount || 0) > 0 || (data.failedTestCount || 0) > 0;
                        chartData.push({ 
                            date: formattedDate, 
                            passed: hasData ? (data.passedTestCount || 0) : null, 
                            failed: hasData ? (data.failedTestCount || 0) : null 
                        });
                    } else {
                        chartData.push({ date: formattedDate, passed: null, failed: null });
                    }
                } catch (error) {
                    console.error(`Error fetching data for ${pipeline.displayName} on ${dateStr}:`, error);
                    chartData.push({ date: formattedDate, passed: null, failed: null });
                }
            }
            
            return [{
                pipelineId: pipeline.id,
                displayName: pipeline.displayName,
                type: 'release',
                data: chartData,
                loading: false
            }];
        }
    }

    function calculateTotals(data: Array<{ passed: number | null; failed: number | null }>) {
        const totalPassed = data.reduce((sum, d) => sum + (d.passed || 0), 0);
        const totalFailed = data.reduce((sum, d) => sum + (d.failed || 0), 0);
        const total = totalPassed + totalFailed;
        const passRate = total > 0 ? Math.round((totalPassed / total) * 100) : 0;
        return { totalPassed, totalFailed, total, passRate };
    }
</script>

<div class="w-full h-full">
    <div class="p-4 lg:p-0 lg:pb-0 pb-20 flex flex-col gap-4">
        {#if pipelineCharts.length === 0}
            <div class="flex items-center justify-center h-full">
                <p class="text-muted-foreground">No pipeline configuration found</p>
            </div>
        {:else}
            {#each pipelineCharts as pipelineChart (pipelineChart.pipelineId + '-' + (pipelineChart.testRunName || 'default'))}
                    <Card.Root class="py-0">
                        <div class="p-4 pb-0">
                            <h3 class="text-lg font-semibold">
                                {pipelineChart.testRunName || pipelineChart.displayName}
                            </h3>
                            {#if pipelineChart.testRunName}
                                <p class="text-sm text-muted-foreground">
                                    {pipelineChart.displayName} - {pipelineChart.type === 'build' ? 'Build' : 'Release'} Pipeline
                                </p>
                            {/if}
                        </div>
                        <div class="p-2 w-full">
                            {#if pipelineChart.loading}
                                <Skeleton class="w-full h-64" />
                            {:else}
                                <Chart.Container config={chartConfig} class="h-48 w-full">
                                    <BarChart
                                        bind:context={pipelineChart.context}
                                        data={pipelineChart.data}
                                        xScale={scaleBand().padding(0.25)}
                                        x="date"
                                        axis="x"
                                        rule={false}
                                        series={[
                                            { key: "passed", label: "Passed", color: chartConfig.passed.color, props: { rounded: "none" } },
                                            { key: "failed", label: "Failed", color: chartConfig.failed.color, props: { rounded: "none" } },
                                        ]}
                                        seriesLayout="stack"
                                        props={{
                                            bars: {
                                                stroke: "none",
                                                strokeWidth: 0,
                                                rx: 0,
                                                ry: 0,
                                                fillOpacity: 1,
                                                initialY: pipelineChart.context?.height,
                                                initialHeight: 0,
                                                motion: {
                                                    y: { type: "tween", duration: 500, easing: cubicInOut },
                                                    height: { type: "tween", duration: 500, easing: cubicInOut },
                                                },
                                            },
                                            highlight: { area: false },
                                        }}
                                    >
                                        {#snippet belowMarks()}
                                            <Highlight area={{ class: "fill-muted" }} />
                                        {/snippet}
                                        {#snippet tooltip()}
                                            <Chart.Tooltip>
                                                {#snippet formatter({ value, name })}
                                                    <div class="flex w-full items-center justify-between gap-2">
                                                        <span class="text-muted-foreground">{name}</span>
                                                        <span class="font-mono font-medium">
                                                            {value !== null && value !== undefined ? value.toLocaleString() : '0'}
                                                        </span>
                                                    </div>
                                                {/snippet}
                                            </Chart.Tooltip>
                                        {/snippet}
                                    </BarChart>
                                </Chart.Container>
                            {/if}
                        </div>
                    </Card.Root>
                {/each}
            {/if}
    </div>
</div>
