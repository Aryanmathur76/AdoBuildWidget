<script lang="ts">
    export let pipelineType: "build" | "release" | null = null;
    export let pipelineId: number | null = null;
    import * as Card from "$lib/components/ui/card/index.js";
    import PipelineStatusBadge from "$lib/components/ui/PipelineStatusBadge/pipelineStatusBadge.svelte";
    import { toast } from "svelte-sonner";
    import { fade } from "svelte/transition";
    import { Toaster } from "$lib/components/ui/sonner";
    import * as Chart from "$lib/components/ui/chart/index.js";
    import { PieChart, Text } from "layerchart";
    import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
    import {
        Dialog,
        DialogContent,
        DialogTitle,
        DialogDescription,
        DialogTrigger,
    } from "$lib/components/ui/dialog";
    import TestChart from "$lib/components/ui/TestChart/testChart.svelte";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";

    export let pipelineName: string = "PipelineName";
    export let link: string | null = null;
    export let status: string | null = null;
    export let passCount: number | null = null;
    export let failCount: number | null = null;
    export let completedDate: string | null = null;
    export let date: string | null = null;

    import { onMount, onDestroy } from "svelte";

    let dialogOpen = false;
    let isLoading = false;
    let testCases:
        | import("$lib/components/ui/TestChart/testChart.svelte").TestCase[]
        | null = null;
    let testCasesError: string | null = null;

    $: if (
        dialogOpen &&
        passCount !== null &&
        failCount !== null &&
        passCount + failCount > 0 &&
        pipelineId &&
        pipelineType &&
        date
    ) {
        isLoading = true;
        testCases = null;
        testCasesError = null;
        
        const cleanDate = date.length > 10 ? date.slice(0, 10) : date;
        
        // First get the release/build data to extract the releaseId/buildId
        const fetchPromise = pipelineType === 'release' 
            ? pipelineDataService.fetchReleaseDataSilent(cleanDate, pipelineId.toString())
            : pipelineDataService.fetchBuildDataSilent(cleanDate, pipelineId.toString());
        
        fetchPromise
            .then(async (pipelineData) => {
                if (!pipelineData && pipelineType === 'build') {
                    // For builds, we require pipeline data
                    throw new Error(`No ${pipelineType} data found for ${cleanDate}`);
                }

                const response = await fetch(
                    `/api/test-cases?pipelineId=${pipelineId}&pipelineType=${pipelineType}&date=${encodeURIComponent(cleanDate)}`
                );
                const data = await response.json();
                testCases = data.testCases;
                
                isLoading = false;
            })
            .catch((error) => {
                testCases = null;
                isLoading = false;
                testCasesError = `Failed to load test cases: ${error.message}`;
            });
    }

    function handleCopy() {
        if (link) {
            navigator.clipboard.writeText(link);
            toast.info(link, { 
                duration: 6000,
                onAutoClose: () => {
                    // Clear selection when toast closes
                    if (window.getSelection) {
                        window.getSelection()?.removeAllRanges();
                    }
                }
            });
            
            // Use setTimeout to ensure the toast is rendered before selecting text
            setTimeout(() => {
                // Find the toast content and select the text
                const toastElements = document.querySelectorAll('[data-sonner-toast]');
                const latestToast = toastElements[toastElements.length - 1];
                if (latestToast) {
                    const textContent = latestToast.querySelector('[data-content]') || latestToast;
                    if (textContent && window.getSelection) {
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(textContent);
                        selection?.removeAllRanges();
                        selection?.addRange(range);
                    }
                }
            }, 50);
        }
    }

    const chartConfig = {
        pass: { label: "Pass", color: "var(--chart-1)" },
        fail: { label: "Fail", color: "var(--chart-2)" },
    } satisfies Chart.ChartConfig;
</script>

