<script lang="ts">
    export let pipelineType: "build" | "release" | null = null;
    export let pipelineId: number | null = null;
    import * as Card from "$lib/components/ui/card/index.js";
    import PipelineStatusBadge from "$lib/components/ui/PipelineStatusBadge/pipelineStatusBadge.svelte";
    import { toast } from "svelte-sonner";
    import { Toaster } from "$lib/components/ui/sonner";
    import * as Chart from "$lib/components/ui/chart/index.js";
    import {
        Dialog,
        DialogContent,
        DialogTitle,
        DialogDescription,
    } from "$lib/components/ui/dialog";
    import TestChart from "$lib/components/ui/TestChart/testChart.svelte";
    import { onMount } from "svelte";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import { getTestPassColor, getTestFailColor, getTestNoDataColor } from "$lib/constants/colors";

    export let pipelineName: string = "PipelineName";
    export let pipelineGroup: string | null = null; // Pipeline group name for display in dialogs
    export let link: string | null = null;
    export let status: string | null = null;
    export let passCount: number | null = null;
    export let failCount: number | null = null;
    export let notRunCount: number | null = null;
    export let completedDate: string | null = null;
    export let date: string | null = null;

    let dialogOpen = false;
    let isLoading = false;

    // RCA state (release pipelines only)
    let rcaSummary: string | null = null;
    let rcaFullContent: string | null = null;
    let rcaEnvironment: string | null = null;
    let rcaTimestamp: string | null = null;
    let rcaDialogOpen = false;

    onMount(() => {
        if (pipelineType === 'release' && pipelineId) {
            fetch(`/api/rca?releaseId=${pipelineId}`)
                .then(r => r.json())
                .then(data => {
                    if (data.rca) {
                        rcaSummary = data.rca.summary ?? null;
                        rcaFullContent = data.rca.fullContent ?? null;
                        rcaEnvironment = data.rca.environment ?? null;
                        rcaTimestamp = data.rca.timestamp ?? null;
                    }
                })
                .catch(() => {}); // Silent fail — RCA is non-critical
        }
    });
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
        notRun: { label: "Not Run", color: "hsl(var(--muted))" },
    } satisfies Chart.ChartConfig;
</script>

