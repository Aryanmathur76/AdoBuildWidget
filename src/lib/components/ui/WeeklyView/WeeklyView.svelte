<script lang="ts">
    import { slide } from "svelte/transition";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import HeatmapButton from "../BuildHeatmap/HeatmapButton.svelte";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import {
        getCachedDayQuality,
        setCachedDayQuality,
    } from "$lib/stores/pipelineCache.js";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import { env } from "$env/dynamic/public";
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { getPipelineConfig } from "$lib/utils.js";

    const today = new Date();

    // Helper to get YYYY-MM-DD string for a given date
    function getDateString(date: Date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    // Helper to check if a given date is in the future (including today)
    function isFutureDay(date: Date) {
        const dayDate = new Date(date);
        dayDate.setHours(0, 0, 0, 0);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        return dayDate > todayDate;
    }

    // Store build quality for each day (YYYY-MM-DD => quality)
    type DayBuildQuality = {
        quality: string;
        releasesWithTestsRan?: number;
        totalPassCount?: number;
        totalFailCount?: number;
    };
    let dayBuildQuality = $state<Record<string, DayBuildQuality>>({});

    // Get pipeline configuration for optional prefetching
    let pipelineConfig = $state<{
        pipelines: Array<{ id: string | number; type: string; displayName?: string }>;
    } | null>(null);

    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch (e) {
        console.warn("Failed to parse pipeline config for prefetching:", e);
    }

    // Calculate the last 7 days from today (including today)
    const last7Days = $derived((() => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = getDateString(date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            
            let colorClass = "";
            const quality = dayBuildQuality[dateStr]?.quality ?? "unknown";
            switch (quality) {
                case "good":
                    colorClass = "bg-lime-600 text-white";
                    break;
                case "ok":
                    colorClass = "bg-yellow-400 text-black";
                    break;
                case "bad":
                    colorClass = "bg-red-600 text-white";
                    break;
                case "inProgress":
                    colorClass = "bg-sky-500 text-white";
                    break;
                case "interrupted":
                    colorClass = "bg-orange-600 text-white";
                    break;
                case "unknown":
                    colorClass = "bg-zinc-700 text-white";
                    break;
                default:
                    colorClass = "bg-zinc-700 text-white";
                    break;
            }

            const buildQuality = dayBuildQuality[dateStr] ?? {};
            days.push({
                day: date.getDate(),
                dateStr,
                dayName,
                quality,
                colorClass,
                disabled: isFutureDay(date),
                totalPassCount: buildQuality.totalPassCount,
                totalFailCount: buildQuality.totalFailCount,
                releasesWithTestsRan: buildQuality.releasesWithTestsRan,
            });
        }
        return days;
    })());

    // Calculate weekly statistics
    const weeklyStats = $derived((() => {
        const completedDays = last7Days.filter(day => !day.disabled && dayBuildQuality[day.dateStr]);
        
        if (completedDays.length === 0) {
            return {
                totalBuilds: 0,
                successRate: 0,
                totalTests: 0,
                totalPassed: 0,
                totalFailed: 0,
                mostProblematicPipeline: "Loading...",
                bestPerformingDay: null,
                worstPerformingDay: null,
                goodDays: 0,
                badDays: 0,
                okDays: 0,
                inProgressDays: 0,
                interruptedDays: 0,
                unknownDays: 0
            };
        }

        const totalPassed = completedDays.reduce((sum, day) => sum + (day.totalPassCount || 0), 0);
        const totalFailed = completedDays.reduce((sum, day) => sum + (day.totalFailCount || 0), 0);
        const totalTests = totalPassed + totalFailed;
        const successRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

        // Count day qualities
        const goodDays = completedDays.filter(day => day.quality === "good").length;
        const badDays = completedDays.filter(day => day.quality === "bad").length;
        const okDays = completedDays.filter(day => day.quality === "ok").length;
        const inProgressDays = completedDays.filter(day => day.quality === "inProgress").length;
        const interruptedDays = completedDays.filter(day => day.quality === "interrupted").length;
        const unknownDays = completedDays.filter(day => day.quality === "unknown").length;

        // Find best performing day (prioritizes: pipelines ran, test volume, pass rate)
        const bestDay = completedDays.reduce((best, day) => {
            // Calculate comprehensive score for current day
            const dayTotalTests = (day.totalPassCount || 0) + (day.totalFailCount || 0);
            const dayPassRate = dayTotalTests > 0 ? (day.totalPassCount || 0) / dayTotalTests : 0;
            const dayPipelinesRan = day.releasesWithTestsRan || 0;
            
            // Composite score: pipelines weight (40%) + test volume weight (30%) + pass rate weight (30%)
            const dayScore = (dayPipelinesRan * 0.4) + (dayTotalTests * 0.0001 * 0.3) + (dayPassRate * 0.3);
            
            // Calculate comprehensive score for current best day
            const bestTotalTests = (best.totalPassCount || 0) + (best.totalFailCount || 0);
            const bestPassRate = bestTotalTests > 0 ? (best.totalPassCount || 0) / bestTotalTests : 0;
            const bestPipelinesRan = best.releasesWithTestsRan || 0;
            
            const bestScore = (bestPipelinesRan * 0.4) + (bestTotalTests * 0.0001 * 0.3) + (bestPassRate * 0.3);
            
            return dayScore > bestScore ? day : best;
        }, completedDays[0]);

        // Find worst performing day (prioritizes: fewer pipelines, fewer tests, lower pass rate)
        const worstDay = completedDays.reduce((worst, day) => {
            // Calculate comprehensive score for current day
            const dayTotalTests = (day.totalPassCount || 0) + (day.totalFailCount || 0);
            const dayPassRate = dayTotalTests > 0 ? (day.totalPassCount || 0) / dayTotalTests : 0;
            const dayPipelinesRan = day.releasesWithTestsRan || 0;
            
            // Composite score: pipelines weight (40%) + test volume weight (30%) + pass rate weight (30%)
            const dayScore = (dayPipelinesRan * 0.4) + (dayTotalTests * 0.0001 * 0.3) + (dayPassRate * 0.3);
            
            // Calculate comprehensive score for current worst day
            const worstTotalTests = (worst.totalPassCount || 0) + (worst.totalFailCount || 0);
            const worstPassRate = worstTotalTests > 0 ? (worst.totalPassCount || 0) / worstTotalTests : 0;
            const worstPipelinesRan = worst.releasesWithTestsRan || 0;
            
            const worstScore = (worstPipelinesRan * 0.4) + (worstTotalTests * 0.0001 * 0.3) + (worstPassRate * 0.3);
            
            return dayScore < worstScore ? day : worst;
        }, completedDays[0]);

        // For most problematic pipeline, we'll use a simple heuristic
        // In a real implementation, you'd track per-pipeline failure rates
        const mostProblematicPipeline = pipelineConfig?.pipelines?.[0]?.displayName || 
                                      pipelineConfig?.pipelines?.[0]?.id?.toString() || 
                                      "Unknown";

        return {
            totalBuilds: completedDays.reduce((sum, day) => sum + (day.releasesWithTestsRan || 1), 0),
            successRate,
            totalTests,
            totalPassed,
            totalFailed,
            mostProblematicPipeline,
            bestPerformingDay: bestDay,
            worstPerformingDay: worstDay,
            goodDays,
            badDays,
            okDays,
            inProgressDays,
            interruptedDays,
            unknownDays
        };
    })());

    // Fetch build quality for all days in the last 7 days
    $effect(() => {
        last7Days.forEach(dayObj => {
            if (!dayObj.disabled && !dayBuildQuality[dayObj.dateStr]) {
                fetchBuildQualityForDay(dayObj.dateStr);
            }
        });
    });

    // Fetch build quality for a given date (YYYY-MM-DD), skip future days
    async function fetchBuildQualityForDay(dateStr: string) {
        // Parse dateStr to create date object
        const [year, month, day] = dateStr.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        
        if (isFutureDay(date)) {
            dayBuildQuality[dateStr] = { quality: "unknown" };
            return;
        }

        // Check cache first
        const cached = getCachedDayQuality(dateStr);
        if (cached) {
            dayBuildQuality[dateStr] = {
                quality: cached.quality,
                releasesWithTestsRan: cached.releaseIds?.length || 0,
                totalPassCount: cached.totalPassCount,
                totalFailCount: cached.totalFailCount,
            };
            return;
        }

        try {
            const res = await fetch(`/api/getDayQuality?date=${dateStr}`);
            if (res.ok) {
                const data = await res.json();
                dayBuildQuality[dateStr] = {
                    quality: data.quality,
                    releasesWithTestsRan: data.releasesWithTestsRan,
                    totalPassCount: data.totalPassCount,
                    totalFailCount: data.totalFailCount,
                };

                // Cache the result
                setCachedDayQuality(dateStr, {
                    quality: data.quality,
                    releaseIds: data.releaseIds || [],
                    totalPassCount: data.totalPassCount || 0,
                    totalFailCount: data.totalFailCount || 0,
                });

                // Optional: Prefetch pipeline data for this day to improve navigation performance
                if (pipelineConfig?.pipelines) {
                    pipelineDataService
                        .prefetchPipelineData(
                            dateStr,
                            pipelineConfig.pipelines.map((p) => p.id.toString()),
                        )
                        .catch(() => {
                            // Silently ignore prefetch errors - this is just an optimization
                        });
                }
            } else {
                dayBuildQuality[dateStr] = { quality: "unknown" };
            }
        } catch {
            dayBuildQuality[dateStr] = { quality: "unknown" };
        }
    }
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
            <div class="grid grid-cols-2 gap-3 flex-1">
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
                                            {((dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalFailCount || 0)).toLocaleString()}
                                        </p>
                                    </div>
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Pass Rate</p>
                                        <p class="text-lg font-bold {(() => {
                                            const passRate = ((dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalFailCount || 0)) > 0 
                                                ? Math.round(((dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalPassCount || 0) / ((dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalFailCount || 0))) * 100)
                                                : 0;
                                            return passRate === 100 ? 'text-green-600' : passRate >= 70 ? 'text-yellow-600' : 'text-red-600';
                                        })()}">
                                            {((dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalFailCount || 0)) > 0 
                                                ? Math.round(((dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalPassCount || 0) / ((dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.bestPerformingDay.dateStr]?.totalFailCount || 0))) * 100)
                                                : 0}%
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
                                            {((dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalFailCount || 0)).toLocaleString()}
                                        </p>
                                    </div>
                                    <div class="text-center">
                                        <p class="text-xs text-muted-foreground">Pass Rate</p>
                                        <p class="text-lg font-bold {(() => {
                                            const passRate = ((dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalFailCount || 0)) > 0 
                                                ? Math.round(((dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalPassCount || 0) / ((dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalFailCount || 0))) * 100)
                                                : 0;
                                            return passRate === 100 ? 'text-green-600' : passRate >= 70 ? 'text-yellow-600' : 'text-red-600';
                                        })()}">
                                            {((dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalFailCount || 0)) > 0 
                                                ? Math.round(((dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalPassCount || 0) / ((dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalPassCount || 0) + (dayBuildQuality[weeklyStats.worstPerformingDay.dateStr]?.totalFailCount || 0))) * 100)
                                                : 0}%
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

                <!-- Work in Progress Placeholder -->
                <Card class="p-4 col-span-2">
                    <div class="flex flex-col items-center justify-center space-y-3 h-24">
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
