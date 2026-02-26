<script lang="ts">
    import * as Card from "$lib/components/ui/card/index.js";
    import * as Chart from "$lib/components/ui/chart/index.js";
    import { scaleBand } from "d3-scale";
    import { BarChart, Highlight, type ChartContextValue } from "layerchart";
    import { cubicInOut } from "svelte/easing";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import { env } from "$env/dynamic/public";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import { 
        getDateString, 
        getLastNDays,
        type PipelineConfig 
    } from "$lib/utils/buildQualityUtils.js";
    import { getPipelineConfig } from "$lib/utils.js";

    const today = new Date();
    let selectedDays = $state<7 | 14 | 30>(7);

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
        notRun: { label: "Not Run", color: "var(--muted)" },
        label: { color: "var(--background)" },
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
            notRun: number | null;
        }>;
        loading: boolean;
        context?: ChartContextValue;
    };

    let pipelineCharts = $state<PipelineChartData[]>([]);
    let last7Days = $derived(getLastNDays(selectedDays, today));

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
                    notRun: null,
                })),
                loading: true,
            }));
            fetchAllPipelineData();
        }
    });

    async function fetchAllPipelineData() {
        if (!pipelineConfig?.pipelines) return;

        await Promise.allSettled(
            pipelineConfig.pipelines.map(pipeline =>
                fetchPipelineData(pipeline).then(charts => {
                    // Replace the loading placeholder for this pipeline with real data
                    pipelineCharts = [
                        ...pipelineCharts.filter(c => c.pipelineId !== String(pipeline.id) || !c.loading),
                        ...charts,
                    ];
                })
            )
        );
    }

    async function fetchPipelineData(pipeline: any): Promise<PipelineChartData[]> {
        if (pipeline.type === 'build') {
            // For build pipelines, we need to track test runs separately
            // Map from testRunName to chart data
            const testRunCharts = new Map<string, Array<{ date: string; passed: number | null; failed: number | null; notRun: number | null }>>();
            
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
                                    failed: null,
                                    notRun: null
                                })));
                            }
                            
                            const hasData = (build.passedTestCount || 0) > 0 || (build.failedTestCount || 0) > 0 || (build.notRunTestCount || 0) > 0;
                            testRunCharts.get(testRunName)!.push({
                                date: formattedDate,
                                passed: hasData ? (build.passedTestCount || 0) : null,
                                failed: hasData ? (build.failedTestCount || 0) : null,
                                notRun: hasData ? (build.notRunTestCount || 0) : null
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
                                    failed: null,
                                    notRun: null
                                })));
                            }
                            
                            const hasData = (data.passedTestCount || 0) > 0 || (data.failedTestCount || 0) > 0 || (data.notRunTestCount || 0) > 0;
                            testRunCharts.get(testRunName)!.push({
                                date: formattedDate,
                                passed: hasData ? (data.passedTestCount || 0) : null,
                                failed: hasData ? (data.failedTestCount || 0) : null,
                                notRun: hasData ? (data.notRunTestCount || 0) : null
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching data for ${pipeline.displayName} on ${dateStr}:`, error);
                }
                
                // Fill nulls for test runs that didn't have data this day
                for (const [testRunName, chartData] of testRunCharts.entries()) {
                    if (chartData.length <= dayIndex) {
                        chartData.push({ date: formattedDate, passed: null, failed: null, notRun: null });
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
            const chartData: Array<{ date: string; passed: number | null; failed: number | null; notRun: number | null }> = [];
            
            for (let dayIndex = 0; dayIndex < last7Days.length; dayIndex++) {
                const date = last7Days[dayIndex];
                const dateStr = getDateString(date);
                const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                try {
                    const data = await pipelineDataService.fetchReleaseDataSilent(dateStr, pipeline.id);
                    if (data) {
                        const hasData = (data.passedTestCount || 0) > 0 || (data.failedTestCount || 0) > 0 || (data.notRunTestCount || 0) > 0;
                        chartData.push({ 
                            date: formattedDate, 
                            passed: hasData ? (data.passedTestCount || 0) : null, 
                            failed: hasData ? (data.failedTestCount || 0) : null,
                            notRun: hasData ? (data.notRunTestCount || 0) : null
                        });
                    } else {
                        chartData.push({ date: formattedDate, passed: null, failed: null, notRun: null });
                    }
                } catch (error) {
                    console.error(`Error fetching data for ${pipeline.displayName} on ${dateStr}:`, error);
                    chartData.push({ date: formattedDate, passed: null, failed: null, notRun: null });
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

    function calculateTotals(data: Array<{ passed: number | null; failed: number | null; notRun: number | null }>) {
        const totalPassed = data.reduce((sum, d) => sum + (d.passed || 0), 0);
        const totalFailed = data.reduce((sum, d) => sum + (d.failed || 0), 0);
        const totalNotRun = data.reduce((sum, d) => sum + (d.notRun || 0), 0);
        const total = totalPassed + totalFailed + totalNotRun;
        const passRate = total > 0 ? Math.round((totalPassed / total) * 100) : 0;
        return { totalPassed, totalFailed, totalNotRun, total, passRate };
    }
</script>

<div class="h-full p-0 pt-1 flex flex-col gap-4">
    <div class="flex items-start justify-between gap-4">
        <span class="text-xs font-bold uppercase tracking-widest text-primary font-mono">▶ Pipeline Analytics</span>
        <div class="flex items-center gap-2">
            <button
                class="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors {selectedDays === 7 ? 'border-primary/50 bg-primary/20 text-primary-foreground' : 'border-input/50 bg-background/20 hover:bg-accent/20 hover:text-accent-foreground'}"
                onclick={() => selectedDays = 7}
            >
                7 Days
            </button>
            <button
                class="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors {selectedDays === 14 ? 'border-primary/50 bg-primary/20 text-primary-foreground' : 'border-input/50 bg-background/20 hover:bg-accent/20 hover:text-accent-foreground'}"
                onclick={() => selectedDays = 14}
            >
                14 Days
            </button>
            <button
                class="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors {selectedDays === 30 ? 'border-primary/50 bg-primary/20 text-primary-foreground' : 'border-input/50 bg-background/20 hover:bg-accent/20 hover:text-accent-foreground'}"
                onclick={() => selectedDays = 30}
            >
                30 Days
            </button>
        </div>
    </div>
    {#if pipelineCharts.length === 0}
        <div class="flex items-center justify-center h-full">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined text-muted-foreground" style="font-size: 3em;">settings_suggest</span>
                <p class="text-sm font-medium">No pipelines configured</p>
                <p class="text-xs text-muted-foreground">Set <code class="font-mono bg-muted px-1">PUBLIC_AZURE_PIPELINE_CONFIG</code> to get started</p>
            </div>
        </div>
    {:else}
        {#each pipelineCharts as pipelineChart (pipelineChart.pipelineId + '-' + (pipelineChart.testRunName || 'default'))}
                <Card.Root class="bg-background/60 border border-border/50">
                    <Card.Header>
                        <Card.Title>
                            {pipelineChart.testRunName || pipelineChart.displayName}
                        </Card.Title>
                        {#if pipelineChart.testRunName}
                            <Card.Description>
                                {pipelineChart.displayName} - {pipelineChart.type === 'build' ? 'Build' : 'Release'} Pipeline
                            </Card.Description>
                        {/if}
                    </Card.Header>
                    <Card.Content>
                        {#if pipelineChart.loading}
                            <Skeleton class="w-full h-40 mb-5" />
                        {:else}
                            <Chart.Container config={chartConfig} class="h-40 w-full mb-0">
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
                                        { key: "notRun", label: "Not Run", color: chartConfig.notRun.color, props: { rounded: "none" } },
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
                    </Card.Content>
                    {#if !pipelineChart.loading}
                        {@const totals = calculateTotals(pipelineChart.data)}
                        <Card.Footer>
                            <div class="flex w-full items-start text-sm">
                                <div class="grid gap-2">
                                    <div class="flex items-center gap-2 font-medium leading-none">
                                        Pass Rate: {totals.passRate}% ({totals.totalPassed}/{totals.total} tests)
                                    </div>
                                    <div class="text-muted-foreground flex items-center gap-2 leading-none mb-4">
                                        {#if totals.totalFailed > 0 || totals.totalNotRun > 0}
                                            {#if totals.totalFailed > 0}
                                                {totals.totalFailed} failed{#if totals.totalNotRun > 0}, {totals.totalNotRun} not run{/if}
                                            {:else}
                                                {totals.totalNotRun} not run
                                            {/if}
                                            in the last {selectedDays} days
                                        {:else}
                                            All tests passed in the last {selectedDays} days
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        </Card.Footer>
                    {/if}
                </Card.Root>
            {/each}
        {/if}
</div>
