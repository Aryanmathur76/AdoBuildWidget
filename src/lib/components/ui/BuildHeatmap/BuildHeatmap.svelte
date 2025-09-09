<script lang="ts">
    import { slide } from "svelte/transition";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { goto } from "$app/navigation";
    import * as Pagination from "$lib/components/ui/pagination/index.js";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import CardTitle from "../card/card-title.svelte";
    import CardHeader from "../card/card-header.svelte";

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
    let dayBuildQuality: Record<string, string> = {};

    // Fetch build quality for a given date (YYYY-MM-DD), skip future days
    async function fetchBuildQualityForDay(dateStr: string) {
        // Parse dateStr to year, month, day
        const [year, month, day] = dateStr.split("-").map(Number);
        if (isFutureDay(year, month - 1, day)) {
            dayBuildQuality[dateStr] = "unknown";
            return;
        }
        try {
            const res = await fetch(`/api/build-quality?date=${dateStr}`);
            if (res.ok) {
                const data = await res.json();
                dayBuildQuality[dateStr] = data.quality;
            } else {
                dayBuildQuality[dateStr] = "unknown";
            }
        } catch {
            dayBuildQuality[dateStr] = "unknown";
        }
    }

    // Precompute day objects for the current month (pure, no side effects)
    $: daysInMonth = Array.from(
        { length: months[currentMonth].days },
        (_, dIdx) => {
            const day = dIdx + 1;
            const dateStr = getDateString(currentYear, currentMonth, day);
            let colorClass = "";
            switch (dayBuildQuality[dateStr]) {
                case "good":
                    colorClass = "bg-green-500 text-white";
                    break;
                case "ok":
                    colorClass = "bg-yellow-400 text-black";
                    break;
                case "bad":
                    colorClass = "bg-red-500 text-white";
                    break;
                case "in progress":
                    colorClass = "bg-blue-500 text-white";
                    break;
                case "unknown":
                    colorClass = "bg-zinc-800 text-white";
                    break;
                default:
                    colorClass = "bg-zinc-800 text-white";
                    break;
            }
            return {
                day,
                dateStr,
                colorClass,
                disabled: isFutureDay(currentYear, currentMonth, day),
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

<div class="w-full h-full min-h-screen" transition:slide={{ duration: 300 }}>
    <Card
        class="py-0 border-0 shadow-none h-full rounded-none overflow-y-auto max-h-[100vh]"
    >
        <CardTitle class="px-2 pt-5">
            <span
                class="inline-flex rounded bg-green-500 text-white text-lg font-bold px-2 py-1 items-center gap-2"
            >
                <span
                    class="material-symbols-outlined"
                    style="font-size: 2em; line-height: 1;"
                >health_metrics</span>
                DELTAV BUILD HEALTH
            </span>
        </CardTitle>
        <CardContent class="h-full px-2">
            <div class="grid grid-cols-7 gap-1">
                {#each daysInMonth as dayObj}
                    <div class="w-full aspect-square min-w-0 min-h-0">
                        {#if dayBuildQuality[dayObj.dateStr]}
                            <!-- @ts-ignore -->
                            <Button
                                size="icon"
                                type="button"
                                aria-label={`Go to build ${dayObj.dateStr}`}
                                onclick={() => {
                                    goto(`/build/${dayObj.dateStr}`);
                                }}
                                class={`w-full h-full min-w-0 min-h-0 cursor-pointer ${dayObj.colorClass}`}
                                style="aspect-ratio: 1 / 1;"
                                disabled={dayObj.disabled}
                            >
                                {dayObj.day}
                            </Button>
                        {:else if dayObj.disabled}
                            <!-- For future days, show disabled button immediately -->
                            <Button
                                size="icon"
                                type="button"
                                aria-label={`Go to build ${dayObj.dateStr}`}
                                class={`w-full h-full min-w-0 min-h-0 bg-zinc-800 text-white cursor-not-allowed`}
                                style="aspect-ratio: 1 / 1;"
                                disabled={true}
                            >
                                {dayObj.day}
                            </Button>
                        {:else}
                            <Skeleton
                                class="w-full h-full min-w-0 min-h-0 rounded"
                                style="aspect-ratio: 1 / 1;"
                            />
                        {/if}
                    </div>
                {/each}
            </div>
            <div class="flex justify-center my-3">
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
