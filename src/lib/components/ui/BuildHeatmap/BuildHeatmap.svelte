<script lang="ts">
import {
    Card,
    CardContent,
} from "$lib/components/ui/card/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import { goto } from "$app/navigation";
import * as Pagination from "$lib/components/ui/pagination/index.js";


// Svelte binding for Pagination.Root (1-based page index)
const today = new Date();
let currentMonth = today.getMonth();
let currentMonthPage = currentMonth + 1;
$: currentMonth = currentMonthPage - 1;

const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];
const currentYear = new Date().getFullYear();
const months = monthNames.map((name, idx) => {
    // Get days in month: new Date(year, month+1, 0) gives last day of month
    const days = new Date(currentYear, idx + 1, 0).getDate();
    return { name, days };
});

// Helper to get YYYY-MM-DD string for a given year, month (0-based), and day
function getDateString(year: number, month: number, day: number) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
}

// Helper to check if a given day is in the future (including today)
function isFutureDay(year: number, month: number, day: number) {
    const dayDate = new Date(year, month, day);
    // Remove time for comparison
    dayDate.setHours(0,0,0,0);
    const todayDate = new Date();
    todayDate.setHours(0,0,0,0);
    return dayDate >= todayDate;
}

// Store build quality for each day (YYYY-MM-DD => quality)
let dayBuildQuality: Record<string, string> = {};

// Fetch build quality for a given date (YYYY-MM-DD)
async function fetchBuildQualityForDay(dateStr: string) {
    try {
        const res = await fetch(`/api/build-quality?date=${dateStr}`);
        if (res.ok) {
            const data = await res.json();
            console.log(`Fetched build quality for ${dateStr}: ${data.quality}`);
            dayBuildQuality[dateStr] = data.quality;
        } else {
            dayBuildQuality[dateStr] = 'unknown';
        }
    } catch {
        dayBuildQuality[dateStr] = 'unknown';
    }
}


// Precompute day objects for the current month (pure, no side effects)
$: daysInMonth = Array.from({ length: months[currentMonth].days }, (_, dIdx) => {
    const day = dIdx + 1;
    const dateStr = getDateString(currentYear, currentMonth, day);
    let colorClass = '';
    switch (dayBuildQuality[dateStr]) {
        case 'good': colorClass = 'bg-green-500 text-white'; break;
        case 'ok': colorClass = 'bg-yellow-400 text-black'; break;
        case 'bad': colorClass = 'bg-red-500 text-white'; break;
        case 'in progress': colorClass = 'bg-blue-500 text-white'; break;
        case 'unknown': default: colorClass = 'bg-gray-300 text-black'; break;
    }
    return { day, dateStr, colorClass, disabled: isFutureDay(currentYear, currentMonth, day) };
});


// Fetch all build qualities for the current month only when the month changes
let lastFetchedMonth = -1;
$: if (currentMonth !== lastFetchedMonth) {
    lastFetchedMonth = currentMonth;
    fetchAllBuildQualitiesForMonth();
}

async function fetchAllBuildQualitiesForMonth() {
    for (let d = 1; d <= months[currentMonth].days; d++) {
        if (!isFutureDay(currentYear, currentMonth, d)) {
            const dateStr = getDateString(currentYear, currentMonth, d);
            if (!dayBuildQuality[dateStr]) {
                const prev = dayBuildQuality[dateStr];
                await fetchBuildQualityForDay(dateStr);
                // Only trigger update if value actually changed
                if (dayBuildQuality[dateStr] !== prev) {
                    dayBuildQuality = { ...dayBuildQuality };
                }
            }
        }
    }
}
</script>

<div class="w-full h-full min-h-screen">
    <Card class="h-full rounded-none">
            <CardContent class="h-full">
                <div class="overflow-y-auto h-full max-h-[90vh]">
                    <div class="flex justify-center mb-4">
                        <Pagination.Root count={months.length} perPage={1} siblingCount={1} bind:page={currentMonthPage}>
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
                                            <Pagination.Link {page} isActive={currentPage === page.value}>
                                                {monthNames[page.value - 1].slice(0, 3)}
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
                    <div class="grid grid-cols-7 gap-1">
                        {#each daysInMonth as dayObj}
                            <div class="w-full aspect-square min-w-0 min-h-0">
                                <!-- @ts-ignore -->
                                <Button
                                    size="icon"
                                    type="button"
                                    aria-label={`Go to build ${dayObj.dateStr}`}
                                    onclick={() => goto(`/build/${dayObj.dateStr}`)}
                                    class={`w-full h-full min-w-0 min-h-0 ${dayObj.colorClass}`}
                                    style="aspect-ratio: 1 / 1;"
                                    disabled={dayObj.disabled}
                                >
                                    {dayObj.day}
                                </Button>
                            </div>
                        {/each}
                    </div>
                </div>
            </CardContent>
    </Card>
</div>
