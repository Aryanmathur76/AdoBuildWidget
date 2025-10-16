<script lang="ts">
    import { slide } from "svelte/transition";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import HeatmapButton from "../BuildHeatmap/HeatmapButton.svelte";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import { getPipelineConfig } from "$lib/utils.js";
    import { getBuildStatusColor } from "$lib/constants/colors.js";
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

    const today = new Date();

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
                releasesWithTestsRan: buildQuality.releasesWithTestsRan,
            };
        });
    })());

    // Calculate weekly statistics
    const weeklyStats = $derived((() => {
        const stats = calculateWeeklyStats(last7Days, dayBuildQuality);
        
        // For most problematic pipeline, use a simple heuristic
        const mostProblematicPipeline = pipelineConfig?.pipelines?.[0]?.displayName || 
                                      pipelineConfig?.pipelines?.[0]?.id?.toString() || 
                                      "Unknown";

        return {
            ...stats,
            mostProblematicPipeline,
        };
    })());

    // Fetch build quality for all days in the last 7 days
    $effect(() => {
        const dateStrings = last7Days
            .filter(day => !day.disabled && !dayBuildQuality[day.dateStr])
            .map(day => day.dateStr);
        
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

<div class="w-full h-full" transition:slide={{ duration: 300 }}>
    <Card class="h-full flex flex-col py-2 border-0">
        <CardContent class="p-4 pt-0 flex flex-col h-full">
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
                                <HeatmapButton {dayObj} />
                            {:else if dayObj.disabled}
                                <HeatmapButton {dayObj} />
                            {:else}
                                <Skeleton class="w-full h-full rounded" />
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="grid grid-cols-2 gap-3 auto-rows-min">
                <!-- Combined Test Statistics -->
                <Card class="p-3 col-span-2">
                    <div class="flex flex-col space-y-2">
                        <div class="grid grid-cols-4 gap-4">
                            <div class="text-center">
                                <p class="text-xs text-muted-foreground">Total Tests</p>
                                <p class="text-lg font-bold">{weeklyStats.totalTests.toLocaleString()}</p>
                            </div>
                            <div class="text-center">
                                <p class="text-xs text-muted-foreground">Passed</p>
                                <p class="text-lg font-bold text-green-600">{weeklyStats.totalPassed.toLocaleString()}</p>
                            </div>
                            <div class="text-center">
                                <p class="text-xs text-muted-foreground">Failed</p>
                                <p class="text-lg font-bold text-red-600">{weeklyStats.totalFailed.toLocaleString()}</p>
                            </div>
                            <div class="text-center">
                                <p class="text-xs text-muted-foreground">Pass Rate</p>
                                <p class="text-lg font-bold {weeklyStats.successRate === 100 ? 'text-green-600' : weeklyStats.successRate >= 70 ? 'text-yellow-600' : 'text-red-600'}">{weeklyStats.successRate}%</p>
                            </div>
                        </div>
                    </div>
                </Card>

                <!-- Best & Worst Day Performance -->
                <div class="col-span-2 flex gap-3">
                    <!-- Best Day Performance -->
                    <Card class="p-3 flex-1">
                        <div class="flex flex-col space-y-2">
                            <div class="grid grid-cols-3 gap-4">
                                <div class="text-center">
                                    <p class="text-xs text-muted-foreground">Best Day</p>
                                    <p class="text-lg font-bold text-green-600">
                                        {weeklyStats.bestPerformingDay ? weeklyStats.bestPerformingDay.dayName : '-'}
                                    </p>
                                </div>
                                {#if weeklyStats.bestPerformingDay}
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Tests</p>
                                        <p class="text-lg font-bold">
                                            {(() => {
                                                const dayData = dayBuildQuality[weeklyStats.bestPerformingDay.dateStr];
                                                return ((dayData?.totalPassCount || 0) + (dayData?.totalFailCount || 0)).toLocaleString();
                                            })()}
                                        </p>
                                    </div>
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Pass Rate</p>
                                        <p class="text-lg font-bold {(() => {
                                            const dayData = dayBuildQuality[weeklyStats.bestPerformingDay.dateStr];
                                            const totalTests = (dayData?.totalPassCount || 0) + (dayData?.totalFailCount || 0);
                                            const passRate = totalTests > 0 ? Math.round(((dayData?.totalPassCount || 0) / totalTests) * 100) : 0;
                                            return passRate === 100 ? 'text-green-600' : passRate >= 70 ? 'text-yellow-600' : 'text-red-600';
                                        })()}">
                                            {(() => {
                                                const dayData = dayBuildQuality[weeklyStats.bestPerformingDay.dateStr];
                                                const totalTests = (dayData?.totalPassCount || 0) + (dayData?.totalFailCount || 0);
                                                return totalTests > 0 
                                                    ? Math.round(((dayData?.totalPassCount || 0) / totalTests) * 100)
                                                    : 0;
                                            })()}%
                                        </p>
                                    </div>
                                {:else}
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Tests</p>
                                        <p class="text-lg font-bold">-</p>
                                    </div>
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Pass Rate</p>
                                        <p class="text-lg font-bold">-</p>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </Card>

                    <!-- Worst Day Performance -->
                    <Card class="p-3 flex-1">
                        <div class="flex flex-col space-y-2">
                            <div class="grid grid-cols-3 gap-4">
                                <div class="text-center">
                                    <p class="text-xs text-muted-foreground text-center">Worst Day</p>
                                    <p class="text-lg font-bold text-red-600">
                                        {weeklyStats.worstPerformingDay ? weeklyStats.worstPerformingDay.dayName : '-'}
                                    </p>
                                </div>
                                {#if weeklyStats.worstPerformingDay}
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Tests</p>
                                        <p class="text-lg font-bold">
                                            {(() => {
                                                const dayData = dayBuildQuality[weeklyStats.worstPerformingDay.dateStr];
                                                return ((dayData?.totalPassCount || 0) + (dayData?.totalFailCount || 0)).toLocaleString();
                                            })()}
                                        </p>
                                    </div>
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Pass Rate</p>
                                        <p class="text-lg font-bold {(() => {
                                            const dayData = dayBuildQuality[weeklyStats.worstPerformingDay.dateStr];
                                            const totalTests = (dayData?.totalPassCount || 0) + (dayData?.totalFailCount || 0);
                                            const passRate = totalTests > 0 ? Math.round(((dayData?.totalPassCount || 0) / totalTests) * 100) : 0;
                                            return passRate === 100 ? 'text-green-600' : passRate >= 70 ? 'text-yellow-600' : 'text-red-600';
                                        })()}">
                                            {(() => {
                                                const dayData = dayBuildQuality[weeklyStats.worstPerformingDay.dateStr];
                                                const totalTests = (dayData?.totalPassCount || 0) + (dayData?.totalFailCount || 0);
                                                return totalTests > 0 
                                                    ? Math.round(((dayData?.totalPassCount || 0) / totalTests) * 100)
                                                    : 0;
                                            })()}%
                                        </p>
                                    </div>
                                {:else}
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Tests</p>
                                        <p class="text-lg font-bold">-</p>
                                    </div>
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Pass Rate</p>
                                        <p class="text-lg font-bold">-</p>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </Card>
                </div>

                <!-- Work inProgress Placeholder -->
                <Card class="p-4 col-span-2">
                    <div class="flex flex-col items-center justify-center space-y-3 h-max">
                        <div class="w-8 h-8 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center">
                            <svg class="w-4 h-4 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                        </div>
                        <div class="text-center">
                            <p class="text-xs text-muted-foreground/70 font-medium">More insights coming soon</p>
                            <p class="text-xs text-muted-foreground/50">Additional metrics and analytics</p>
                        </div>
                    </div>
                </Card>
            </div>

        </CardContent>
    </Card>
</div>
