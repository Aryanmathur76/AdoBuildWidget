<script lang="ts">
    import { slide } from "svelte/transition";
    import { browser } from "$app/environment";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import * as Chart from "$lib/components/ui/chart/index.js";
    import HeatmapButton from "../BuildHeatmap/HeatmapButton.svelte";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import { AIInsights } from "$lib/components/ui/AIInsights/index.js";
    import { LineChart } from "layerchart";
    import { scaleUtc } from "d3-scale";
    import { curveStep } from "d3-shape";
    import { getPipelineConfig } from "$lib/utils.js";
    import { getBuildStatusColor } from "$lib/constants/colors.js";
    import { typewriter } from "$lib/utils/typewriter.js";
    import { getTestQuality } from "$lib/constants/thresholds.js";
    import {
        getDateString,
        isFutureDay,
        getLastNDays,
        calculateWeeklyStats,
        fetchBuildQualitiesForDates,
        type DayBuildQuality,
        type PipelineConfig,
    } from "$lib/utils/buildQualityUtils.js";
    import { env } from "$env/dynamic/public";

    let { viewMode = "simple" }: { viewMode?: "simple" | "graph" } = $props();

    const today = new Date();
    const todayStr = getDateString(today);

    const formatCount = (value: number): string => value.toLocaleString();

    const formatMetric = (value: number): string =>
        value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const formatPercent = (value: number): string => `${formatMetric(value)}%`;

    const calculatePrecisePassRate = (passed: number, failed: number): number => {
        const totalExecuted = passed + failed;
        return totalExecuted > 0 ? (passed / totalExecuted) * 100 : 0;
    };

    const weeklyTrendChartConfig = {
        passRate: { label: "Pass Rate", color: "var(--chart-1)" },
    } satisfies Chart.ChartConfig;

    // Store build quality for each day (YYYY-MM-DD => quality)
    let dayBuildQuality = $state<Record<string, DayBuildQuality>>({});

    // Get pipeline configuration for optional prefetching
    let pipelineConfig: PipelineConfig | null = null;

    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch (e) {
        console.warn("Failed to parse pipeline config for prefetching:", e);
    }

    // Calculate the last 7 days from today (including today)
    const last7Days = $derived((() => {
        const days = getLastNDays(7, today);
        return days.map(date => {
            const dateStr = getDateString(date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const quality = dayBuildQuality[dateStr]?.quality ?? "unknown";
            const colorClass = getBuildStatusColor(quality);
            const buildQuality = dayBuildQuality[dateStr] ?? {};

            return {
                day: date.getDate(),
                dateStr,
                dayName,
                quality,
                colorClass,
                disabled: isFutureDay(date),
                totalPassCount: buildQuality.totalPassCount,
                totalFailCount: buildQuality.totalFailCount,
                totalNotRunCount: buildQuality.totalNotRunCount,
                releasesWithTestsRan: buildQuality.releasesWithTestsRan,
            };
        });
    })());

    const previous7Days = $derived((() => {
        const days = getLastNDays(14, today).slice(0, 7);
        return days.map(date => {
            const dateStr = getDateString(date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const quality = dayBuildQuality[dateStr]?.quality ?? "unknown";
            const colorClass = getBuildStatusColor(quality);
            const buildQuality = dayBuildQuality[dateStr] ?? {};

            return {
                day: date.getDate(),
                dateStr,
                dayName,
                quality,
                colorClass,
                disabled: isFutureDay(date),
                totalPassCount: buildQuality.totalPassCount,
                totalFailCount: buildQuality.totalFailCount,
                totalNotRunCount: buildQuality.totalNotRunCount,
                releasesWithTestsRan: buildQuality.releasesWithTestsRan,
            };
        });
    })());

    const weeklyPassRateChartData = $derived((() => {
        const allDays = getLastNDays(35, today);
        const series: Array<{ date: Date; passRate: number }> = [];

        for (let weekIndex = 0; weekIndex < 5; weekIndex++) {
            const weekDays = allDays.slice(weekIndex * 7, (weekIndex + 1) * 7);
            const { totalPassed, totalFailed } = weekDays.reduce(
                (totals, day) => {
                    const dateStr = getDateString(day);

                    if (dateStr === todayStr || isFutureDay(day) || !dayBuildQuality[dateStr]) {
                        return totals;
                    }

                    totals.totalPassed += dayBuildQuality[dateStr]?.totalPassCount || 0;
                    totals.totalFailed += dayBuildQuality[dateStr]?.totalFailCount || 0;
                    return totals;
                },
                { totalPassed: 0, totalFailed: 0 }
            );

            const totalExecuted = totalPassed + totalFailed;
            const passRate = totalExecuted > 0 ? (totalPassed / totalExecuted) * 100 : 0;
            series.push({
                date: weekDays[0],
                passRate,
            });
        }

        return series;
    })());

    const weeklyPassRateYDomain = $derived((() => {
        const rates = weeklyPassRateChartData.map(point => point.passRate);
        if (rates.length === 0) {
            return [0, 100] as [number, number];
        }

        const minRate = Math.min(...rates);
        const maxRate = Math.max(...rates);

        let lower = Math.floor(minRate - 0.2);
        let upper = Math.ceil(maxRate + 0.2);

        if (100 - upper <= 1) {
            upper = 100;
        }

        lower = Math.max(0, lower);
        upper = Math.min(100, upper);

        if (upper - lower < 2) {
            const midpoint = (upper + lower) / 2;
            lower = Math.max(0, Math.floor(midpoint - 1));
            upper = Math.min(100, Math.ceil(midpoint + 1));
        }

        return [lower, upper] as [number, number];
    })());

    // Calculate weekly statistics
    const weeklyStats = $derived((() => {
        const stats = calculateWeeklyStats(last7Days, dayBuildQuality, previous7Days);
        
        // For most problematic pipeline, use a simple heuristic
        const mostProblematicPipeline = pipelineConfig?.pipelines?.[0]?.displayName || 
                                      pipelineConfig?.pipelines?.[0]?.id?.toString() || 
                                      "Unknown";

        return {
            ...stats,
            mostProblematicPipeline,
        };
    })());

    const weeklyPassRatePrecise = $derived(
        calculatePrecisePassRate(weeklyStats.totalPassed, weeklyStats.totalFailed)
    );

    const weeklyPassRateQuality = $derived(getTestQuality(weeklyPassRatePrecise));
    const weeklyPassRateTextClass = $derived(
        weeklyPassRateQuality === "good"
            ? "text-green-600"
            : weeklyPassRateQuality === "ok"
                ? "text-yellow-600"
                : "text-red-600"
    );

    // Fetch build quality for all days needed by weekly and trend stats
    $effect(() => {
        const dateStrings = getLastNDays(35, today)
            .filter(date => !isFutureDay(date))
            .map(date => getDateString(date))
            .filter(dateStr => !dayBuildQuality[dateStr]);
        
        if (dateStrings.length > 0) {
            fetchBuildQualitiesForDates(dateStrings, pipelineConfig)
                .then(results => {
                    // Update dayBuildQuality with the results
                    dayBuildQuality = { ...dayBuildQuality, ...results };
                })
                .catch(error => {
                    console.error("Failed to fetch build qualities:", error);
                });
        }
    });
</script>

<div class="w-full flex-1 min-h-0" transition:slide={{ duration: 300 }}>
    <Card class="h-full flex flex-col py-0 border-0 bg-transparent shadow-none">
        <CardContent class="p-0 xl:pb-0 pt-1 flex flex-col h-full">
            <span class="text-xs font-bold uppercase tracking-widest text-primary font-mono mb-3 inline-flex items-center gap-1.5"><span class="text-muted-foreground opacity-60">>_</span><span use:typewriter>Daily Tests · Weekly</span></span>
            <!-- Day labels and buttons row -->
            <div class="mb-4">
                <div class="grid grid-cols-7 gap-0.5 mb-2">
                    {#each last7Days as dayObj, i (dayObj.dateStr)}
                        <div class="text-center text-xs font-medium text-muted-foreground">
                            {dayObj.dayName}
                        </div>
                    {/each}
                </div>
                <div class="grid grid-cols-7 gap-0.5">
                    {#each last7Days as dayObj, index (dayObj.dateStr)}
                        <div class="aspect-square">
                            {#if dayBuildQuality[dayObj.dateStr]}
                                <HeatmapButton {dayObj} delay={index * 100} viewMode={viewMode} />
                            {:else if dayObj.disabled}
                                <HeatmapButton {dayObj} delay={index * 100} viewMode={viewMode} />
                            {:else}
                                <Skeleton class="w-full h-full rounded" />
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="flex flex-col gap-3 flex-1 min-h-0">
                <!-- Combined Test Statistics -->
                {#if browser}
                    <Card class="p-3 hidden md:block bg-background/60 border border-border/50">
                        <div class="flex flex-col space-y-2">
                            <div class="grid grid-cols-5 gap-4">
                                <div class="text-center">
                                    <p class="text-xs text-muted-foreground">Total</p>
                                    <p class="text-lg font-bold">{formatCount(weeklyStats.totalTests)}</p>
                                </div>
                                <div class="text-center">
                                    <p class="text-xs text-muted-foreground">Passed</p>
                                    <p class="text-lg font-bold text-green-600">{formatCount(weeklyStats.totalPassed)}</p>
                                </div>
                                <div class="text-center">
                                    <p class="text-xs text-muted-foreground">Failed</p>
                                    <p class="text-lg font-bold text-red-600">{formatCount(weeklyStats.totalFailed)}</p>
                                </div>
                                <div class="text-center">
                                    <p class="text-xs text-muted-foreground">Not Run</p>
                                    <p class="text-lg font-bold text-muted-foreground">{formatCount(weeklyStats.totalNotRun)}</p>
                                </div>
                                <div class="text-center">
                                    <p class="text-xs text-muted-foreground">Pass Rate</p>
                                    <p class="text-lg font-bold {weeklyPassRateTextClass}">{formatPercent(weeklyPassRatePrecise)}</p>
                                </div>
                            </div>
                            <div class="pt-2 border-t border-border/30">
                                <div class="w-full min-w-0">
                                    <p class="text-xs text-muted-foreground mb-2">Pass Rate Trend (5 Weeks)</p>
                                    <div class="h-14 w-full">
                                        <Chart.Container config={weeklyTrendChartConfig} class="h-full w-full p-0">
                                            <LineChart
                                                data={weeklyPassRateChartData}
                                                x="date"
                                                yDomain={weeklyPassRateYDomain}
                                                xScale={scaleUtc()}
                                                axis="x"
                                                series={[
                                                    {
                                                        key: "passRate",
                                                        label: "Pass Rate",
                                                        color: weeklyTrendChartConfig.passRate.color,
                                                    },
                                                ]}
                                                props={{
                                                    spline: { curve: curveStep, strokeWidth: 1.5, fillOpacity: 0, motion: "tween" },
                                                    xAxis: {
                                                        format: (v: Date) => v.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
                                                        ticks: 5,
                                                    },
                                                    yAxis: { ticks: 2 },
                                                    highlight: { points: { r: 0 } },
                                                }}
                                            >
                                                {#snippet tooltip()}
                                                    <Chart.Tooltip hideLabel>
                                                        {#snippet formatter({ value, item })}
                                                            <div class="flex w-full items-center justify-between gap-3">
                                                                <span class="text-muted-foreground">Week of {new Date(item.payload.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
                                                                <span class="font-mono font-medium">{formatPercent(Number(value))}</span>
                                                            </div>
                                                        {/snippet}
                                                    </Chart.Tooltip>
                                                {/snippet}
                                            </LineChart>
                                        </Chart.Container>
                                    </div>
                                    <div class="flex justify-between text-[10px] text-muted-foreground">
                                        <span>5w ago</span>
                                        <span>Now</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                {/if}

                <!-- AI Insights -->
                {#if browser}
                    <AIInsights/>
                {/if}
            </div>

        </CardContent>
    </Card>
</div>
