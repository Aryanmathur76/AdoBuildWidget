<script lang="ts">
    import type { Release } from "$lib/types/release";
    import { slide } from 'svelte/transition';
    import CalendarIcon from "@lucide/svelte/icons/calendar";
    const { date } = $props<{ date?: string }>();
    import {
        DateFormatter,
        type DateValue,
        getLocalTimeZone,
    } from "@internationalized/date";
    import { cn } from "$lib/utils.js";
    import { buttonVariants } from "$lib/components/ui/button/index.js";
    import { Calendar } from "$lib/components/ui/calendar/index.js";
    import * as Popover from "$lib/components/ui/popover/index.js";
    import * as Card from "$lib/components/ui/card/index.js";
    import BuildCard from "$lib/components/ui/BuildCard/buildCard.svelte";
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import { env } from "$env/dynamic/public";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import { today, parseDate } from "@internationalized/date";

    const df = new DateFormatter("en-US", {
        dateStyle: "long",
    });

    let selectedDate = $state<DateValue | undefined>(
        date ? parseDate(date) : today(getLocalTimeZone())
    );

    let contentRef = $state<HTMLElement | null>(null);
    let popoverOpen = $state(false);

    if (!env.PUBLIC_AZURE_PIPELINE_CONFIG) {
        throw new Error(
            "Missing PUBLIC_AZURE_PIPELINE_CONFIG environment variable.",
        );
    }

    let parsedConfig;
    try {
        parsedConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
    } catch (e) {
        throw new Error(
            "Failed to parse PUBLIC_AZURE_PIPELINE_CONFIG: " +
                (e instanceof Error ? e.message : String(e)),
        );
    }

    if (!parsedConfig.pipelines || parsedConfig.pipelines.length === 0) {
        throw new Error("PUBLIC_AZURE_PIPELINE_CONFIG contains no pipelines.");
    }

    const pipelineConfig = parsedConfig;

    // Array of release objects to fetch release details for
    let releasePipelines = $state<Release[]>(
        Array(pipelineConfig.pipelines.length).fill(null)
    );

    async function fetchReleasePipelineDetails(pipelines: any[]){
        for (let i = 0; i < pipelines.length; i++) {
            const pipeline = pipelines[i];
            if (pipeline.type === 'release') {
                // Fetch release details for the release pipeline
                try {
                    const releaseDetailsRes = await fetch(`/newApi/constructRelease?date=${selectedDate?.toString()}&releaseDefinitionId=${pipeline.id}`);
                    if (releaseDetailsRes.ok) {
                        const releaseDetails = await releaseDetailsRes.json();
                        releaseDetails.name = pipeline.displayName;
                        releasePipelines[i] = releaseDetails;
                    }
                    else{
                        //Default object to use if no run is found
                        releasePipelines[i] = {
                            id: pipeline.id,
                            name: pipeline.displayName,
                            status: 'unknown',
                            createdOn: new Date().toISOString(),
                            modifiedOn: new Date().toISOString(),
                            envs: [],
                            passedTestCount: 0,
                            failedTestCount: 0
                        };
                    }
                } catch (error) {
                    console.error(`Error fetching release details for pipeline ID ${pipeline.id}:`, error);
                }
            }
        }
    }

    // Reset pipelineStatuses to null and etch again when date changes
    let prevDate: string | undefined;
    $effect(() => {
        const currentDate = selectedDate ? selectedDate.toString() : undefined;
        if (currentDate === prevDate) return;
        prevDate = currentDate;
        if (selectedDate){
            releasePipelines = Array(pipelineConfig.pipelines.length).fill(null);
            fetchReleasePipelineDetails(pipelineConfig.pipelines);
        }
        // Close the calendar popover after a new date is picked
        if (popoverOpen) {
            popoverOpen = false;
        }
    });
</script>

<div class="w-full h-full min-h-screen"
    transition:slide={{ duration: 300 }}>
    <Card.Root class="border-0 shadow-nonew-full h-screen min-h-screen rounded-none">
        <ScrollArea class="h-full w-full">
            <Card.Header class="flex items-center justify-between">
                <a href="/"
                    class={cn(
                        buttonVariants({
                            variant: "ghost",
                            class: "whitespace-nowrap text-lg font-semibold px-2 py-1 hover:bg-accent hover:text-accent-foreground transition-colors"
                        })
                    )}
                    aria-label="Back to Heatmap"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>
                </a>
                <Popover.Root bind:open={popoverOpen}>
                    <Popover.Trigger
                        class={cn(
                            buttonVariants({
                                variant: "outline",
                                class: "w-48 justify-between font-normal",
                            }),
                            !selectedDate && "text-muted-foreground",
                        )}
                    >
                    <CalendarIcon />
                    {selectedDate ? df.format(selectedDate.toDate(getLocalTimeZone())) : "Pick a date"}
                    </Popover.Trigger>
                    <Popover.Content bind:ref={contentRef} class="w-auto p-0">
                        <Calendar
                            type="single"
                            bind:value={selectedDate}
                            captionLayout="dropdown"
                            maxValue={today(getLocalTimeZone())}
                            preventDeselect={true}
                            disableDaysOutsideMonth={false}
                            fixedWeeks={true}
                        />
                    </Popover.Content>
                </Popover.Root>
            </Card.Header>
            <Card.Content>
                <div class="mt-8 flex flex-col gap-4 w-full">
                    {#each releasePipelines as pipeline}
                        {#if pipeline}
                            <BuildCard
                                pipelineName={pipeline.name}
                                link="Not Implemented"
                                status={pipeline.status}
                                passCount={pipeline.passedTestCount}
                                failCount={pipeline.failedTestCount}
                                pipelineType="release"
                                pipelineId={pipeline.id}
                                date={selectedDate ? selectedDate.toDate(getLocalTimeZone()).toISOString() : null}
                            />
                        {:else}
                            <Skeleton class="h-32 w-full rounded-lg" />
                        {/if}
                    {/each}
                </div>
            </Card.Content>
        </ScrollArea>
    </Card.Root>
</div>
 