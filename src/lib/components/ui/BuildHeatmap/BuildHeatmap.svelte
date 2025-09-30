<script lang="ts">
    import { slide } from "svelte/transition";
    import { fly } from "svelte/transition";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import HeatmapButton from "./HeatmapButton.svelte";
    import WeeklyView from "../WeeklyView/WeeklyView.svelte";
    import * as Pagination from "$lib/components/ui/pagination/index.js";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import CardTitle from "../card/card-title.svelte";
    import { env } from "$env/dynamic/public";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import { getBuildStatusColor, getHeaderStatusColor } from "$lib/constants/colors.js";
    import {
        getDateString,
        isFutureDay,
        getDatesInMonth,
        getDayOfWeekLabels,
        fetchBuildQualitiesForDates,
        type DayBuildQuality,
        type PipelineConfig,
    } from "$lib/utils/buildQualityUtils.js";

    // Svelte binding for Pagination.Root (1-based page index)
    const today = new Date();
    let currentMonth = today.getMonth();
    let currentMonthPage = currentMonth + 1;
    $: currentMonth = currentMonthPage - 1;

    // Track current tab for animations
    let currentTab = "Monthly";
    let tabAnimationKey = 0;

    // Trigger animation when switching back to Monthly tab
    $: if (currentTab === "Monthly") {
        tabAnimationKey = Date.now();
    }

    const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    const currentYear = new Date().getFullYear();
    const months = monthNames.map((name, idx) => {
        // Get days in month: new Date(year, month+1, 0) gives last day of month
        const days = new Date(currentYear, idx + 1, 0).getDate();
        return { name, days };
    });

    // Store build quality for each day (YYYY-MM-DD => quality)
    let dayBuildQuality: Record<string, DayBuildQuality> = {};

    // Get pipeline configuration for optional prefetching
    let pipelineConfig: PipelineConfig | null = null;

    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch (e) {
        console.warn("Failed to parse pipeline config for prefetching:", e);
    }

    // Calculate what days of the week each position represents based on the 1st of the month
    $: dayLabels = getDayOfWeekLabels(currentYear, currentMonth);

    $: daysInMonth = Array.from(
        { length: months[currentMonth].days },
        (_, dIdx) => {
            const day = dIdx + 1;
            const dateStr = getDateString(currentYear, currentMonth, day);
            const quality = dayBuildQuality[dateStr]?.quality ?? "unknown";
            const colorClass = getBuildStatusColor(quality);

            const buildQuality = dayBuildQuality[dateStr] ?? {};
            return {
                day,
                dateStr,
                quality,
                colorClass,
                animationClass: "",
                disabled: isFutureDay(currentYear, currentMonth, day),
                totalPassCount: buildQuality.totalPassCount,
                totalFailCount: buildQuality.totalFailCount,
                releasesWithTestsRan: buildQuality.releasesWithTestsRan,
            };
        },
    );

    // Fetch all build qualities for the current month only when the month changes
    let lastFetchedMonth = -1;
    $: if (currentMonth !== lastFetchedMonth) {
        lastFetchedMonth = currentMonth;
        fetchAllBuildQualitiesForMonth();
    }

    // Parallelize API calls with a concurrency limit
    async function fetchAllBuildQualitiesForMonth() {
        const dateStrings = getDatesInMonth(currentYear, currentMonth)
            .filter(dateStr => !dayBuildQuality[dateStr]);

        if (dateStrings.length > 0) {
            // Prefetch all detailed pipeline data for the month (builds/releases)
            pipelineDataService.prefetchAllPipelineDataForMonth(dateStrings, pipelineConfig);
            for (const dateStr of dateStrings) {
                (async () => {
                    const result = await fetchBuildQualitiesForDates([dateStr], pipelineConfig);
                    if (result && result[dateStr]) {
                        dayBuildQuality = { ...dayBuildQuality, [dateStr]: result[dateStr] };
                    }
                })();
            }
        }
    }
</script>

