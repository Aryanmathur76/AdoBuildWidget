<script lang="ts">
    import { onMount } from 'svelte';
    import { Badge } from '$lib/components/ui/badge/index.js';

    interface SprintTestResult {
        sprintName: string;
        sprintPath: string;
        startDate: string;
        finishDate: string;
        releaseId: number | null;
        releaseName: string | null;
        totalTests: number;
        passedTests: number;
        failedTests: number;
        notExecutedTests: number;
        status: string;
    }

    interface PipelineResults {
        pipelineName: string;
        pipelineId: number;
        sprints: SprintTestResult[];
    }

    let pipelines = $state<PipelineResults[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let organization = $state<string>('');
    let project = $state<string>('');
    let expandedPipelines = $state<Set<number>>(new Set());

    onMount(async () => {
        try {
            const response = await fetch('/api/sprint-test-results');
            if (!response.ok) {
                throw new Error('Failed to fetch sprint test results');
            }
            const data = await response.json();
            pipelines = data.pipelines || [];
            organization = data.organization || '';
            project = data.project || '';
            // Expand first pipeline by default
            if (pipelines.length > 0) {
                expandedPipelines.add(pipelines[0].pipelineId);
            }
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    });

    function togglePipeline(pipelineId: number) {
        const newSet = new Set(expandedPipelines);
        if (newSet.has(pipelineId)) {
            newSet.delete(pipelineId);
        } else {
            newSet.add(pipelineId);
        }
        expandedPipelines = newSet;
    }

    function formatDate(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function getPassRate(passed: number, total: number): number {
        if (total === 0) return 0;
        return Math.round((passed / total) * 100);
    }

    function getStatusColor(status: string, passRate: number): string {
        if (status === 'not run') return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        if (passRate >= 90) return 'bg-green-500/20 text-green-400 border-green-500/30';
        if (passRate >= 70) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        return 'bg-red-500/20 text-red-400 border-red-500/30';
    }

    function getReleaseUrl(releaseId: number): string {
        return `https://dev.azure.com/${organization}/${project}/_releaseProgress?releaseId=${releaseId}&_a=release-pipeline-progress`;
    }
</script>

<div class="flex flex-col h-full pt-1">
    <div class="flex items-center gap-2 mb-4">
        <span class="text-xs font-bold uppercase tracking-widest text-primary font-mono">▶ Sprint Test Results</span>
        <Badge class="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs ml-auto">
            Beta
        </Badge>
    </div>

    {#if loading}
        <div class="flex-1 flex items-center justify-center text-muted-foreground">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined animate-spin" style="font-size: 3em;">progress_activity</span>
                <p class="text-sm">Loading sprint results...</p>
            </div>
        </div>
    {:else if error}
        <div class="flex-1 flex items-center justify-center text-destructive">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined" style="font-size: 3em;">error</span>
                <p class="text-sm">{error}</p>
            </div>
        </div>
    {:else if pipelines.length === 0}
        <div class="flex-1 flex items-center justify-center text-muted-foreground">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined" style="font-size: 3em;">inbox</span>
                <p class="text-sm">No sprint data found</p>
            </div>
        </div>
    {:else}
        <div class="flex-1 overflow-auto space-y-4">
            {#each pipelines as pipeline}
                {@const isExpanded = expandedPipelines.has(pipeline.pipelineId)}
                <div class="space-y-2">
                    <button 
                        onclick={() => togglePipeline(pipeline.pipelineId)}
                        class="w-full flex items-center gap-2 px-2 py-2 border-b border-border/40 hover:bg-muted/30 transition-colors rounded-t"
                    >
                        <span class="material-symbols-outlined text-muted-foreground transition-transform" style="font-size: 1.25em; transform: rotate({isExpanded ? 90 : 0}deg);">
                            chevron_right
                        </span>
                        <h4 class="text-sm font-semibold text-primary flex-1 text-left">{pipeline.pipelineName}</h4>
                        <Badge variant="outline" class="text-xs">{pipeline.sprints.length} sprints</Badge>
                    </button>
                    {#if isExpanded}
                        {#each pipeline.sprints as sprint}
                        {@const passRate = getPassRate(sprint.passedTests, sprint.totalTests)}
                        {@const hasRun = sprint.releaseId !== null}
                        <div class="border border-border/40 rounded-lg p-3 bg-background/30 hover:bg-background/50 transition-colors">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-primary" style="font-size: 1.25em;">
                                {hasRun ? 'check_circle' : 'schedule'}
                            </span>
                            <div>
                                <div class="font-semibold text-sm">{sprint.sprintName}</div>
                                <div class="text-xs text-muted-foreground">
                                    {formatDate(sprint.startDate)} - {formatDate(sprint.finishDate)}
                                </div>
                            </div>
                        </div>
                        <Badge class={getStatusColor(sprint.status, passRate)}>
                            {#if hasRun}
                                {passRate}% Pass
                            {:else}
                                Not Run
                            {/if}
                        </Badge>
                    </div>
                    
                    {#if hasRun}
                        <div class="grid grid-cols-4 gap-2 mb-2 text-xs">
                            <div class="text-center p-1.5 bg-background/40 rounded">
                                <div class="text-muted-foreground">Total</div>
                                <div class="font-semibold">{sprint.totalTests.toLocaleString()}</div>
                            </div>
                            <div class="text-center p-1.5 bg-green-500/10 rounded">
                                <div class="text-green-400">Passed</div>
                                <div class="font-semibold text-green-400">{sprint.passedTests.toLocaleString()}</div>
                            </div>
                            <div class="text-center p-1.5 bg-red-500/10 rounded">
                                <div class="text-red-400">Failed</div>
                                <div class="font-semibold text-red-400">{sprint.failedTests.toLocaleString()}</div>
                            </div>
                            <div class="text-center p-1.5 bg-gray-500/10 rounded">
                                <div class="text-gray-400">Skipped</div>
                                <div class="font-semibold text-gray-400">{sprint.notExecutedTests.toLocaleString()}</div>
                            </div>
                        </div>

                        {#if sprint.releaseId}
                            <a href={getReleaseUrl(sprint.releaseId)} target="_blank" rel="noopener noreferrer" class="text-xs p-2 bg-background/20 rounded flex items-center gap-2 hover:bg-background/40 transition-colors no-underline">
                                <span class="material-symbols-outlined text-muted-foreground" style="font-size: 1em;">rocket_launch</span>
                                <span class="flex-1 truncate" title={sprint.releaseName || ''}>{sprint.releaseName}</span>
                                <span class="material-symbols-outlined text-muted-foreground" style="font-size: 1em;">open_in_new</span>
                            </a>
                        {/if}
                    {:else}
                        <div class="text-xs text-muted-foreground text-center py-2">
                            No test run found for this sprint
                        </div>
                    {/if}
                </div>
            {/each}
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
</style>
