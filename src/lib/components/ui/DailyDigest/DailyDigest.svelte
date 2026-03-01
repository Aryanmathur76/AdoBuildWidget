<script lang="ts">
    import { typewriter } from '$lib/utils/typewriter.js';
    import BuildCard from '$lib/components/ui/BuildCard/buildCard.svelte';
    import { Skeleton } from '$lib/components/ui/skeleton/index.js';
    import { pipelineDataService } from '$lib/stores/pipelineDataService.js';
    import { getBuildStatusColor } from '$lib/constants/colors.js';
    import { getDateString, type PipelineConfig } from '$lib/utils/buildQualityUtils.js';
    import { env } from '$env/dynamic/public';

    let pipelineConfig: PipelineConfig | null = null;
    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch {}

    const todayDate = new Date();
    const todayStr = getDateString(todayDate);
    const formattedDate = todayDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

    type Stage = {
        name: string;
        status: string;
        startTime?: string | null;
        finishTime?: string | null;
        attempts?: number | null;
    };

    type CardRow = {
        pipelineName: string;
        pipelineGroup: string | null;
        pipelineType: 'build' | 'release';
        pipelineId: number;
        definitionId: number;
        status: string | null;
        passCount: number | null;
        failCount: number | null;
        notRunCount: number | null;
        completedDate: string | null;
        link: string | null;
        startTime: string | null;
        stages: Stage[] | null;
    };

    let overallQuality = $state('unknown');
    let isLoading = $state(true);
    let rows = $state<CardRow[]>([]);
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let isRefreshingVisible = $state(false);
    let reloadTick = $state(0);
    let lastFetchedAt = $state<Date | null>(null);
    let nowTick = $state(Date.now());
    let isManualRefreshing = $state(false);

    $effect(() => {
        const id = setInterval(() => { nowTick = Date.now(); }, 30_000);
        return () => clearInterval(id);
    });

    let stalenessLabel = $derived.by(() => {
        if (!lastFetchedAt) return '';
        const diffMs = nowTick - lastFetchedAt.getTime();
        const diffMin = Math.floor(diffMs / 60_000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        return `${Math.floor(diffMin / 60)}h ago`;
    });

    async function handleRefresh() {
        if (!pipelineConfig?.pipelines) return;
        isManualRefreshing = true;

        // Build list of Redis cache keys to clear
        const redisKeysToDelete: string[] = [];
        pipelineConfig.pipelines.forEach(p => {
            const id = String(p.id);
            if (p.type === 'release') {
                redisKeysToDelete.push(`release:${todayStr}:${id}`);
            } else if (p.type === 'build/release') {
                redisKeysToDelete.push(`build:${todayStr}:${id}`);
                redisKeysToDelete.push(`release:${todayStr}:${id}`);
            } else {
                redisKeysToDelete.push(`build:${todayStr}:${id}`);
            }
        });

        try {
            // Clear Redis cache on the server
            await fetch('/api/clearCacheKeys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys: redisKeysToDelete })
            });
        } catch (err) {
            console.error('Failed to clear server cache:', err);
        }

        // Clear local client-side cache
        redisKeysToDelete.forEach(key => {
            pipelineDataService.clearLocalCache(key);
        });

        reloadTick++;
    }

    async function fetchPipelineRow(p: any): Promise<CardRow[]> {
        const id = String(p.id);
        const name = p.displayName ?? `Pipeline ${id}`;

        if (p.type === 'release') {
            const data = await pipelineDataService.fetchReleaseDataSilent(todayStr, id);
            const stages: Stage[] = (data?.envs ?? [])
                .filter((e: any) => e.name !== 'PTA')
                .map((e: any) => {
                    const steps = e.deploySteps ?? [];
                    const lastStep = steps[steps.length - 1];
                    const active = e.status === 'inProgress' || e.status === 'queued';
                    return {
                        name: e.name,
                        status: e.status ?? 'notStarted',
                        startTime: lastStep?.queuedOn ?? e.queuedOn ?? null,
                        finishTime: active ? null : (lastStep?.lastModifiedOn ?? null),
                        attempts: steps.length > 1 ? steps.length : null,
                    };
                });
            return [{
                pipelineName: name,
                pipelineGroup: null,
                pipelineType: 'release',
                pipelineId: Number(data?.id ?? p.id),
                definitionId: Number(p.id),
                status: data?.status ?? 'unknown',
                passCount: data?.passedTestCount ?? null,
                failCount: data?.failedTestCount ?? null,
                notRunCount: data?.notRunTestCount ?? null,
                completedDate: data?.completedTime ?? null,
                link: data?.link ?? null,
                startTime: data?.createdOn ?? null,
                stages,
            }];
        } else {
            const dataArr = await pipelineDataService.fetchBuildDataSilent(todayStr, id);
            const arr = Array.isArray(dataArr) && dataArr.length > 0 ? dataArr : [];
            if (arr.length === 0) {
                return [{
                    pipelineName: name,
                    pipelineGroup: null,
                    pipelineType: 'build',
                    pipelineId: Number(p.id),
                    definitionId: Number(p.id),
                    status: 'unknown',
                    passCount: null,
                    failCount: null,
                    notRunCount: null,
                    completedDate: null,
                    link: null,
                    startTime: null,
                    stages: null,
                }];
            }
            return arr.map((b: any) => ({
                pipelineName: b.testRunName || name,
                pipelineGroup: name,
                pipelineType: 'build' as const,
                pipelineId: Number(b.id ?? p.id),
                definitionId: Number(p.id),
                status: b.status ?? 'unknown',
                passCount: b.passedTestCount ?? null,
                failCount: b.failedTestCount ?? null,
                notRunCount: b.notRunTestCount ?? null,
                completedDate: b.completedTime ?? null,
                link: b.link ?? null,
                startTime: b.startTime ?? null,
                stages: null,
            }));
        }
    }

    let dotFrame = $state(0);
    $effect(() => {
        if (isLoading || overallQuality === 'inProgress') {
            const id = setInterval(() => { dotFrame = (dotFrame + 1) % 3; }, 700);
            return () => clearInterval(id);
        }
    });

    let statusLabel = $derived.by(() => {
        if (isLoading || overallQuality === 'inProgress') {
            const d = ['.', '..', '...'][dotFrame];
            return `[INPROGRESS${d}]`;
        }
        if (overallQuality === 'good') return '[GOOD]';
        if (overallQuality === 'ok') return '[OK]';
        if (overallQuality === 'bad') return '[ISSUES]';
        if (overallQuality === 'interrupted') return '[INTERRUPTED]';
        return '';
    });

    let statusColor = $derived.by(() => {
        if (overallQuality === 'good') return 'color: var(--success)';
        if (overallQuality === 'ok') return 'color: var(--partially-succeeded)';
        if (overallQuality === 'bad') return 'color: var(--failure)';
        if (overallQuality === 'inProgress') return 'color: var(--in-progress)';
        if (overallQuality === 'interrupted') return 'color: var(--interrupted)';
        return 'color: var(--in-progress)'; // loading state only
    });

    $effect(() => {
        reloadTick; // reactive dependency — incrementing triggers a reload
        if (typeof window === 'undefined') return;

        let isRefreshing = false;

        async function load() {
            try {
                const qRes = await fetch(`/api/getDayQuality?date=${todayStr}`);
                if (qRes.ok) {
                    const data = await qRes.json();
                    overallQuality = data.quality ?? 'unknown';
                }
            } catch {}

            if (!pipelineConfig?.pipelines?.length) {
                isLoading = false;
                return;
            }

            try {
                const results = await Promise.all(
                    pipelineConfig.pipelines.map((p) => fetchPipelineRow(p))
                );
                rows = results.flat();
                lastFetchedAt = new Date();
            } finally {
                isLoading = false;
                isManualRefreshing = false;
            }

            if (refreshTimer) clearTimeout(refreshTimer);

            const inProgressRows = rows.filter(r => r.status === 'inProgress');
            if (inProgressRows.length > 0) {
                refreshTimer = setTimeout(async () => {
                    if (isRefreshing) return;
                    isRefreshing = true;
                    isRefreshingVisible = true;

                    inProgressRows.forEach(r => {
                        const prefix = r.pipelineType === 'release' ? 'release' : 'build';
                        pipelineDataService.clearLocalCache(`${prefix}:${todayStr}:${String(r.definitionId)}`);
                    });

                    await load();

                    isRefreshing = false;
                    isRefreshingVisible = false;
                }, 60_000);
            }
        }

        load();
        return () => { if (refreshTimer) clearTimeout(refreshTimer); };
    });

    let totalPass = $derived(rows.reduce((s, r) => s + (r.passCount ?? 0), 0));
    let totalFail = $derived(rows.reduce((s, r) => s + (r.failCount ?? 0), 0));
    let passRate = $derived(
        totalPass + totalFail > 0
            ? ((totalPass / (totalPass + totalFail)) * 100).toFixed(2)
            : '0.00'
    );

    const pipelineCount = pipelineConfig?.pipelines?.length ?? 1;

    function getQualityBgVar(quality: string): string {
        switch (quality) {
            case 'good':        return 'var(--success)';
            case 'ok':          return 'var(--partially-succeeded)';
            case 'bad':         return 'var(--failure)';
            case 'inProgress':  return 'var(--in-progress)';
            case 'interrupted': return 'var(--interrupted)';
            default:            return 'transparent';
        }
    }
