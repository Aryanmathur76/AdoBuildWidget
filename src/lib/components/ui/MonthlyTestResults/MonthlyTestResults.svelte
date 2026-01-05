<script lang="ts">
    import { onMount } from 'svelte';
    import { Badge } from '$lib/components/ui/badge/index.js';

    interface TestRun {
        id: number;
        name: string;
        state: string;
        startedDate: string;
        completedDate: string;
        totalTests: number;
        passedTests: number;
        failedTests: number;
        notExecutedTests: number;
    }

    interface TestRunGroup {
        date: string;
        runs: TestRun[];
        totalTests: number;
        passedTests: number;
        failedTests: number;
        notExecutedTests: number;
    }

    let groups = $state<TestRunGroup[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);

    onMount(async () => {
        try {
            const response = await fetch('/api/test-plan-runs');
            if (!response.ok) {
                throw new Error('Failed to fetch test plan runs');
            }
            const data = await response.json();
            groups = data.groups || [];
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    });

    function formatDate(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatDateRange(runs: TestRun[]): string {
        if (runs.length === 0) return '';
        const dates = runs.map(r => new Date(r.startedDate)).sort((a, b) => a.getTime() - b.getTime());
        const start = dates[0];
        const end = dates[dates.length - 1];
        
        if (start.toDateString() === end.toDateString()) {
            return formatDate(start.toISOString());
        }
        
        return `${formatDate(start.toISOString())} - ${formatDate(end.toISOString())}`;
    }

    function getPassRate(passed: number, total: number): number {
        if (total === 0) return 0;
        return Math.round((passed / total) * 100);
    }

    function getStatusColor(passRate: number): string {
        if (passRate >= 90) return 'bg-green-500/20 text-green-400 border-green-500/30';
        if (passRate >= 70) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        return 'bg-red-500/20 text-red-400 border-red-500/30';
    }

    function isMajorTestRun(group: TestRunGroup): boolean {
        // Consider it a major test run if it has 1000+ total tests
        return group.totalTests >= 1000;
    }
</script>

<div class="flex flex-col h-full">
    <div class="flex items-center gap-2 mb-4">
        <span class="material-symbols-outlined text-primary" style="font-size: 1.5em;">calendar_month</span>
        <h3 class="text-lg font-semibold">Physical CR Test Results</h3>
    </div>

    {#if loading}
        <div class="flex-1 flex items-center justify-center text-muted-foreground">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined animate-spin" style="font-size: 3em;">progress_activity</span>
                <p class="text-sm">Loading test results...</p>
            </div>
        </div>
    {:else if error}
        <div class="flex-1 flex items-center justify-center text-destructive">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined" style="font-size: 3em;">error</span>
                <p class="text-sm">{error}</p>
            </div>
        </div>
    {:else if groups.length === 0}
        <div class="flex-1 flex items-center justify-center text-muted-foreground">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined" style="font-size: 3em;">inbox</span>
                <p class="text-sm">No test runs found</p>
            </div>
        </div>
    {:else}
        <div class="flex-1 overflow-auto space-y-3">
            {#each groups as group}
                {@const passRate = getPassRate(group.passedTests, group.totalTests)}
                {@const isMajor = isMajorTestRun(group)}
                <div class="border rounded-lg p-3 bg-background/30 hover:bg-background/50 transition-colors {isMajor ? 'border-primary/60 shadow-lg shadow-primary/10' : 'border-border/40'}">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            {#if isMajor}
                                <span class="material-symbols-outlined text-primary" style="font-size: 1.5em;">rocket_launch</span>
                            {:else}
                                <span class="material-symbols-outlined text-muted-foreground" style="font-size: 1.25em;">science</span>
                            {/if}
                            <div>
                                <div class="font-semibold text-sm flex items-center gap-2">
                                    {formatDateRange(group.runs)}
                                    {#if isMajor}
                                        <Badge class="bg-primary/20 text-primary border-primary/30 text-xs">
                                            Full Suite
                                        </Badge>
                                    {/if}
                                </div>
                                <div class="text-xs text-muted-foreground">
                                    {group.runs.length} test run{group.runs.length !== 1 ? 's' : ''}
                                </div>
                            </div>
                        </div>
                        <Badge class={getStatusColor(passRate)}>
                            {passRate}% Pass
                        </Badge>
                    </div>
                    
                    <div class="grid grid-cols-4 gap-2 mb-2 text-xs">
                        <div class="text-center p-1.5 bg-background/40 rounded">
                            <div class="text-muted-foreground">Total</div>
                            <div class="font-semibold">{group.totalTests.toLocaleString()}</div>
                        </div>
                        <div class="text-center p-1.5 bg-green-500/10 rounded">
                            <div class="text-green-400">Passed</div>
                            <div class="font-semibold text-green-400">{group.passedTests.toLocaleString()}</div>
                        </div>
                        <div class="text-center p-1.5 bg-red-500/10 rounded">
                            <div class="text-red-400">Failed</div>
                            <div class="font-semibold text-red-400">{group.failedTests.toLocaleString()}</div>
                        </div>
                        <div class="text-center p-1.5 bg-gray-500/10 rounded">
                            <div class="text-gray-400">Skipped</div>
                            <div class="font-semibold text-gray-400">{group.notExecutedTests.toLocaleString()}</div>
                        </div>
                    </div>

                    {#if group.runs.length <= 10}
                        <div class="space-y-1">
                            {#each group.runs as run}
                                <div class="text-xs p-2 bg-background/20 rounded flex items-center gap-2 hover:bg-background/40 transition-colors">
                                    <span class="material-symbols-outlined text-muted-foreground" style="font-size: 1em;">play_circle</span>
                                    <span class="flex-1 truncate" title={run.name}>{run.name}</span>
                                    <span class="text-muted-foreground">{run.passedTests}/{run.totalTests}</span>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <details class="text-xs">
                            <summary class="cursor-pointer p-2 bg-background/20 rounded hover:bg-background/40 transition-colors">
                                View {group.runs.length} test runs
                            </summary>
                            <div class="space-y-1 mt-1">
                                {#each group.runs as run}
                                    <div class="p-2 bg-background/20 rounded flex items-center gap-2 hover:bg-background/40 transition-colors">
                                        <span class="material-symbols-outlined text-muted-foreground" style="font-size: 1em;">play_circle</span>
                                        <span class="flex-1 truncate" title={run.name}>{run.name}</span>
                                        <span class="text-muted-foreground">{run.passedTests}/{run.totalTests}</span>
                                    </div>
                                {/each}
                            </div>
                        </details>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
</style>
