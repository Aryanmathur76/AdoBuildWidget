<script lang="ts">
    import type { Release } from "$lib/types/release";
    import type { Build } from "$lib/types/build";
    import { slide, fade } from 'svelte/transition';
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
    import { today, parseDate } from "@internationalized/date";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import { dateValueToString, createErrorPipeline, type PipelineConfig } from "$lib/utils/buildQualityUtils.js";
    import { getPipelineConfig } from "$lib/utils.js";

    const df = new DateFormatter("en-US", {
        dateStyle: "long",
    });

    let selectedDate = $state<DateValue | undefined>(
        date ? parseDate(date) : today(getLocalTimeZone())
    );

    let contentRef = $state<HTMLElement | null>(null);
    let popoverOpen = $state(false);

    // Get pipeline configuration
    let pipelineConfig: PipelineConfig | null = null;
    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        } else {
            throw new Error("Missing PUBLIC_AZURE_PIPELINE_CONFIG environment variable.");
        }
    } catch (e) {
        throw new Error(
            "Failed to parse pipeline configuration: " +
                (e instanceof Error ? e.message : String(e)),
        );
    }

    if (!pipelineConfig?.pipelines || pipelineConfig.pipelines.length === 0) {
        throw new Error("Pipeline configuration contains no pipelines.");
    }

    // Array of release objects to fetch release details for
    let releasePipelines = $state<Release[]>([]);

    // Array of build objects - don't pre-allocate since we might get multiple builds per config
    let buildPipelines = $state<Build[]>([]);

    async function fetchReleasePipelineDetails(pipelines: any[]) {
        releasePipelines = []; // Clear the array
        
        const releasePipes = pipelines.filter((p: any) => p.type === 'release');
        const dateStr = dateValueToString(selectedDate);
        
        for (let i = 0; i < releasePipes.length; i++) {
            const pipeline = releasePipes[i];
            try {
                const releaseDetails = await pipelineDataService.fetchReleaseData(
                    dateStr, 
                    pipeline.id
                );
                releaseDetails.name = pipeline.displayName;
                releasePipelines.push(releaseDetails);
            } catch (error) {
                console.log(`Error fetching release details for pipeline ID ${pipeline.id}:`, error);
                // Add error placeholder
                releasePipelines.push(createErrorPipeline(pipeline.id, pipeline.displayName));
            }
        }
    }

    async function fetchBuildPipelineDetails(pipelines: any[]){
        buildPipelines = []; // Clear the array
        
        const buildPipes = pipelines.filter((p: any) => p.type === 'build');
        const dateStr = dateValueToString(selectedDate);
        
        for (let i = 0; i < buildPipes.length; i++) {
            const pipeline = buildPipes[i];
            try {
                const buildDetailsArr = await pipelineDataService.fetchBuildData(
                    dateStr, 
                    pipeline.id
                );
                
                // If multiple builds, add all of them
                if (Array.isArray(buildDetailsArr) && buildDetailsArr.length > 0) {
                    buildDetailsArr.forEach((buildDetails: any) => {
                        if (!buildDetails.testRunName) {
                            buildDetails.name = pipeline.displayName;
                        } else {
                            buildDetails.name = buildDetails.testRunName;
                        }
                        buildPipelines.push(buildDetails);
                    });
                } else {
                    buildPipelines.push(createErrorPipeline(pipeline.id, pipeline.displayName));
                }
            } catch (error) {
                console.error(`Error fetching build details for pipeline ID ${pipeline.id}:`, error);
                // Add error placeholder
                buildPipelines.push(createErrorPipeline(pipeline.id, pipeline.displayName));
            }
        }
    }

    async function fetchAllPipelineDetails(pipelines: any[]) {
        // Clear both arrays first
        releasePipelines = [];
        buildPipelines = [];
        
        // Fetch release pipelines first
        await fetchReleasePipelineDetails(pipelines);
        
        // Then fetch build pipelines
        await fetchBuildPipelineDetails(pipelines);
    }

    // Reset pipelineStatuses to null and etch again when date changes
    let prevDate: string | undefined;
    $effect(() => {
        const currentDate = selectedDate ? selectedDate.toString() : undefined;
        if (currentDate === prevDate) return;
        prevDate = currentDate;
        if (selectedDate){
            fetchAllPipelineDetails(pipelineConfig.pipelines);
        }
        // Close the calendar popover after a new date is picked
        if (popoverOpen) {
            popoverOpen = false;
        }
    });
</script>

<div class="w-full h-full min-h-screen" transition:slide={{ duration: 300 }}>
    <Card.Root class="border-0 shadow-none w-full h-screen min-h-screen rounded-none">
        <ScrollArea class="h-full w-full">
            <Card.Header class="flex items-center justify-between">
                <a href="/"
                    class={cn(buttonVariants({ variant: "ghost", class: "whitespace-nowrap text-lg font-semibold px-2 py-1 hover:bg-accent hover:text-accent-foreground transition-colors" }))}
                    aria-label="Back to Heatmap"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>
                </a>
                <Popover.Root bind:open={popoverOpen}>
                    <Popover.Trigger
                        class={cn(buttonVariants({ variant: "outline", class: "w-48 justify-between font-normal" }), !selectedDate && "text-muted-foreground")}
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
                    {#each releasePipelines as pipeline, index}
                        <div in:fade={{ delay: index * 100, duration: 300 }}>
                            <BuildCard
                                pipelineName={pipeline.name}
                                link={pipeline.link}
                                status={pipeline.status}
                                passCount={pipeline.passedTestCount}
                                failCount={pipeline.failedTestCount}
                                pipelineType="release"
                                pipelineId={pipeline.id}
                                completedDate={pipeline.completedTime}
                                date={selectedDate ? selectedDate.toDate(getLocalTimeZone()).toISOString() : null}
                            />
                        </div>
                    {/each}
                    {#each buildPipelines as pipeline, index}
                        <div in:fade={{ delay: (releasePipelines.length * 100) + (index * 100), duration: 300 }}>
                            <BuildCard
                                pipelineName={pipeline.name}
                                link={pipeline.link}
                                status={pipeline.status}
                                passCount={pipeline.passedTestCount}
                                failCount={pipeline.failedTestCount}
                                pipelineType="build"
                                pipelineId={pipeline.id}
                                completedDate={pipeline.completedTime}
                                date={selectedDate ? selectedDate.toDate(getLocalTimeZone()).toISOString() : null}
                            />
                        </div>
                    {/each}
                </div>
            </Card.Content>
        </ScrollArea>
    </Card.Root>
</div>
 