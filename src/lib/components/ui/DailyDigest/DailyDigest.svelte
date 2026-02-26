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

    type CardRow = {
        pipelineName: string;
        pipelineGroup: string | null;
        pipelineType: 'build' | 'release';
        pipelineId: number;
        status: string | null;
        passCount: number | null;
        failCount: number | null;
        notRunCount: number | null;
        completedDate: string | null;
        link: string | null;
    };

    let overallQuality = $state('unknown');
    let isLoading = $state(true);
    let rows = $state<CardRow[]>([]);

    let dotFrame = $state(0);
    $effect(() => {
        if (isLoading || overallQuality === 'inProgress' || overallQuality === 'unknown') {
            const id = setInterval(() => { dotFrame = (dotFrame + 1) % 3; }, 700);
            return () => clearInterval(id);
        }
    });

    let statusLabel = $derived.by(() => {
        if (isLoading || overallQuality === 'inProgress' || overallQuality === 'unknown') {
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
        return 'color: var(--in-progress)'; // loading / unknown
    });

    $effect(() => {
        if (typeof window === 'undefined') return;

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

            const results = await Promise.all(
                pipelineConfig.pipelines.map(async (p): Promise<CardRow[]> => {
                    const id = String(p.id);
                    const name = p.displayName ?? `Pipeline ${id}`;

                    if (p.type === 'release') {
                        const data = await pipelineDataService.fetchReleaseDataSilent(todayStr, id);
                        return [{
                            pipelineName: name,
                            pipelineGroup: null,
                            pipelineType: 'release',
                            pipelineId: Number(p.id),
                            status: data?.status ?? null,
                            passCount: data?.passedTestCount ?? null,
                            failCount: data?.failedTestCount ?? null,
                            notRunCount: data?.notRunTestCount ?? null,
                            completedDate: data?.completedTime ?? null,
                            link: data?.link ?? null,
                        }];
                    } else {
                        // One card per test run, flat — no group header
                        const dataArr = await pipelineDataService.fetchBuildDataSilent(todayStr, id);
                        const arr = Array.isArray(dataArr) && dataArr.length > 0 ? dataArr : [];
                        if (arr.length === 0) {
                            return [{
                                pipelineName: name,
                                pipelineGroup: null,
                                pipelineType: 'build',
                                pipelineId: Number(p.id),
                                status: null,
                                passCount: null,
                                failCount: null,
                                notRunCount: null,
                                completedDate: null,
                                link: null,
                            }];
                        }
                        return arr.map((b: any) => ({
                            pipelineName: b.testRunName || name,
                            pipelineGroup: name,
                            pipelineType: 'build' as const,
                            pipelineId: Number(b.id ?? p.id),
                            status: b.status ?? null,
                            passCount: b.passedTestCount ?? null,
                            failCount: b.failedTestCount ?? null,
                            notRunCount: b.notRunTestCount ?? null,
                            completedDate: b.completedTime ?? null,
                            link: b.link ?? null,
                        }));
                    }
                })
            );

            rows = results.flat();
            isLoading = false;
        }

        load();
    });

    let totalPass = $derived(rows.reduce((s, r) => s + (r.passCount ?? 0), 0));
    let totalFail = $derived(rows.reduce((s, r) => s + (r.failCount ?? 0), 0));
    let passRate = $derived(
        totalPass + totalFail > 0
            ? ((totalPass / (totalPass + totalFail)) * 100).toFixed(2)
            : '0.00'
    );

    const pipelineCount = pipelineConfig?.pipelines?.length ?? 1;

</script>

<div class="flex flex-col h-full">
    <!-- Title + status inline -->
    <div class="flex items-center gap-2 pt-1 pb-1.5 border-b border-border shrink-0 rounded-t">
        <span class="text-xs font-bold uppercase tracking-widest text-primary font-mono inline-flex items-center gap-1.5"><span class="opacity-50">>_</span><span use:typewriter>Today's Results</span></span>
        {#if statusLabel}
            <span class="font-mono text-xs" style={statusColor}>{statusLabel}</span>
        {/if}
        <span class="ml-auto text-xs text-muted-foreground shrink-0">{formattedDate}</span>
    </div>

    <!-- Pipeline cards — scrollable, fills remaining space -->
    <div class="flex flex-col gap-2 py-2 flex-1 min-h-0 overflow-auto">
        {#if isLoading}
            {#each Array.from({ length: pipelineCount }) as _}
                <Skeleton class="h-[72px] w-full rounded-lg" />
            {/each}
        {:else}
            {#each rows as row}
                <BuildCard
                    pipelineName={row.pipelineName}
                    pipelineGroup={row.pipelineGroup}
                    pipelineType={row.pipelineType}
                    pipelineId={row.pipelineId}
                    link={row.link}
                    status={row.status}
                    passCount={row.passCount}
                    failCount={row.failCount}
                    notRunCount={row.notRunCount}
                    completedDate={row.completedDate}
                    date={todayStr}
                />
            {/each}
            {#if rows.length === 0}
                <div class="text-xs text-muted-foreground text-center py-4">No pipelines configured</div>
            {/if}
        {/if}
    </div>

    <!-- Footer — always pinned at bottom -->
    {#if !isLoading && (totalPass > 0 || totalFail > 0)}
        <div class="border-t border-border pt-1.5 pb-1 flex items-center justify-between gap-2 text-xs shrink-0">
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
