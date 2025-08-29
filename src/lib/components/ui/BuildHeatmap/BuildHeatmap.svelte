
<script lang="ts">
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
} from "$lib/components/ui/card/index.js";
import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import { goto } from "$app/navigation";
import * as Pagination from "$lib/components/ui/pagination/index.js";

// Helper to get the global day index for a given month and day
function getDayIndex(monthIndex: number, dayIndex: number) {
    let idx = 0;
    for (let i = 0; i < monthIndex; i++) idx += months[i].days;
    return idx + dayIndex;
}

// Svelte binding for Pagination.Root (1-based page index)
let currentMonth = 0;
let currentMonthPage = 1;
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


// Pagination state: current month (0-based)
// (already declared above)
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
                        {#each Array(months[currentMonth].days) as _, dIdx}
                            <div class="w-full aspect-square min-w-0 min-h-0">
                                <!-- @ts-ignore -->
                                <Button
                                    size="icon"
                                    type="button"
                                    aria-label={`Go to build ${getDayIndex(currentMonth, dIdx) + 1}`}
                                    onclick={() => goto(`/build/${getDayIndex(currentMonth, dIdx) + 1}`)}
                                    class="w-full h-full min-w-0 min-h-0"
                                    style="aspect-ratio: 1 / 1;"
                                >
                                    {dIdx + 1}
                                </Button>
                            </div>
                        {/each}
                    </div>
                </div>
            </CardContent>
    </Card>
</div>
