
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

// Used to keep track of the global day index for build links
let dayIndex = 0;
</script>

<div class="w-full h-full min-h-screen">
    <Card class="h-full rounded-none">
        <ScrollArea class="h-full w-full">
            <CardHeader>
                <CardTitle>Build Quality</CardTitle>
            </CardHeader>
            <CardContent class="h-full p-0">
                <div class="overflow-y-auto h-full max-h-[100vh] p-6">
                    <div class="grid grid-cols-7 gap-1">
                        {@html (() => { dayIndex = 0; return "" })()}
                        {#each months as month, mIdx}
                            <div class="col-span-7 text-center font-semibold py-2 rounded mb-1 mt-2" style="background: var(--accent); color: var(--foreground);">{month.name}</div>
                            {#each Array(month.days) as _, dIdx}
                                <div class="w-full aspect-square min-w-0 min-h-0">
                                    <!-- @ts-ignore -->
                                    <Button
                                        size="icon"
                                        type="button"
                                        aria-label={`Go to build ${dayIndex + 1}`}
                                        onclick={() => goto(`/build/${dayIndex + 1}`)}
                                        class="w-full h-full min-w-0 min-h-0"
                                        style="aspect-ratio: 1 / 1;"
                                    >
                                        {dIdx + 1}
                                    </Button>
                                </div>
                                {@html (() => { dayIndex += 1; return "" })()}
                            {/each}
                        {/each}
                    </div>
                </div>
            </CardContent>
        </ScrollArea>
    </Card>
</div>