</script>

<div class="flex flex-col h-full">
    <!-- Title + status inline -->
    <div class="flex items-center gap-2 pt-1 pb-1.5 border-b border-border shrink-0 rounded-t">
        <span class="text-xs font-bold uppercase tracking-widest text-primary font-mono inline-flex items-center gap-1.5"><span class="opacity-50">>_</span><span use:typewriter>Today's Results</span></span>
        {#if statusLabel}
            <span class="font-mono text-xs" style={statusColor}>{statusLabel}</span>
        {/if}
        <span class="ml-auto flex items-center gap-1.5 shrink-0">
            {#if isRefreshingVisible}
                <span class="w-1.5 h-1.5 rounded-full bg-[var(--in-progress)] animate-pulse"
                      title="Refreshing pipeline data..."></span>
            {/if}
            {#if stalenessLabel && !isLoading}
                <span class="text-xs text-muted-foreground/60" title="Last fetched at {lastFetchedAt?.toLocaleTimeString()}">{stalenessLabel}</span>
            {/if}
            <button
                onclick={handleRefresh}
                disabled={isLoading || isRefreshingVisible || isManualRefreshing}
                class="p-0.5 rounded hover:bg-accent/30 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
                title="Refresh pipeline data"
                aria-label="Refresh"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                     class={isManualRefreshing ? 'animate-spin' : ''}>
                    <path d="M21 2v6h-6"/>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                    <path d="M3 22v-6h6"/>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
            </button>
            <span class="text-xs text-muted-foreground">{formattedDate}</span>
        </span>
    </div>

    <!-- Pipeline cards — scrollable, fills remaining space -->
    <div class="flex flex-col gap-2 py-2 flex-1 min-h-0 overflow-auto">
        {#if isLoading}
            {#each Array.from({ length: pipelineCount }) as _}
                <Skeleton class="h-[72px] w-full rounded-lg" />
            {/each}
        {:else}
            {#each rows as row, i}
                <div class="card-enter" style="animation-delay: {i * 65}ms">
                    <BuildCard
                        pipelineName={row.pipelineName}
                        pipelineGroup={row.pipelineGroup}
                        pipelineType={row.pipelineType}
                        pipelineId={row.pipelineId}
                        definitionId={row.definitionId}
                        link={row.link}
                        status={row.status}
                        passCount={row.passCount}
                        failCount={row.failCount}
                        notRunCount={row.notRunCount}
                        completedDate={row.completedDate}
                        date={todayStr}
                        startTime={row.startTime}
                        stages={row.stages}
                    />
                </div>
            {/each}
            {#if rows.length === 0}
                <div class="text-xs text-muted-foreground text-center py-4">No pipelines configured</div>
            {/if}
        {/if}
    </div>

    <!-- Footer — always pinned at bottom -->
    {#if !isLoading && (totalPass > 0 || totalFail > 0)}
        <div class="footer-enter border-t border-border pt-1.5 pb-1 flex items-center justify-between gap-2 text-xs shrink-0">
            <div class="flex items-center gap-3">
                <span class="text-lime-600 dark:text-lime-500 font-medium">Pass: {totalPass}</span>
                {#if totalFail > 0}
                    <span class="text-red-700 dark:text-red-600 font-medium">Fail: {totalFail}</span>
                {/if}
            </div>
            <span class="text-muted-foreground font-medium">{passRate}% Pass Rate</span>
        </div>
    {/if}
</div>

<style>
    @keyframes cardEnter {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    .card-enter {
        animation: cardEnter 0.28s ease both;
    }

    @keyframes footerEnter {
        from { opacity: 0; transform: translateY(5px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    .footer-enter {
        animation: footerEnter 0.3s ease both;
    }
</style>