<div class="w-full h-full" transition:slide={{ duration: 300 }}>
    <Card
        class="py-0 border-0 shadow-none h-full rounded-none overflow-hidden flex flex-col"
    >
        <Tabs.Root bind:value={currentTab} class="h-full flex flex-col">
            <div class="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
                <CardTitle class="flex-shrink-0">
                    <span
                        class={`inline-flex rounded text-base font-bold px-2 py-1 items-center gap-1 ${getHeaderStatusColor(
                            dayBuildQuality[
                                getDateString(
                                    currentYear,
                                    currentMonth,
                                    today.getDate(),
                                )
                            ]?.quality ?? "unknown"
                        )}`}
                    >
                        <span
                            class="material-symbols-outlined"
                            style="font-size: 1.75em; line-height: 1;"
                            >health_metrics</span
                        >
                        DELTAV BUILD HEALTH - BETA
                    </span>
                </CardTitle>

                <Tabs.List class="flex-shrink-0">
                    <Tabs.Trigger value="Monthly" class="flex items-center gap-2">
                        <span class="material-symbols-outlined" style="font-size: 1.75em; line-height: 1;">view_module</span>
                        <span class="sr-only">Monthly</span>
                    </Tabs.Trigger>
                    <Tabs.Trigger value="Weekly" class="flex items-center gap-2">
                        <span class="material-symbols-outlined" style="font-size: 1.75em; line-height: 1;">view_week</span>
                        <span class="sr-only">Weekly</span>
                    </Tabs.Trigger>
                </Tabs.List>
            </div>

            <div class="flex-1 overflow-y-auto">
                <Tabs.Content value="Monthly" class="h-full">
                    <CardContent class="h-full px-4 pb-2 flex flex-col">
                        <!-- Dynamic day of week labels with animation -->
                        <div class="grid grid-cols-7 gap-0.5 mb-1 h-5 items-center flex-shrink-0">
                            {#each dayLabels as label, i (currentMonth + "-" + i + "-" + tabAnimationKey)}
                                <div
                                    class="text-center text-xs font-medium text-muted-foreground h-full flex items-center justify-center"
                                    in:fly={{
                                        y: -15,
                                        duration: 250,
                                        delay: i * 30,
                                    }}
                                    out:fly={{ y: 15, duration: 150 }}
                                >
                                    {label}
                                </div>
                            {/each}
                        </div>

                        <div class="grid grid-cols-7 gap-0.5 mb-2 flex-1">
                            {#each daysInMonth as dayObj, index (currentMonth + "-" + dayObj.day + "-" + tabAnimationKey)}
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
                        <div class="flex justify-center flex-shrink-0">
                            <Pagination.Root
                                count={months.length}
                                perPage={1}
                                siblingCount={1}
                                bind:page={currentMonthPage}
                            >
                                {#snippet children({ pages, currentPage })}
                                    <Pagination.Content>
                                        <Pagination.Item>
                                            <Pagination.PrevButton />
                                        </Pagination.Item>
                                        {#each pages as page (page.key)}
                                            {#if page.type === "ellipsis"}
                                                <Pagination.Item>
                                                    <Pagination.Ellipsis />
                                                </Pagination.Item>
                                            {:else}
                                                <Pagination.Item>
                                                    <Pagination.Link
                                                        {page}
                                                        isActive={currentPage ===
                                                            page.value}
                                                    >
                                                        {monthNames[
                                                            page.value - 1
                                                        ].slice(0, 3)}
                                                    </Pagination.Link>
                                                </Pagination.Item>
                                            {/if}
                                        {/each}
                                        <Pagination.Item>
                                            <Pagination.NextButton />
                                        </Pagination.Item>
                                    </Pagination.Content>
                                {/snippet}
                            </Pagination.Root>
                        </div>
                    </CardContent>
                </Tabs.Content>
                <Tabs.Content value="Weekly" class="h-full">
                    <WeeklyView />
                </Tabs.Content>
            </div>
        </Tabs.Root>
    </Card>
</div>
