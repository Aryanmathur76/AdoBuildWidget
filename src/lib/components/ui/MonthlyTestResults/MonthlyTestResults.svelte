<script lang="ts">
    import { onMount } from 'svelte';
    import { Badge } from '$lib/components/ui/badge/index.js';

    interface TestCase {
        testCaseId: number;
        testCaseName: string;
    }

    interface FlakyTest {
        testCaseId: number;
        testCaseName: string;
        executionCount: number;
    }

    interface MonthlyRun {
        date: string;
        testCaseCount: number;
        bufferUsed: number;
        foundTestCases: TestCase[];
        notFoundTestCases: TestCase[];
        casesRunThatAreNotInTestPlan: TestCase[];
        flakyTests: FlakyTest[];
        flakyTestCount: number;
        passRates: {
            initialPassRate: number;
            finalPassRate: number;
            initialPassedCount: number;
            finalPassedCount: number;
            totalTestsFound: number;
        };
        runBoundaries: {
            startDate: string | null;
            endDate: string | null;
            durationDays: number | null;
        };
    }

    interface MonthlyTestData {
        planId: number;
        suiteId: number;
        totalRuns: number;
        minRoc: number;
        overallBoundaries: {
            startDate: string | null;
            endDate: string | null;
            durationDays: number | null;
        };
        testCaseSummary: {
            expectedCount: number;
            executedCount: number;
            neverExecutedCount: number;
            expectedTestCaseIds: number[];
            executedTestCaseIds: number[];
            neverExecutedTestCaseIds: number[];
        };
        monthlyRuns: MonthlyRun[];
    }

    let data = $state<MonthlyTestData | null>(null);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showConfig = $state(false);
    let expandedFlakyTests = $state<Record<string, boolean>>({});

    // Configuration - hardcoded defaults
    let planId = $state('1310927');
    let suiteId = $state('1310934');
    let minRoc = $state(800);

    async function fetchData() {
        loading = true;
        error = null;
        data = null;
        try {
            const url = `/api/getMonthlyTestRunDates?planId=${planId}&suiteId=${suiteId}&minRoc=${minRoc}`;
            console.log('Fetching from:', url);
            const response = await fetch(url);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', errorText);
                throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
            }
            const result = await response.json();
            console.log('API Response:', result);
            console.log('testCaseSummary:', result.testCaseSummary);
            console.log('overallBoundaries:', result.overallBoundaries);
            console.log('monthlyRuns count:', result.monthlyRuns?.length);
            data = result;
        } catch (e: any) {
            console.error('Fetch error:', e);
            error = e.message;
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        fetchData();
    });

    function formatDate(dateString: string | null): string {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function getPassRateColor(passRate: number): string {
        if (passRate >= 95) return 'bg-green-500/20 text-green-400 border-green-500/30';
        if (passRate >= 90) return 'bg-lime-500/20 text-lime-400 border-lime-500/30';
        if (passRate >= 80) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        if (passRate >= 70) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
        return 'bg-red-500/20 text-red-400 border-red-500/30';
    }

    function getBufferBadgeColor(bufferDays: number): string {
        if (bufferDays === 0) return 'bg-green-500/20 text-green-400 border-green-500/30';
        if (bufferDays <= 2) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    }

</script>

<div class="flex flex-col h-full p-4">
    <div class="flex items-center justify-between gap-2 mb-4">
        <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary" style="font-size: 1.5em;">calendar_month</span>
            <h3 class="text-lg font-semibold">Monthly Test Run Analysis</h3>
        </div>
        <button 
            onclick={() => showConfig = !showConfig}
            class="px-2 py-1 text-xs rounded border border-border/50 hover:bg-accent/20 transition-colors"
        >
            {showConfig ? 'Hide' : 'Show'} Config
        </button>
    </div>

    {#if showConfig}
        <div class="mb-4 p-3 bg-muted/30 rounded border border-border/50">
            <div class="font-semibold mb-3 text-sm">Configuration:</div>
            <div class="space-y-3">
                <div>
                    <label for="planId" class="text-xs text-muted-foreground block mb-1">Test Plan ID</label>
                    <input 
                        id="planId"
                        type="text" 
                        bind:value={planId}
                        class="w-full px-2 py-1 text-sm bg-background border border-border rounded"
                        placeholder="Enter Plan ID"
                    />
                </div>
                <div>
                    <label for="suiteId" class="text-xs text-muted-foreground block mb-1">Test Suite ID</label>
                    <input 
                        id="suiteId"
                        type="text" 
                        bind:value={suiteId}
                        class="w-full px-2 py-1 text-sm bg-background border border-border rounded"
                        placeholder="Enter Suite ID"
                    />
                </div>
                <div>
                    <label for="minRoc" class="text-xs text-muted-foreground block mb-1">Min Rate of Change</label>
                    <input 
                        id="minRoc"
                        type="number" 
                        bind:value={minRoc}
                        class="w-full px-2 py-1 text-sm bg-background border border-border rounded"
                        placeholder="Enter Min ROC"
                    />
                </div>
                <button 
                    onclick={fetchData}
                    class="w-full px-3 py-2 text-sm font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    Load Data
                </button>
            </div>
        </div>
    {/if}

    {#if loading}
        <div class="flex-1 flex items-center justify-center text-muted-foreground">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined animate-spin" style="font-size: 3em;">progress_activity</span>
                <p class="text-sm">Loading test analysis...</p>
            </div>
        </div>
    {:else if error}
        <div class="flex-1 flex items-center justify-center text-destructive">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined" style="font-size: 3em;">error</span>
                <p class="text-sm">{error}</p>
            </div>
        </div>
    {:else if !data}
        <div class="flex-1 flex items-center justify-center text-muted-foreground">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined" style="font-size: 3em;">inbox</span>
                <p class="text-sm">No data available</p>
            </div>
        </div>
    {:else}
        <!-- Monthly Runs -->
        <div class="flex-1 overflow-auto space-y-3">
            {#each (data?.monthlyRuns || []) as run, index}
                {@const passRateImprovement = run.passRates.finalPassRate - run.passRates.initialPassRate}
                <details class="border rounded-lg bg-background/30 overflow-hidden">
                    <summary class="px-4 py-3 hover:bg-background/50 cursor-pointer list-none">
                        <div class="flex items-center justify-between w-full">
                            <div class="flex items-center gap-3">
                                <span class="material-symbols-outlined text-primary">rocket_launch</span>
                                <div class="text-left">
                                    <div class="font-semibold">Run #{index + 1} - {formatDate(run.date)}</div>
                                    <div class="text-xs text-muted-foreground">
                                        {run.runBoundaries.startDate && run.runBoundaries.endDate 
                                            ? `${formatDate(run.runBoundaries.startDate)} - ${formatDate(run.runBoundaries.endDate)} (${run.runBoundaries.durationDays} days)`
                                            : 'No execution data'}
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <Badge class={getPassRateColor(run.passRates.finalPassRate)}>
                                    {run.passRates.finalPassRate.toFixed(1)}%
                                </Badge>
                                <Badge class={getBufferBadgeColor(run.bufferUsed)}>
                                    Buffer: {run.bufferUsed}d
                                </Badge>
                            </div>
                        </div>
                    </summary>
                    <div class="px-4 pb-4">
                            <!-- Pass Rate Details -->
                            <div class="mb-4 p-3 bg-background/20 rounded">
                                <h5 class="font-semibold text-sm mb-2 flex items-center gap-2">
                                    <span class="material-symbols-outlined text-sm">done_all</span>
                                    Pass Rates
                                </h5>
                                <div class="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <div class="text-muted-foreground text-xs">Initial Pass Rate</div>
                                        <div class="font-semibold text-lg">{run.passRates.initialPassRate.toFixed(1)}%</div>
                                        <div class="text-xs text-muted-foreground">{run.passRates.initialPassedCount}/{run.passRates.totalTestsFound} passed first time</div>
                                    </div>
                                    <div>
                                        <div class="text-muted-foreground text-xs">Final Pass Rate</div>
                                        <div class="font-semibold text-lg">{run.passRates.finalPassRate.toFixed(1)}%</div>
                                        <div class="text-xs text-muted-foreground">{run.passRates.finalPassedCount}/{run.passRates.totalTestsFound} passed eventually</div>
                                    </div>
                                </div>
                                {#if passRateImprovement > 0}
                                    <div class="mt-2 p-2 bg-muted/20 rounded border border-border/50">
                                        <div class="text-xs text-muted-foreground flex items-center gap-1">
                                            <span class="material-symbols-outlined" style="font-size: 1em;">info</span>
                                            <span>+{passRateImprovement.toFixed(1)}% improvement from retries</span>
                                        </div>
                                    </div>
                                {/if}
                            </div>

                            <!-- Test Coverage -->
                            <div class="mb-4 p-3 bg-background/20 rounded">
                                <h5 class="font-semibold text-sm mb-2 flex items-center gap-2">
                                    <span class="material-symbols-outlined text-sm">fact_check</span>
                                    Test Coverage
                                </h5>
                                <div class="grid grid-cols-3 gap-2 text-xs">
                                    <div class="p-2 bg-green-500/10 rounded text-center">
                                        <div class="text-green-400">Found</div>
                                        <div class="font-semibold text-lg text-green-400">{run.testCaseCount}</div>
                                    </div>
                                    <div class="p-2 bg-red-500/10 rounded text-center">
                                        <div class="text-red-400">Not Found</div>
                                        <div class="font-semibold text-lg text-red-400">{run.notFoundTestCases.length}</div>
                                    </div>
                                    <div class="p-2 bg-blue-500/10 rounded text-center">
                                        <div class="text-blue-400">Not in Plan</div>
                                        <div class="font-semibold text-lg text-blue-400">{run.casesRunThatAreNotInTestPlan.length}</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Flaky Tests -->
                            {#if run.flakyTestCount > 0}
                                <div class="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded">
                                    <h5 class="font-semibold text-sm mb-2 flex items-center gap-2 text-orange-400">
                                        <span class="material-symbols-outlined text-sm">warning</span>
                                        Flaky Tests ({run.flakyTestCount})
                                    </h5>
                                    <div class="space-y-1 max-h-40 overflow-y-auto">
                                        {#each (expandedFlakyTests[run.date] ? run.flakyTests : run.flakyTests.slice(0, 10)) as flaky}
                                            <div class="text-xs p-2 bg-background/30 rounded flex items-center justify-between">
                                                <span class="truncate flex-1" title={flaky.testCaseName}>
                                                    <span class="text-muted-foreground">#{flaky.testCaseId}</span> - {flaky.testCaseName}
                                                </span>
                                                <Badge class="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs ml-2">
                                                    {flaky.executionCount}x
                                                </Badge>
                                            </div>
                                        {/each}
                                        {#if run.flakyTests.length > 10 && !expandedFlakyTests[run.date]}
                                            <button 
                                                class="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors cursor-pointer"
                                                onclick={() => expandedFlakyTests[run.date] = true}
                                            >
                                                ... and {run.flakyTests.length - 10} more (click to expand)
                                            </button>
                                        {/if}
                                        {#if expandedFlakyTests[run.date]}
                                            <button 
                                                class="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors cursor-pointer"
                                                onclick={() => expandedFlakyTests[run.date] = false}
                                            >
                                                Show less
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/if}

                            <!-- Not Found Tests -->
                            {#if run.notFoundTestCases.length > 0}
                                <details class="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded">
                                    <summary class="font-semibold text-sm mb-2 cursor-pointer flex items-center gap-2 text-red-400">
                                        <span class="material-symbols-outlined text-sm">error</span>
                                        Not Found Tests ({run.notFoundTestCases.length})
                                    </summary>
                                    <div class="space-y-1 max-h-40 overflow-y-auto mt-2">
                                        {#each run.notFoundTestCases as test}
                                            <div class="text-xs p-2 bg-background/30 rounded">
                                                <span class="text-muted-foreground">#{test.testCaseId}</span> - {test.testCaseName}
                                            </div>
                                        {/each}
                                    </div>
                                </details>
                            {/if}

                            <!-- Cases Not in Plan -->
                            {#if run.casesRunThatAreNotInTestPlan.length > 0}
                                <details class="p-3 bg-blue-500/10 border border-blue-500/20 rounded">
                                    <summary class="font-semibold text-sm mb-2 cursor-pointer flex items-center gap-2 text-blue-400">
                                        <span class="material-symbols-outlined text-sm">info</span>
                                        Tests Not in Plan ({run.casesRunThatAreNotInTestPlan.length})
                                    </summary>
                                    <div class="space-y-1 max-h-40 overflow-y-auto mt-2">
                                        {#each run.casesRunThatAreNotInTestPlan as test}
                                            <div class="text-xs p-2 bg-background/30 rounded">
                                                <span class="text-muted-foreground">#{test.testCaseId}</span> - {test.testCaseName}
                                            </div>
                                        {/each}
                                    </div>
                                </details>
                            {/if}
                    </div>
                </details>
            {/each}
        </div>
    {/if}
</div><style>
</style>
