<script lang="ts">
    export let pipelineType: "build" | "release" | null = null;
    export let pipelineId: number | null = null;
    import * as Card from "$lib/components/ui/card/index.js";
    import PipelineStatusBadge from "$lib/components/ui/PipelineStatusBadge/pipelineStatusBadge.svelte";
    import { toast } from "svelte-sonner";
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
    import { ptaInject } from "$lib/stores/ptaStore";

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
        pipelineId != null &&
        !isNaN(pipelineId) &&
        pipelineType &&
        date
    ) {
        isLoading = true;
        testCases = null;
        testCasesError = null;

        const cleanDate = date.length > 10 ? date.slice(0, 10) : date;

        fetch(`/api/test-cases?pipelineId=${pipelineId}&pipelineType=${pipelineType}&date=${encodeURIComponent(cleanDate)}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    testCasesError = data.error + (data.details ? `: ${data.details}` : '');
                } else {
                    testCases = data.testCases ?? [];
                }
                isLoading = false;
            })
            .catch(error => {
                testCasesError = `Failed to load test cases: ${error.message}`;
                isLoading = false;
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

    function handlePtaInject() {
        const typeLabel = pipelineType === 'release' ? 'release' : 'build';
        const idPart = pipelineId ? ` ${pipelineId}` : '';
        let text = `Analyze ${pipelineName} (${typeLabel}${idPart})`;
        if (status) text += ` — status: ${status}`;
        if (passCount !== null && failCount !== null && passCount + failCount > 0) {
            text += ` — ${passCount} passed`;
            if (failCount > 0) text += `, ${failCount} failed`;
            if (notRunCount && notRunCount > 0) text += `, ${notRunCount} not run`;
        }
        ptaInject.set(text);
    }

    const chartConfig = {
        pass: { label: "Pass", color: "var(--chart-1)" },
        fail: { label: "Fail", color: "var(--chart-2)" },
        notRun: { label: "Not Run", color: "hsl(var(--muted))" },
    } satisfies Chart.ChartConfig;
</script>

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
                    <DialogContent class="!w-[min(92vw,900px)] !max-w-[min(92vw,900px)]">
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
                                            <div class="text-xs text-red-500 p-3 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-800">
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
        <div class="flex flex-col gap-2 w-full">
            <div class="flex flex-col items-start min-w-0 w-full">
                <div class="flex items-center gap-2 pb-1 flex-wrap">
                    <div class="font-semibold text-[1.1rem] leading-[1.2]">
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
                    <button
                        title="Ask PTA about this pipeline"
                        aria-label="Ask PTA"
                        on:click={handlePtaInject}
                        class="hidden lg:flex items-center justify-center pta-inject-btn"
                        style="background: none; border: none; cursor: pointer;"
                    >
                        <span
                            class="material-icons-outlined text-muted-foreground hover:text-primary"
                            style="font-size: 20px; line-height: 1; vertical-align: middle;"
                        >
                            smart_toy
                        </span>
                    </button>
                </div>
                <div class="text-xs text-muted-foreground mb-1">
                    {#if completedDate && status != "unknown" && status != "inProgress"}
                        Completed on {new Date(completedDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} {new Date(completedDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        {#if pipelineId}&nbsp;·&nbsp;<span class="opacity-50">{pipelineType === 'release' ? 'Release' : 'Build'} ID: {pipelineId}</span>{/if}
                    {:else if pipelineId}
                        <span class="opacity-50">{pipelineType === 'release' ? 'Release' : 'Build'} ID: {pipelineId}</span>
                    {/if}
                </div>
                <div class="text-xs text-muted-foreground mb-1">
                    <slot />
                </div>
            </div>
            {#if passCount !== null && failCount !== null && passCount + failCount > 0}
                {@const totalTests = passCount + (failCount ?? 0) + (notRunCount ?? 0)}
                {@const passPercentage = totalTests > 0 ? ((passCount / totalTests) * 100).toFixed(2) : '0.00'}
                {@const passWidth = totalTests > 0 ? (passCount / totalTests) * 100 : 0}
                {@const failWidth = totalTests > 0 ? ((failCount ?? 0) / totalTests) * 100 : 0}
                {@const notRunWidth = totalTests > 0 ? ((notRunCount ?? 0) / totalTests) * 100 : 0}

                <div class="flex flex-col gap-1 w-full">
                    <!-- Progress bar -->
                    <div class="flex h-6 w-full overflow-hidden rounded-md border border-border bg-muted test-progress-bar bar-reveal">
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
                    <div class="flex items-center justify-between flex-wrap gap-y-0.5 text-xs w-full test-stats-row stats-enter">
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
                <div class="text-xs text-muted-foreground pb-1">No test data</div>
            {/if}
        </div>
    </Card.Content>
</Card.Root>

<style>
    @keyframes barReveal {
        from { clip-path: inset(0 100% 0 0); }
        to   { clip-path: inset(0 0% 0 0); }
    }
    .bar-reveal {
        animation: barReveal 0.55s cubic-bezier(0.4, 0, 0.2, 1) both;
        animation-delay: 0.08s;
    }

    @keyframes statsEnter {
        from { opacity: 0; }
        to   { opacity: 1; }
    }
    .stats-enter {
        animation: statsEnter 0.35s ease both;
        animation-delay: 0.45s;
    }
</style>
