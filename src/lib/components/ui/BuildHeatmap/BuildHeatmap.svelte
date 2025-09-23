<script lang="ts">
    import { slide } from "svelte/transition";
    import { fly } from "svelte/transition";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import HeatmapButton from "./HeatmapButton.svelte";
    import * as Pagination from "$lib/components/ui/pagination/index.js";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import CardTitle from "../card/card-title.svelte";
    import { getCachedDayQuality, setCachedDayQuality } from "$lib/stores/pipelineCache.js";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import { env } from "$env/dynamic/public";

    // Svelte binding for Pagination.Root (1-based page index)
    const today = new Date();
    let currentMonth = today.getMonth();
    let currentMonthPage = currentMonth + 1;
    $: currentMonth = currentMonthPage - 1;

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

    // Helper to get YYYY-MM-DD string for a given year, month (0-based), and day
    function getDateString(year: number, month: number, day: number) {
        const mm = String(month + 1).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return `${year}-${mm}-${dd}`;
    }

    // Helper to check if a given day is in the future (including today)
    function isFutureDay(year: number, month: number, day: number) {
        const dayDate = new Date(year, month, day);
        // Remove time for comparison
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
    let pipelineConfig: { pipelines: Array<{ id: string; type: string }> } | null = null;
    
    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch (e) {
        console.warn("Failed to parse pipeline config for prefetching:", e);
    }

    // Fetch build quality for a given date (YYYY-MM-DD), skip future days
    async function fetchBuildQualityForDay(dateStr: string) {
        // Parse dateStr to year, month, day
        const [year, month, day] = dateStr.split("-").map(Number);
        if (isFutureDay(year, month - 1, day)) {
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
                // This runs in the background and doesn't block the UI
                if (pipelineConfig?.pipelines) {
                    pipelineDataService.prefetchPipelineData(
                        dateStr, 
                        pipelineConfig.pipelines.map(p => p.id)
                    ).catch(() => {
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

    // Calculate what days of the week each position represents based on the 1st of the month
    $: dayLabels = (() => {
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
        
        // Create labels based on what day the 1st falls on
        const labels = [];
        for (let i = 0; i < 7; i++) {
            const dayIndex = (firstDayOfMonth + i) % 7;
            labels.push(dayNames[dayIndex]);
        }
        return labels;
    })();

    $: daysInMonth = Array.from(
        { length: months[currentMonth].days },
        (_, dIdx) => {
            const day = dIdx + 1;
            const dateStr = getDateString(currentYear, currentMonth, day);
            let colorClass = "";
            let animationClass = "";
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
                case "in progress":
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
            return {
                day,
                dateStr,
                colorClass,
                animationClass,
                disabled: isFutureDay(currentYear, currentMonth, day),
                totalPassCount: buildQuality.totalPassCount,
                totalFailCount: buildQuality.totalFailCount,
                releasesWithTestsRan: buildQuality.releasesWithTestsRan
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
        const concurrency = 10;
        const tasks = [];
        for (let d = 1; d <= months[currentMonth].days; d++) {
            if (!isFutureDay(currentYear, currentMonth, d)) {
                const dateStr = getDateString(currentYear, currentMonth, d);
                if (!dayBuildQuality[dateStr]) {
                    tasks.push(dateStr);
                }
            }
        }

        // Helper to process a batch of up to 'concurrency' tasks at once
        for (let i = 0; i < tasks.length; i += concurrency) {
            const batch = tasks.slice(i, i + concurrency);
            // Save previous values for update detection
            const prevs = batch.map((dateStr) => dayBuildQuality[dateStr]);
            await Promise.all(
                batch.map((dateStr) => fetchBuildQualityForDay(dateStr)),
            );
            // Only trigger update if any value actually changed
            let changed = false;
            for (let j = 0; j < batch.length; j++) {
                if (dayBuildQuality[batch[j]] !== prevs[j]) {
                    changed = true;
                    break;
                }
            }
            if (changed) {
                dayBuildQuality = { ...dayBuildQuality };
            }
        }
    }
</script>

<div class="w-full h-full max-h-[500px]" transition:slide={{ duration: 300 }}>
    <Card
        class="py-0 border-0 shadow-none h-full rounded-none overflow-y-auto max-h-[500px] gap-4"
    >
        <CardTitle class="px-2 pt-2 pb-1">
            <span
                class={`inline-flex rounded text-white text-base font-bold px-2 py-1 items-center gap-1 ${
                    dayBuildQuality[
                        getDateString(
                            currentYear,
                            currentMonth,
                            today.getDate(),
                        )
                    ]?.quality === "good"
                        ? "bg-lime-600"
                        : dayBuildQuality[
                                getDateString(
                                    currentYear,
                                    currentMonth,
                                    today.getDate(),
                                )
                            ]?.quality === "ok"
                          ? "bg-yellow-400 text-black"
                          : dayBuildQuality[
                                  getDateString(
                                      currentYear,
                                      currentMonth,
                                      today.getDate(),
                                  )
                              ]?.quality === "bad"
                            ? "bg-red-600"
                            : dayBuildQuality[
                                    getDateString(
                                        currentYear,
                                        currentMonth,
                                        today.getDate(),
                                    )
                                ]?.quality === "in progress"
                              ? "bg-sky-500"
                              : "bg-zinc-700"
                }`}
            >
                <span
                    class="material-symbols-outlined"
                    style="font-size: 1.75em; line-height: 1;">health_metrics</span
                >
                    DELTAV BUILD HEALTH
            </span>
        </CardTitle>
        <CardContent class="h-full px-2 pb-2">
            <!-- Dynamic day of week labels with animation -->
            <div class="grid grid-cols-7 gap-0.5 mb-1 h-5 items-center">
                {#each dayLabels as label, i (currentMonth + '-' + i)}
                    <div 
                        class="text-center text-xs font-medium text-muted-foreground h-full flex items-center justify-center"
                        in:fly="{{ y: -15, duration: 250, delay: i * 30 }}"
                        out:fly="{{ y: 15, duration: 150 }}"
                    >
                        {label}
                    </div>
                {/each}
            </div>
            
            <div class="grid grid-cols-7 gap-0.5 mb-2">
                {#each daysInMonth as dayObj, index (currentMonth + '-' + dayObj.day)}
                    <div 
                        class="w-full aspect-square min-w-0 min-h-0"
                        in:fly="{{ y: 10, duration: 200, delay: index * 15 }}"
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
            <div class="flex justify-center">
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
                                            {monthNames[page.value - 1].slice(
                                                0,
                                                3,
                                            )}
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
    </Card>
</div>
