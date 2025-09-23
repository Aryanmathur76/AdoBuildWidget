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
    export let date: string | null = null;

    let chartCycleInterval: ReturnType<typeof setInterval> | null = null;
    let chartAltMode = false;

    import { onMount, onDestroy } from "svelte";
    onMount(() => {
        chartCycleInterval = setInterval(() => {
            chartAltMode = !chartAltMode;
        }, 5000);
    });
    onDestroy(() => {
        if (chartCycleInterval) clearInterval(chartCycleInterval);
    });

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
        
        // For test cases, we need a releaseId which we might not have directly
        // We'll fallback to the original API call for now, but could be enhanced
        // to use the cache if we have the releaseId
        const cleanDate = date.length > 10 ? date.slice(0, 10) : date;
        fetch(
            `/api/test-cases?pipelineId=${pipelineId}&pipelineType=${pipelineType}&date=${encodeURIComponent(cleanDate)}`,
        )
            .then((r) => r.json())
            .then((data) => {
                testCases = data.testCases;
                isLoading = false;
            })
            .catch(() => {
                testCases = null;
                isLoading = false;
                testCasesError = "Failed to load test cases";
            });
    }

    function handleCopy() {
        if (link) {
            navigator.clipboard.writeText(link);
            toast.info(link, { duration: 6000 });
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
                <div class="font-semibold text-[1.1rem] leading-[1.2] truncate pb-1">
                    {pipelineName}
                </div>
                <div class="flex items-center gap-1 mb-1">
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
                                content_copy
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
                {#if passCount === null || failCount === null}
                    <Skeleton class="h-24 w-24 rounded-full" />
                {:else if passCount !== null && failCount !== null && passCount + failCount > 0}
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
                                {#if chartAltMode}
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
                                {:else}
                                    <g
                                        in:fade={{ duration: 200 }}
                                        out:fade={{ duration: 200 }}
                                    >
                                        <Text
                                            value={(() => {
                                                const total =
                                                    (passCount ?? 0) +
                                                    (failCount ?? 0);
                                                if (total === 0) return "0%";
                                                const percent = Math.round(
                                                    ((passCount ?? 0) / total) *
                                                        100,
                                                );
                                                return `${percent}%`;
                                            })()}
                                            textAnchor="middle"
                                            verticalAnchor="middle"
                                            class="fill-foreground text-xs! font-bold"
                                            dy={-8}
                                        />
                                        <Text
                                            value="Pass Rate"
                                            textAnchor="middle"
                                            verticalAnchor="middle"
                                            class="fill-muted-foreground! text-xs! text-muted-foreground"
                                            dy={4}
                                        />
                                    </g>
                                {/if}
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
