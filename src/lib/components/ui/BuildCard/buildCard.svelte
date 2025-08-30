
<script lang="ts">
    import * as Card from "$lib/components/ui/card/index.js";
    import PipelineStatusBadge from "$lib/components/ui/PipelineStatusBadge/pipelineStatusBadge.svelte";
    import { toast } from "svelte-sonner";
    import { Toaster } from "$lib/components/ui/sonner";
    import * as Chart from "$lib/components/ui/chart/index.js";
    import { PieChart, Text } from "layerchart";
    import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
    import { onMount } from "svelte";

    export let pipelineName: string = "PipelineName";
    export let link: string | null = null;
    export let status: string = "Unknown";
    export let releaseDefId: string | number | null = null;
    export let date: string | null = null; // YYYY-MM-DD

    function handleCopy() {
        if (link) {
            navigator.clipboard.writeText(link);
            toast.info(link, { duration: 6000 });
        }
    }

    // Chart state
    let passCount: number | null = null;
    let failCount: number | null = null;
    let loading = false;
    let error: string | null = null;

    async function fetchTestRun() {
        if (!releaseDefId || !date) return;
        loading = true;
        error = null;
        try {
            const res = await fetch(`/api/test-run?releaseDefId=${releaseDefId}&date=${date}`);
            const data = await res.json();
            if (res.ok && typeof data.passCount === 'number' && typeof data.failCount === 'number') {
                passCount = data.passCount;
                failCount = data.failCount;
            } else {
                passCount = null;
                failCount = null;
                error = data?.error || 'No test data';
            }
        } catch (e) {
            error = 'Failed to load test data';
            passCount = null;
            failCount = null;
        } finally {
            loading = false;
        }
    }

    $: if (releaseDefId && date) fetchTestRun();

    const chartConfig = {
        pass: { label: "Pass", color: "var(--chart-1)" },
        fail: { label: "Fail", color: "var(--chart-2)" },
    } satisfies Chart.ChartConfig;
</script>

<Toaster position="top-center" richColors />
<Card.Root class="shadow-lg border-1 border-accent rounded-lg">
    <Card.Content>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%;">
            <!-- Left: Title and Description/Body -->
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
                <slot />
            </div>
            <!-- Right: Chart -->
            <div class="flex-shrink-0 flex items-center justify-center" style="width: 120px; height: 80px; min-width: 80px; min-height: 80px;">
                {#if loading}
                    <span class="text-xs text-muted-foreground">Loading...</span>
                {:else if error}
                    <span class="text-xs text-red-500">{error}</span>
                {:else if passCount !== null && failCount !== null}
                    <Chart.Container config={chartConfig} class="mx-auto" style="width: 80px; height: 80px;">
                        <PieChart
                            data={[{ result: "pass", value: passCount, color: chartConfig.pass.color }, { result: "fail", value: failCount, color: chartConfig.fail.color }]}
                            key="result"
                            value="value"
                            c="color"
                            innerRadius={24}
                            padding={8}
                            range={[-90, 90]}
                            props={{ pie: { sort: null } }}
                            cornerRadius={4}
                        >
                            {#snippet aboveMarks()}
                                <Text
                                    value={String((passCount ?? 0) + (failCount ?? 0))}
                                    textAnchor="middle"
                                    verticalAnchor="middle"
                                    class="fill-foreground text-base! font-bold"
                                    dy={-8}
                                />
                                <Text
                                    value="Tests"
                                    textAnchor="middle"
                                    verticalAnchor="middle"
                                    class="fill-muted-foreground! text-muted-foreground"
                                    dy={8}
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
