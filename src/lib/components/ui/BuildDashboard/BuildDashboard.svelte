<script lang="ts">
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

    const df = new DateFormatter("en-US", {
        dateStyle: "long",
    });


    import { today, parseDate } from "@internationalized/date";
    let value = $state<DateValue | undefined>(
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


    let pipelineStatuses = $state<Record<string, string | null>>(
        Object.fromEntries(
            pipelineConfig.pipelines.map((p: { displayName: string }) => [
                p.displayName,
                null,
            ]),
        ),
    );

    let pipelineLinks = $state<Record<string, string | null>>(
        Object.fromEntries(
            pipelineConfig.pipelines.map((p: { displayName: string }) => [
                p.displayName,
                null,
            ]),
        ),
    );

    let releaseDescription = $state<string | null>(null);

    async function getPipelineStatus(
        pipelineName: string,
        definitionId: number,
    ) {
        if (!value) {
            pipelineStatuses = { ...pipelineStatuses, [pipelineName]: null };
            return;
        }
        const dateStr = value
            ? value.toDate(getLocalTimeZone()).toISOString().split("T")[0]
            : "";
        const res = await fetch(
            `/api/pipeline-status?definitionId=${definitionId}&date=${dateStr}`,
        );
        const data = await res.json();
        pipelineStatuses = {
            ...pipelineStatuses,
            [pipelineName]: data.status || null,
        };

        const linkRes = await fetch(
            `/api/release-link?definitionId=${definitionId}&date=${dateStr}`,
        );
        const linkData = await linkRes.json();
        pipelineLinks = {
            ...pipelineLinks,
            [pipelineName]: linkData.link || null,
        };
    }


    // Reset pipelineStatuses to null and fetch release description when the date changes
    let prevDate: string | undefined;
    $effect(() => {
        const currentDate = value ? value.toString() : undefined;
        if (currentDate === prevDate) return;
        // Only run if the date actually changed
        pipelineStatuses = Object.fromEntries(
            Object.keys(pipelineStatuses).map((k) => [k, "Unknown"]),
        );
        prevDate = currentDate;
        for (const pipeline of pipelineConfig.pipelines) {
            getPipelineStatus(pipeline.displayName, pipeline.id);
        }
        // Fetch release description for the selected date and first pipeline
        if (pipelineConfig.pipelines.length > 0 && value) {
            const definitionId = pipelineConfig.pipelines[0].id;
            const dateStr = value.toDate(getLocalTimeZone()).toISOString().split("T")[0];
            fetch(`/api/release-description?definitionId=${definitionId}&date=${dateStr}`)
                .then(res => res.json())
                .then(data => {
                    releaseDescription = data.description ?? null;
                })
                .catch(() => {
                    releaseDescription = null;
                });
        } else {
            releaseDescription = null;
        }
        // Close the calendar popover after a new date is picked
        if (popoverOpen) {
            popoverOpen = false;
        }
    });

</script>

<div class="w-full h-full min-h-screen">
    <Card.Root class="w-full h-screen min-h-screen rounded-none">
        <ScrollArea class="h-full w-full">
            <Card.Header class="flex items-center justify-between">
                <a href="/" class={cn(
                    buttonVariants({
                        variant: "ghost",
                        class: "whitespace-nowrap text-lg font-semibold px-2 py-1 hover:bg-accent hover:text-accent-foreground transition-colors"
                    })
                )}>
                    ← Back to Heatmap
                </a>
                <Popover.Root bind:open={popoverOpen}>
                    <Popover.Trigger
                        class={cn(
                            buttonVariants({
                                variant: "outline",
                                class: "w-48 justify-between font-normal",
                            }),
                            !value && "text-muted-foreground",
                        )}
                    >
                    <CalendarIcon />
                    {value ? df.format(value.toDate(getLocalTimeZone())) : "Pick a date"}
                    </Popover.Trigger>
                    <Popover.Content bind:ref={contentRef} class="w-auto p-0">
                        <Calendar
                            type="single"
                            bind:value
                            captionLayout="dropdown"
                            maxValue={today(getLocalTimeZone())}
                            preventDeselect={true}
                            disableDaysOutsideMonth={false}
                        />
                    </Popover.Content>
                </Popover.Root>
            </Card.Header>
            <Card.Content>
                <div class="mt-8 flex flex-col gap-4 w-full">
                    <!-- Release Description Card -->
                    <div class="bg-muted rounded-lg p-4 shadow flex flex-col gap-2">
                        <div class="font-semibold text-lg">Release Description</div>
                        <div class="text-muted-foreground text-sm">
                            {#if releaseDescription !== null}
                                {releaseDescription || 'No release description available.'}
                            {:else}
                                Loading...
                            {/if}
                        </div>
                    </div>
                    {#each pipelineConfig.pipelines as pipeline}
                        <BuildCard
                            pipelineName={pipeline.displayName}
                            link={pipelineLinks[pipeline.displayName] ??
                                undefined}
                            status={pipelineStatuses[pipeline.displayName] ??
                                undefined}
                        />
                    {/each}
                </div>
            </Card.Content>
        </ScrollArea>
    </Card.Root>
</div>
