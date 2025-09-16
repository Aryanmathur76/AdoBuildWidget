<script lang="ts">
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

    const df = new DateFormatter("en-US", {
        dateStyle: "long",
    });


import { today, parseDate } from "@internationalized/date";
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


    // pipelineStatuses now holds an object with status, passCount, and failCount
    let pipelineStatuses = $state<Record<string, { status: string | null, passCount: number | null, failCount: number | null }>>(
        Object.fromEntries(
            pipelineConfig.pipelines.map((p: { displayName: string }) => [
                p.displayName,
                { status: null, passCount: null, failCount: null },
            ]),
        ),
    );

    // pipelineIds will be populated with the latest release ID for each pipeline for the selected date
    let pipelineIds = $state<Record<string, number | null>>(
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

    let pipelineDescriptions = $state<Record<string, string | null>>(
        Object.fromEntries(
            pipelineConfig.pipelines.map((p: { displayName: string }) => [
                p.displayName,
                null,
            ]),
        ),
    );

    async function getPipelineStatus(
        pipelineName: string,
        releaseId: number | null,
    ) {
        if (!selectedDate || !releaseId) {
            pipelineStatuses = { ...pipelineStatuses, [pipelineName]: { status: 'Unknown', passCount: 0, failCount: 0 } };
            pipelineLinks = { ...pipelineLinks, [pipelineName]: null };
            return;
        }

        // TEST RUN SETTER
        // Fetch test-run for pass/fail counts, passing in the date as required
        let passCount: number | null = null;
        let failCount: number | null = null;
        try {
            let dateStr = selectedDate ? selectedDate.toDate(getLocalTimeZone()).toISOString().split("T")[0] : undefined;
            const testRunRes = await fetch(`/api/test-run?pipelineId=${releaseId}&pipelineType=release&date=${dateStr}`);
            if (testRunRes.ok) {
                const testRunData = await testRunRes.json();
                if (typeof testRunData.passCount === 'number') passCount = testRunData.passCount;
                if (typeof testRunData.failCount === 'number') failCount = testRunData.failCount;
            }
        } catch {}



        // STATUS SETTER: pass passCount and failCount as query params
        let pipelineStatusUrl = `/api/pipeline-status?releaseId=${releaseId}`;
        
        if (passCount !== null) pipelineStatusUrl += `&passCount=${passCount}`;
        if (failCount !== null) pipelineStatusUrl += `&failCount=${failCount}`;
        const res = await fetch(pipelineStatusUrl);
        const data = await res.json();

        pipelineStatuses = {
            ...pipelineStatuses,
            [pipelineName]: {
                status: data.status || null,
                passCount,
                failCount
            },
        };

        // LINK SETTTER
        const linkRes = await fetch(
            `/api/release-link?releaseId=${releaseId}`,
        );
        const linkData = await linkRes.json();
        pipelineLinks = {
            ...pipelineLinks,
            [pipelineName]: linkData.link || null,
        };
    }


    // Reset pipelineStatuses, pipelineDescriptions, and pipelineIds to null and fetch each pipeline's releaseId, then use releaseId for all API calls
    let prevDate: string | undefined;
    $effect(() => {
        const currentDate = selectedDate ? selectedDate.toString() : undefined;
        if (currentDate === prevDate) return;
        // Only run if the date actually changed
        pipelineStatuses = Object.fromEntries(
            Object.keys(pipelineStatuses).map((k) => [k, { status: null, passCount: null, failCount: null }]),
        );
        pipelineDescriptions = Object.fromEntries(
            Object.keys(pipelineDescriptions).map((k) => [k, null]),
        );
        pipelineIds = Object.fromEntries(
            Object.keys(pipelineIds).map((k) => [k, null]),
        );
        prevDate = currentDate;
        // Fetch release IDs for each pipeline for the selected date, then fetch status, description, and link using releaseId
        if (selectedDate) {
            const dateStr = selectedDate.toDate(getLocalTimeZone()).toISOString().split("T")[0];
            (async () => {
                for (const pipeline of pipelineConfig.pipelines) {
                    try {

                        // RELEASE ID SETTER
                        const res = await fetch(`/api/release-id?definitionId=${pipeline.id}&date=${dateStr}`);
                        const data = await res.json();
                        const releaseId = data.releaseId ?? null;
                        pipelineIds = {
                            ...pipelineIds,
                            [pipeline.displayName]: releaseId,
                        };
                    
                        // Only fetch status, description, and link if releaseId is available
                        getPipelineStatus(pipeline.displayName, releaseId);

                        if (!releaseId) {
                            pipelineDescriptions = {
                                ...pipelineDescriptions,
                                [pipeline.displayName]: "No description available"
                            };
                            continue;
                        }
                        // Description API now takes only releaseId
                        fetch(`/api/release-description?releaseId=${releaseId}`)
                            .then(res => res.json())
                            .then(data => {
                                let desc = typeof data.description === "string" ? data.description.trim() : "";
                                pipelineDescriptions = {
                                    ...pipelineDescriptions,
                                    [pipeline.displayName]: desc ? desc : "No description available"
                                };
                            })
                            .catch(() => {
                                pipelineDescriptions = {
                                    ...pipelineDescriptions,
                                    [pipeline.displayName]: "No description available"
                                };
                            });
                    } catch {
                        pipelineIds = {
                            ...pipelineIds,
                            [pipeline.displayName]: null,
                        };
                        pipelineDescriptions = {
                            ...pipelineDescriptions,
                            [pipeline.displayName]: "No description available"
                        };
                        getPipelineStatus(pipeline.displayName, null);
                    }
                }
            })();
        }
        // Close the calendar popover after a new date is picked
        if (popoverOpen) {
            popoverOpen = false;
        }
    });

</script>

<div class="w-full h-full min-h-screen"
    transition:slide={{ duration: 300 }}>
    <Card.Root class="border-0 shadow-none w-full h-screen min-h-screen rounded-none">
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
                    {#each Object.entries(pipelineIds) as [displayName, releaseId]}
                        <BuildCard
                            pipelineName={displayName}
                            link={pipelineLinks[displayName] ?? null}
                            status={pipelineStatuses[displayName]?.status ?? null}
                            passCount={pipelineStatuses[displayName]?.passCount}
                            failCount={pipelineStatuses[displayName]?.failCount}
                            releaseId={releaseId}
                            date={selectedDate ? selectedDate.toDate(getLocalTimeZone()).toISOString() : null}
                        >
                            {#if pipelineDescriptions[displayName] === null}
                                <Skeleton class="h-5 w-3/4" />
                            {:else}
                                {pipelineDescriptions[displayName]}
                            {/if}
                        </BuildCard>
                    {/each}
                </div>
            </Card.Content>
        </ScrollArea>
    </Card.Root>
</div>
