

<script lang="ts">
    import * as Card from "$lib/components/ui/card/index.js";
    import PipelineStatusBadge from "$lib/components/ui/PipelineStatusBadge/pipelineStatusBadge.svelte";
    import { toast } from "svelte-sonner";
    import { Toaster } from "$lib/components/ui/sonner";
    import * as Chart from "$lib/components/ui/chart/index.js";
    import { PieChart, Text } from "layerchart";
    import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
    import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "$lib/components/ui/dialog";
    import TestChart from "$lib/components/ui/TestChart/testChart.svelte";

    export let pipelineName: string = "PipelineName";
    export let link: string | null = null;
    export let status: string | null = null;
    export let passCount: number | null = null;
    export let failCount: number | null = null;
    export let releaseId: number | null = null;
    export let date: string | null = null;


    let dialogOpen = false;
    let isLoading = false;
    let testCases: import("$lib/components/ui/TestChart/testChart.svelte").TestCase[] | null = null;
    let testCasesError: string | null = null;

    $: if (dialogOpen && passCount !== null && failCount !== null && passCount + failCount > 0 && releaseId && date) {
        isLoading = true;
        testCases = null;
        testCasesError = null;
        fetch(`/api/test-cases?releaseId=${releaseId}&date=${encodeURIComponent((date.length > 10 ? date.slice(0, 10) : date))}`)
            .then(r => r.json())
            .then(data => {
                testCases = data.testCases;
                isLoading = false;
            })
            .catch(() => {
                testCases = null;
                isLoading = false;
                testCasesError = 'Failed to load test cases';
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
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
<Card.Content style="position: relative;">
    {#if passCount !== null && failCount !== null && passCount + failCount > 0}
        <Dialog bind:open={dialogOpen}>
            <DialogTrigger
                style="position: absolute; top: 0; right: 0.3rem; z-index: 10;"
            >
                <button
                    title="Maximize"
                    aria-label="Maximize"
                    style="width: 28px; height: 28px; border-radius: 50%; background: none; border: none; display: flex; align-items: center; justify-content: center;"
                >
                    <span class="material-icons text-muted-foreground cursor-pointer group-hover:text-primary" style="font-size: 20px;">fullscreen</span>
                </button>
            </DialogTrigger>
            {#if dialogOpen}
                <DialogContent>
                    <DialogDescription>
                        <div class="py-2">
                            {#if passCount !== null && failCount !== null && passCount + failCount > 0 && releaseId && date}
                                {#key `${releaseId}-${date}`}
                                    {#if isLoading}
                                        <TestChart isLoading={true} />
                                    {:else if testCases}
                                        <TestChart testCases={testCases} isLoading={false} />
                                    {:else if testCasesError}
                                        <div class="text-xs text-red-500">{testCasesError}</div>
                                    {/if}
                                {/key}
                            {/if}
                        </div>
                    </DialogDescription>
                </DialogContent>
            {/if}
        </Dialog>
    {/if}
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%;">
        <div class="flex flex-col items-start min-w-0 flex-1">
            <div class="flex items-center min-w-0 pb-1">
                <span class="font-semibold text-[1.1rem] leading-[1.2] truncate">{pipelineName}</span>
                <span class="ml-2 flex items-center gap-1">
                    <PipelineStatusBadge {status} />
                    {#if link}
                        <button
                            title="Copy link"
                            aria-label="Copy link"
                            on:click={handleCopy}
                            style="background: none; border: none; padding: 5px; cursor: pointer; display: flex; align-items: center;"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke="currentColor"
                                    stroke-width="2"
                                    fill="none"
                                    d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
                                />
                                <circle
                                    cx="12"
                                    cy="12"
                                    r="3"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    fill="none"
                                />
                            </svg>
                        </button>
                    {/if}
                </span>
            </div>
            <div class="text-xs text-muted-foreground mb-1">
                <slot/>
            </div>
        </div>
        <div class="flex-shrink-0 flex items-center justify-center" style="min-width: 80px; min-height: 80px;">
            {#if passCount === null || failCount === null}
                <Skeleton class="h-24 w-24 rounded-full" />
            {:else if passCount !== null && failCount !== null && passCount + failCount > 0}
                <Chart.Container config={chartConfig} class="aspect-square max-h-[120px]" style="width: 120px; height: 120px;">
                    <PieChart
                        data={[
                            { result: "pass", value: passCount, color: chartConfig.pass.color},
                            { result: "fail", value: failCount, color: chartConfig.fail.color }
                        ]}
                        key="result"
                        value="value"
                        c="color"
                        innerRadius={40}
                        padding={25}
                        props={{ pie: { motion: "tween" } }}
                    >
                        {#snippet aboveMarks()}
                            <Text
                                value={
                                    (() => {
                                        const total = (passCount ?? 0) + (failCount ?? 0);
                                        if (total === 0) return "0%";
                                        const percent = Math.round(((passCount ?? 0) / total) * 100);
                                        return `${percent}%`;
                                    })()
                                }
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
                        {/snippet}
                        {#snippet tooltip()}
                            <Chart.Tooltip hideLabel />
                        {/snippet}
                    </PieChart>
                </Chart.Container>
            {:else}
                <span class="text-xs text-muted-foreground">No test data</span>
            {/if}
        </div>
    </div>
</Card.Content>
</Card.Root>
