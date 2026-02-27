<script lang="ts">
    export let pipelineType: "build" | "release" | null = null;
    export let pipelineId: number | null = null;
    import * as Card from "$lib/components/ui/card/index.js";
    import PipelineStatusBadge from "$lib/components/ui/PipelineStatusBadge/pipelineStatusBadge.svelte";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
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

    type Stage = { name: string; status: string; startTime?: string | null; finishTime?: string | null; };

    export let pipelineName: string = "PipelineName";
    export let pipelineGroup: string | null = null; // Pipeline group name for display in dialogs
    export let link: string | null = null;
    export let status: string | null = null;
    export let passCount: number | null = null;
    export let failCount: number | null = null;
    export let notRunCount: number | null = null;
    export let completedDate: string | null = null;
    export let date: string | null = null;
    export let startTime: string | null = null;
    export let stages: Stage[] | null = null;
    export let definitionId: number | null = null;

    let dialogOpen = false;
    let isLoading = false;

    // Duration ticker
    let now = Date.now();

    // Expand / stage state
    let expanded = false;
    let resolvedStages: Stage[] = [];
    let stagesLoading = false;
    let stagesFetched = false;

    function formatDuration(ms: number): string {
        const totalMinutes = Math.floor(ms / 60000);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    function formatStageDuration(ms: number): string {
        if (ms < 0) return '';
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const remS = s % 60;
        if (m < 60) return remS > 0 ? `${m}m ${remS}s` : `${m}m`;
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
    }

    function stageDuration(stage: Stage): string | null {
        if (!stage.startTime || stage.status === 'notStarted') return null;
        const start = new Date(stage.startTime).getTime();
        if (isNaN(start)) return null;
        if (stage.status === 'inProgress' || stage.status === 'queued') {
            return formatStageDuration(now - start);
        }
        if (stage.finishTime) {
            const end = new Date(stage.finishTime).getTime();
            if (!isNaN(end) && end > start) return formatStageDuration(end - start);
        }
        return null;
    }

    function stageColor(s: string): string {
        switch (s) {
            case 'succeeded': return 'var(--success)';
            case 'inProgress':
            case 'queued': return 'var(--in-progress)';
            case 'failed':
            case 'rejected': return 'var(--failure)';
            case 'canceled': return 'var(--interrupted)';
            case 'partiallySucceeded': return 'var(--partially-succeeded)';
            default: return 'var(--muted-foreground)';
        }
    }

    function stageStatusLabel(s: string): string {
        switch (s) {
            case 'succeeded': return 'Passed';
            case 'inProgress': return 'Running';
            case 'queued': return 'Queued';
            case 'failed': return 'Failed';
            case 'rejected': return 'Rejected';
            case 'canceled': return 'Canceled';
            case 'partiallySucceeded': return 'Partial';
            default: return 'Not Started';
        }
    }

    function loadBuildTimeline() {
        stagesLoading = true;
        stagesFetched = true;
        fetch(`/api/buildTimeline?buildId=${pipelineId}`)
            .then(r => r.json())
            .then(d => { resolvedStages = d.stages ?? []; })
            .catch(() => {})
            .finally(() => { stagesLoading = false; });
    }

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

        let tickId: ReturnType<typeof setInterval> | null = null;
        if (status === 'inProgress') {
            tickId = setInterval(() => { now = Date.now(); }, 5000);
        }

        // Auto-fetch timeline for in-progress builds so stage bar shows without expanding
        if (pipelineType === 'build' && status === 'inProgress' && pipelineId && !stagesFetched) {
            loadBuildTimeline();
        }

        return () => { if (tickId) clearInterval(tickId); };
    });
    let testCases:
        | import("$lib/components/ui/TestChart/testChart.svelte").TestCase[]
        | null = null;
    let testCasesError: string | null = null;

    // Sync pre-populated stages for releases
    $: if (stages !== null) { resolvedStages = stages; }

    // Lazy-fetch build timeline on expand
    $: if (expanded && pipelineType === 'build' && stages === null && pipelineId && !stagesFetched && !stagesLoading) {
        loadBuildTimeline();
    }

    // Re-fetch final stage snapshot when build transitions out of inProgress
    let prevStatus: string | null = null;
    $: {
        if (pipelineType === 'build' && stagesFetched && prevStatus === 'inProgress' && status !== 'inProgress') {
            loadBuildTimeline();
        }
        prevStatus = status;
    }

    // Duration label
    $: durationLabel = (() => {
        if (!startTime) return null;
        const start = new Date(startTime).getTime();
        if (status === 'inProgress') {
            return `Running for ${formatDuration(now - start)}`;
        }
        if (completedDate) {
            const end = new Date(completedDate).getTime();
            return `Ran for ${formatDuration(end - start)}`;
        }
        return null;
    })();

    // Show expand button: releases with stages, or any build
    $: showExpand = (Array.isArray(stages) && stages.length > 0) || pipelineType === 'build';

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
                    {#if showExpand}
                        <button
                            title="Toggle stages"
                            aria-label="Toggle stage list"
                            on:click={() => expanded = !expanded}
                            style="background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;"
                        >
                            <span
                                class="material-icons-outlined text-muted-foreground hover:text-primary"
                                style="font-size: 18px; line-height: 1; vertical-align: middle;"
                            >
                                {expanded ? 'expand_less' : 'expand_more'}
                            </span>
                        </button>
                    {/if}
                </div>
                <div class="text-xs text-muted-foreground mb-1">
                    {#if completedDate && status != "unknown" && status != "inProgress"}
                        Completed on {new Date(completedDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} {new Date(completedDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        {#if durationLabel}&nbsp;·&nbsp;{durationLabel}{/if}
                        {#if pipelineId}&nbsp;·&nbsp;<span class="opacity-50">{pipelineType === 'release' ? 'Release' : 'Build'} ID: {pipelineId}</span>{/if}
                    {:else if status === 'inProgress' && durationLabel}
                        {durationLabel}
                        {#if pipelineId}&nbsp;·&nbsp;<span class="opacity-50">{pipelineType === 'release' ? 'Release' : 'Build'} ID: {pipelineId}</span>{/if}
                    {:else if pipelineId}
                        <span class="opacity-50">{pipelineType === 'release' ? 'Release' : 'Build'} ID: {pipelineId}</span>
                    {/if}
                </div>
                <div class="text-xs text-muted-foreground mb-1">
                    <slot />
                </div>
            </div>
            {#if resolvedStages.length > 0}
                <div class="relative mt-0.5 mb-1">
                    <!-- Visual bar -->
                    <div class="flex h-1.5 w-full overflow-hidden rounded-full gap-px">
                        {#each resolvedStages as stage}
                            <div
                                class="flex-1 h-full transition-colors duration-300"
                                style="background-color: {stageColor(stage.status)}; opacity: {stage.status === 'notStarted' ? 0.25 : 1};"
                            ></div>
                        {/each}
                    </div>
                    <!-- Hover targets (taller than the bar for easier interaction) -->
                    <div class="absolute inset-x-0 flex" style="top: -5px; bottom: -5px;">
                        {#each resolvedStages as stage}
                            {@const dur = stageDuration(stage)}
                            <div class="relative flex-1 group cursor-default">
                                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                                    <div class="bg-popover text-popover-foreground text-xs rounded-md shadow-md px-2 py-1.5 whitespace-nowrap border border-border">
                                        <div class="font-medium">{stage.name}</div>
                                        <div class="text-muted-foreground mt-0.5">
                                            {stageStatusLabel(stage.status)}{#if dur}&nbsp;·&nbsp;{dur}{/if}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
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
            {#if expanded}
                <div class="mt-1.5 border-t border-border pt-2 flex flex-col gap-1">
                    {#if stagesLoading}
                        <Skeleton class="h-4 w-3/4 rounded" />
                        <Skeleton class="h-4 w-1/2 rounded" />
                        <Skeleton class="h-4 w-2/3 rounded" />
                    {:else if resolvedStages.length === 0}
                        <div class="text-xs text-muted-foreground">No stage data available</div>
                    {:else}
                        {#each resolvedStages as stage}
                            {@const dur = stageDuration(stage)}
                            <div class="flex items-center gap-2 text-xs">
                                <span style="color: {stageColor(stage.status)}; line-height: 1; font-size: 10px;">●</span>
                                <span class="flex-1 truncate">{stage.name}</span>
                                {#if dur}
                                    <span class="tabular-nums shrink-0" style="color: {stageColor(stage.status)}; opacity: 0.8;">{dur}</span>
                                {/if}
                                <span class="text-muted-foreground shrink-0">{stageStatusLabel(stage.status)}</span>
                            </div>
                        {/each}
                    {/if}
                </div>
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