<Toaster position="top-center" richColors />
<Card.Root class="shadow-lg border-1 border-accent rounded-lg py-2">
    <link
        href="https://fonts.googleapis.com/icon?family=Material+Icons|Material+Icons+Outlined"
        rel="stylesheet"
    />
    <Card.Content style="position: relative;">
        {#if passCount !== null && failCount !== null && passCount + failCount > 0}
            <Dialog bind:open={dialogOpen}>
                {#if dialogOpen}
                    <DialogContent>
                        <DialogDescription>
                            <div class="py-2">
                                {#if passCount !== null && failCount !== null && passCount + failCount > 0 && pipelineId && date}
                                    {#key `${pipelineId}-${date}`}
                                        {#if isLoading}
                                            <TestChart isLoading={true} />
                                        {:else if testCases}
                                            <TestChart
                                                {testCases}
                                                isLoading={false}
                                            />
                                        {:else if testCasesError}
                                            <div class="text-xs text-red-500">
                                                {testCasesError}
                                            </div>
                                        {/if}
                                    {/key}
                                {/if}
                            </div>
                        </DialogDescription>
                    </DialogContent>
                {/if}
            </Dialog>
        {/if}
        <div
            style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%;"
        >
            <div class="flex flex-col items-start min-w-0 flex-1">
                <div class="flex items-center gap-2 pb-1">
                    <div class="font-semibold text-[1.1rem] leading-[1.2] truncate">
                        {pipelineName}
                    </div>
                    {#if completedDate && status != "unknown" && status != "inProgress"}
                        <span class="inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium bg-muted text-muted-foreground border">
                            Completed on {new Date(completedDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} {new Date(completedDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </span>
                    {/if}
                </div>
                <div class="flex items-center gap-1 mt-2 mb-1">
                    <PipelineStatusBadge {status} />
                    {#if link}
                        <button
                            title="Copy link"
                            aria-label="Copy link"
                            on:click={handleCopy}
                            style="background: none; border: none; padding: 5px; cursor: pointer; display: flex; align-items: center;"
                        >
                            <span
                                class="material-icons text-muted-foreground hover:text-primary"
                                style="font-size: 18px;"
                            >
                                visibility
                            </span>
                        </button>
                    {/if}
                    {#if passCount !== null && failCount !== null && passCount + failCount > 0}
                        <button
                            title="View test details"
                            aria-label="View test details"
                            on:click={() => dialogOpen = true}
                            style="background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;"
                        >
                            <span
                                class="material-icons-outlined text-muted-foreground hover:text-primary"
                                style="font-size: 22px; line-height: 1; vertical-align: middle;"
                            >
                                science
                            </span>
                        </button>
                    {/if}
                </div>
                <div class="text-xs text-muted-foreground mb-1">
                    <slot />
                </div>
            </div>
            <div
                class="flex-shrink-0 flex items-center justify-center"
                style="min-width: 80px; min-height: 80px;"
            >
                

                {#if passCount !== null && failCount !== null && passCount + failCount > 0}
                    <Chart.Container
                        config={chartConfig}
                        style="width: 85px; height: 85px;"
                    >
                        <PieChart
                            data={[
                                {
                                    result: "pass",
                                    value: passCount,
                                    color: chartConfig.pass.color,
                                },
                                {
                                    result: "fail",
                                    value: failCount,
                                    color: chartConfig.fail.color,
                                },
                            ]}
                            key="result"
                            value="value"
                            c="color"
                            innerRadius={40}
                            padding={5}
                            props={{ pie: { motion: "tween" } }}
                        >
                            {#snippet aboveMarks()}
                                <g
                                    in:fade={{ duration: 200 }}
                                    out:fade={{ duration: 200 }}
                                >
                                    <Text
                                        value={`${passCount ?? 0}/${(passCount ?? 0) + (failCount ?? 0)}`}
                                        textAnchor="middle"
                                        verticalAnchor="middle"
                                        class="fill-foreground text-xs! font-bold"
                                        dy={-8}
                                    />
                                    <Text
                                        value="Passed"
                                        textAnchor="middle"
                                        verticalAnchor="middle"
                                        class="fill-muted-foreground! text-xs! text-muted-foreground"
                                        dy={4}
                                    />
                                </g>
                            {/snippet}
                            {#snippet tooltip()}
                                <!-- Tooltip disabled -->
                            {/snippet}
                        </PieChart>
                    </Chart.Container>
                {:else}
                    <span class="text-xs text-muted-foreground"
                        >No test data</span
                    >
                {/if}
            </div>
        </div>
    </Card.Content>
</Card.Root>
