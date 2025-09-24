<script lang="ts">
    import { slide } from "svelte/transition";
    import { fly } from "svelte/transition";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import HeatmapButton from "../BuildHeatmap/HeatmapButton.svelte";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import CardTitle from "../card/card-title.svelte";
    import {
        getCachedDayQuality,
        setCachedDayQuality,
    } from "$lib/stores/pipelineCache.js";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import { env } from "$env/dynamic/public";

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
    let dayBuildQuality: Record<string, DayBuildQuality> = {};

    // Get pipeline configuration for optional prefetching
    let pipelineConfig: {
        pipelines: Array<{ id: string; type: string }>;
    } | null = null;

    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch (e) {
        console.warn("Failed to parse pipeline config for prefetching:", e);
    }

    // Calculate the last 7 days from today (including today)
    $: last7Days = (() => {
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
    })();

    // Fetch build quality for all days in the last 7 days
    $: {
        last7Days.forEach(dayObj => {
            if (!dayObj.disabled && !dayBuildQuality[dayObj.dateStr]) {
                fetchBuildQualityForDay(dayObj.dateStr);
            }
        });
    }

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
                            pipelineConfig.pipelines.map((p) => p.id),
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
    <Card
        class="py-0 border-0 shadow-none h-full rounded-none overflow-hidden flex flex-col"
    >
        <CardContent class="h-full px-2 pb-2 flex flex-col">
            <!-- Day labels for the last 7 days -->
            <div class="grid grid-cols-7 gap-0.5 mb-1 h-5 items-center flex-shrink-0">
                {#each last7Days as dayObj, i (dayObj.dateStr)}
                    <div
                        class="text-center text-xs font-medium text-muted-foreground h-full flex items-center justify-center"
                        in:fly={{
                            y: -15,
                            duration: 250,
                            delay: i * 30,
                        }}
                        out:fly={{ y: 15, duration: 150 }}
                    >
                        {dayObj.dayName}
                    </div>
                {/each}
            </div>

            <!-- Last 7 days grid -->
            <div class="grid grid-cols-7 gap-0.5 mb-4 flex-shrink-0" style="height: 120px;">
                {#each last7Days as dayObj, index (dayObj.dateStr)}
                    <div
                        class="w-full aspect-square min-w-0 min-h-0"
                        in:fly={{
                            y: 10,
                            duration: 200,
                            delay: index * 15,
                        }}
                    >
                        {#if dayBuildQuality[dayObj.dateStr]}
                            <HeatmapButton {dayObj} />
                        {:else if dayObj.disabled}
                            <HeatmapButton {dayObj} />
                        {:else}
                            <Skeleton
                                class="w-full h-full min-w-0 min-h-0 rounded"
                                style="aspect-ratio: 1 / 1;"
                            />
                        {/if}
                    </div>
                {/each}
            </div>
            
            <!-- Empty space placeholder as requested -->
            <div class="flex-1 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg mt-10 p-5">
                <div class="text-center text-muted-foreground">
                    <span class="material-symbols-outlined text-4xl block opacity-50">construction</span>
                    <p class="text-sm">Additional content area</p>
                    <p class="text-xs opacity-75">Reserved for future features</p>
                </div>
            </div>
        </CardContent>
    </Card>
</div>
