<script lang="ts">
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
        weekday: 'long',
        month: 'long',
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
    <div class="flex items-center gap-2 pt-1 pb-1.5 border-b border-border shrink-0">
        <span class="text-xs font-bold uppercase tracking-widest text-primary font-mono">▶ Today's Results</span>
        {#if overallQuality !== 'unknown'}
            <span class="relative inline-flex shrink-0">
                <span class="animate-ping absolute inline-flex w-2 h-2 rounded-full {getBuildStatusColor(overallQuality).split(' ')[0]} opacity-50"></span>
                <span class="relative w-2 h-2 rounded-full inline-block {getBuildStatusColor(overallQuality).split(' ')[0]}"></span>
            </span>
            <span class="text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded {getBuildStatusColor(overallQuality)}">
                {overallQuality.toUpperCase()}
            </span>
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