<Toaster position="top-center" richColors />
<Card.Root class="shadow-lg border-1 border-accent rounded-lg py-2">
    <link
        href="https://fonts.googleapis.com/icon?family=Material+Icons|Material+Icons+Outlined"
        rel="stylesheet"
    />
    <Card.Content style="position: relative;">
        {#if rcaFullContent}
            <Dialog bind:open={rcaDialogOpen}>
                {#if rcaDialogOpen}
                    <DialogContent class="!w-[50vw] !max-w-[50vw]">
                        <DialogTitle>
                            <div class="flex flex-col gap-1">
                                <div class="text-lg font-semibold">Root Cause Analysis</div>
                                {#if rcaEnvironment}
                                    <div class="text-sm font-normal text-muted-foreground">{pipelineName}</div>
                                {/if}
                                {#if rcaTimestamp}
                                    <div class="text-xs font-normal text-muted-foreground">
                                        {new Date(rcaTimestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                                    </div>
                                {/if}
                            </div>
                        </DialogTitle>
                        <DialogDescription>
                            <pre class="mt-3 text-xs text-foreground whitespace-pre-wrap font-mono overflow-auto max-h-[60vh] bg-muted/40 rounded-md p-4 border border-border">{rcaFullContent}</pre>
                        </DialogDescription>
                    </DialogContent>
                {/if}
            </Dialog>
        {/if}

        {#if passCount !== null && failCount !== null && passCount + failCount > 0}
            <Dialog bind:open={dialogOpen}>
                {#if dialogOpen}
                    <DialogContent>
                        <DialogTitle>
                            <div class="flex flex-col gap-1">
                                {#if pipelineGroup}
                                    <div class="text-sm font-medium text-muted-foreground">{pipelineGroup}</div>
                                {/if}
                                <div class="text-lg font-semibold">{pipelineName}</div>
                            </div>
                        </DialogTitle>
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
            class="flex-container"
            style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%;"
        >
            <div class="flex flex-col items-start min-w-0 flex-1">
                <div class="flex items-center gap-2 pb-1">
                    <div class="font-semibold text-[1.1rem] leading-[1.2] truncate">
                        {pipelineName}
                    </div>
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
                    {#if rcaSummary}
                        <button
                            title="View root cause analysis"
                            aria-label="View root cause analysis"
                            on:click={() => rcaDialogOpen = true}
                            style="background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;"
                        >
                            <span
                                class="material-icons-outlined text-amber-500 hover:text-amber-600 animate-pulse"
                                style="font-size: 20px; line-height: 1; vertical-align: middle;"
                            >
                                psychology
                            </span>
                        </button>
                    {/if}
                </div>
                {#if completedDate && status != "unknown" && status != "inProgress"}
                    <div class="text-xs text-muted-foreground mb-1">
                        Completed on {new Date(completedDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} {new Date(completedDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </div>
                {/if}
                <div class="text-xs text-muted-foreground mb-1">
                    <slot />
                </div>
            </div>
            {#if passCount !== null && failCount !== null && passCount + failCount > 0}
                {@const totalTests = passCount + (failCount ?? 0) + (notRunCount ?? 0)}
                {@const passPercentage = totalTests > 0 ? Math.round((passCount / totalTests) * 100) : 0}
                {@const passWidth = totalTests > 0 ? (passCount / totalTests) * 100 : 0}
                {@const failWidth = totalTests > 0 ? ((failCount ?? 0) / totalTests) * 100 : 0}
                {@const notRunWidth = totalTests > 0 ? ((notRunCount ?? 0) / totalTests) * 100 : 0}
                
                <div class="flex-shrink-0 flex flex-col gap-2 test-bar-container">
                    <!-- Progress bar -->
                    <div class="flex h-6 w-[200px] sm:w-[300px] overflow-hidden rounded-md border border-border bg-muted test-progress-bar">
                        {#if passWidth > 0}
                            <div
                                class="{getTestPassColor()} flex items-center justify-center text-xs font-medium text-white"
                                style="width: {passWidth}%"
                                title="Passed: {passCount}"
                            ></div>
                        {/if}
                        {#if failWidth > 0}
                            <div
                                class="{getTestFailColor()} flex items-center justify-center text-xs font-medium text-white"
                                style="width: {failWidth}%"
                                title="Failed: {failCount}"
                            ></div>
                        {/if}
                        {#if notRunWidth > 0}
                            <div
                                class="{getTestNoDataColor()} flex items-center justify-center text-xs font-medium text-white"
                                style="width: {notRunWidth}%"
                                title="Not Run: {notRunCount}"
                            ></div>
                        {/if}
                    </div>
                    
                    <!-- Stats row -->
                    <div class="flex items-center justify-between flex-wrap gap-y-0.5 text-xs w-[200px] sm:w-[300px] test-stats-row">
                        <div class="flex items-center gap-3 whitespace-nowrap">
                            <span class="text-lime-600 dark:text-lime-500 font-medium whitespace-nowrap">
                                <span class="sm:hidden">P:</span>
                                <span class="hidden sm:inline">Pass:</span>
                                {passCount}
                            </span>
                            {#if failCount && failCount > 0}
                                <span class="text-red-800 dark:text-red-700 font-medium whitespace-nowrap">
                                    <span class="sm:hidden">F:</span>
                                    <span class="hidden sm:inline">Fail:</span>
                                    {failCount}
                                </span>
                            {/if}
                            {#if notRunCount && notRunCount > 0}
                                <span class="text-muted-foreground font-medium whitespace-nowrap">
                                    <span class="sm:hidden">N:</span>
                                    <span class="hidden sm:inline">Not Run:</span>
                                    {notRunCount}
                                </span>
                            {/if}
                        </div>
                        <span class="text-muted-foreground font-medium whitespace-nowrap">
                            {passPercentage}% <span class="hidden sm:inline"> Pass Rate</span> · {totalTests} tests
                        </span>
                    </div>
                </div>
            {:else}
                <div class="flex-shrink-0 flex items-center justify-center w-[200px] sm:w-[300px] test-bar-container pb-1">
                    <span class="text-xs text-muted-foreground">No test data</span>
                </div>
            {/if}
        </div>
    </Card.Content>
</Card.Root>

<style>
    @media (max-width: 450px) {
        .flex-container {
            flex-direction: column !important;
            align-items: stretch !important;
        }
        
        .test-bar-container {
            width: 100% !important;
            align-items: stretch !important;
        }
        
        .test-progress-bar,
        .test-stats-row {
            width: 100% !important;
        }
    }
</style>
