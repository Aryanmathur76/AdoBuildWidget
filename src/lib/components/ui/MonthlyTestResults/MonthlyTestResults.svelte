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

    interface LoadingProgress {
        stage: string;
        message: string;
        progress: number;
        completed: boolean;
    }

    let data = $state<MonthlyTestData | null>(null);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showConfig = $state(false);
    let expandedFlakyTests = $state<Record<string, boolean>>({});
    let loadingStages = $state<LoadingProgress[]>([]);

    // Configuration - presets
    let planId = $state('1310927');
    let suiteId = $state('1310934');
    let preset = $state('PhysCR');

    // Batch and parallelize API calls
    async function fetchData() {
        loading = true;
        error = null;
        data = null;
        loadingStages = [];

        try {
            // Prepare all API calls
            const monthlyUrl = `/api/getMonthlyTestRunDates?planId=${planId}&suiteId=${suiteId}&stream=true`;
            const allTestCasesUrl = `/api/getAllTestCases?testPlanId=${planId}&suiteId=${suiteId}`;
            const testPlanRunsUrl = `/api/test-plan-runs?testPlanId=${planId}&suiteId=${suiteId}`;

            // Start non-streaming fetches in parallel
            const allTestCasesPromise = fetch(allTestCasesUrl).then(r => r.ok ? r.json() : Promise.reject('Failed to fetch test cases'));
            const testPlanRunsPromise = fetch(testPlanRunsUrl).then(r => r.ok ? r.json() : Promise.reject('Failed to fetch plan runs'));

            // Start streaming fetch for main data
            const response = await fetch(monthlyUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch: ${response.status} ${response.statusText} - ${errorText}`);
            }
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error('Response body is not readable');
            let buffer = '';

            // Await parallel fetches
            const [allTestCases, testPlanRuns] = await Promise.all([allTestCasesPromise, testPlanRunsPromise]);

            // Process streaming response
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim() || !line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6);
                    try {
                        const message = JSON.parse(jsonStr);
                        if (message.type === 'progress') {
                            const existingIndex = loadingStages.findIndex(s => s.stage === message.stage);
                            if (existingIndex >= 0) {
                                loadingStages[existingIndex] = {
                                    stage: message.stage,
                                    message: message.message,
                                    progress: message.progress || 0,
                                    completed: message.completed || false
                                };
                            } else {
                                loadingStages.push({
                                    stage: message.stage,
                                    message: message.message,
                                    progress: message.progress || 0,
                                    completed: message.completed || false
                                });
                            }
                        } else if (message.type === 'complete') {
                            // Attach additional API data if needed
                            data = {
                                ...message.data,
                                allTestCases,
                                testPlanRuns
                            };
                        } else if (message.type === 'error') {
                            throw new Error(message.error);
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE message:', line, e);
                    }
                }
            }
        } catch (e: any) {
            error = e.message || String(e);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        fetchData();
    });


    // Import utility functions
    import { formatDate, getPassRateColor, getBufferBadgeColor } from '$lib/utils/testUtils';

</script>

<div class="h-full p-4 lg:p-0 lg:pb-0 flex flex-col gap-4">
    <div class="flex items-center justify-between gap-2">
        <h3 class="text-lg font-semibold flex items-center gap-2">
            {#if loading}
                <span class="material-symbols-outlined animate-spin" style="font-size: 1.5em;">progress_activity</span>
            {:else}
                <span class="material-symbols-outlined" style="font-size: 1.5em;">calendar_month</span>
            {/if}
            Monthly Test Run Analysis
        </h3>
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
                    <label for="preset" class="text-xs text-muted-foreground block mb-1">Preset</label>
                    <select id="preset" bind:value={preset} class="w-full px-2 py-1 text-sm bg-background border border-border rounded">
                        <option value="PhysCR">PhysCR (plan: 1310927, suite: 1310934)</option>
                        <option value="VACR">VACR (plan: 1237539, suite: 1309779)</option>
                    </select>
                </div>
                <button 
                    onclick={() => {
                        if (preset === 'PhysCR') { planId = '1310927'; suiteId = '1310934'; }
                        else { planId = '1237539'; suiteId = '1309779'; }
                        fetchData();
                    }}
                    class="w-full px-3 py-2 text-sm font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    Apply Preset & Load
                </button>
            </div>
        </div>
    {/if}

    {#if loading && loadingStages.length > 0}
        <div class="space-y-3">
            {#each loadingStages as stage}
                <div class="bg-muted/30 rounded-lg p-4 border border-border/50">
                    <div class="flex items-start justify-between mb-2">
                        <div class="flex items-center gap-2">
                            {#if stage.completed}
                                <span class="material-symbols-outlined text-green-500 text-sm">check_circle</span>
                            {:else}
                                <span class="material-symbols-outlined animate-spin" style="font-size: 1em;">progress_activity</span>
                            {/if}
                            <span class="text-sm font-medium">{stage.stage}</span>
                        </div>
                        {#if stage.progress > 0}
                            <span class="text-xs text-muted-foreground">{stage.progress}%</span>
                        {/if}
                    </div>
                    <p class="text-xs text-muted-foreground ml-6">{stage.message}</p>
                    {#if stage.progress > 0 && !stage.completed}
                        <div class="mt-2 ml-6 mr-0">
                            <div class="w-full bg-muted rounded-full h-1.5">
                                <div 
                                    class="bg-primary h-1.5 rounded-full transition-all duration-300" 
                                    style="width: {stage.progress}%"
                                ></div>
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {:else if error}
        <div class="flex-1 flex items-center justify-center text-destructive">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined" style="font-size: 3em;">error</span>
                <p class="text-sm">{error}</p>
            </div>
        </div>
    {:else if loading}
        <div class="flex-1 flex items-center justify-center text-muted-foreground">
            <div class="text-center space-y-2">
                <span class="material-symbols-outlined animate-spin" style="font-size: 3em;">progress_activity</span>
                <p class="text-sm">Preparing to load data...</p>
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
                                <Badge class="bg-blue-500/20 text-blue-400 border-blue-500/30">
                                    {run.foundTestCases.length} / {data?.testCaseSummary.expectedCount} cases found
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


                            <!-- Not Found Tests (Expandable) -->
                            {#if run.notFoundTestCases.length > 0}
                                <div class="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded">
                                    <h5 class="font-semibold text-sm mb-2 flex items-center gap-2 text-red-400">
                                        <span class="material-symbols-outlined text-sm">error</span>
                                        Not Found Tests ({run.notFoundTestCases.length})
                                    </h5>
                                    <div class="space-y-1 max-h-40 overflow-y-auto">
                                        {#each (expandedFlakyTests[run.date + '-notfound'] ? run.notFoundTestCases : run.notFoundTestCases.slice(0, 10)) as test}
                                            <div class="text-xs p-2 bg-background/30 rounded">
                                                <span class="text-muted-foreground">#{test.testCaseId}</span> - {test.testCaseName}
                                            </div>
                                        {/each}
                                        {#if run.notFoundTestCases.length > 10 && !expandedFlakyTests[run.date + '-notfound']}
                                            <button 
                                                class="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors cursor-pointer"
                                                onclick={() => expandedFlakyTests[run.date + '-notfound'] = true}
                                            >
                                                ... and {run.notFoundTestCases.length - 10} more (click to expand)
                                            </button>
                                        {/if}
                                        {#if expandedFlakyTests[run.date + '-notfound']}
                                            <button 
                                                class="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors cursor-pointer"
                                                onclick={() => expandedFlakyTests[run.date + '-notfound'] = false}
                                            >
                                                Show less
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/if}

                            <!-- Cases Not in Plan (Expandable) -->
                            {#if run.casesRunThatAreNotInTestPlan.length > 0}
                                <div class="p-3 bg-blue-500/10 border border-blue-500/20 rounded mb-4">
                                    <h5 class="font-semibold text-sm mb-2 flex items-center gap-2 text-blue-400">
                                        <span class="material-symbols-outlined text-sm">info</span>
                                        Tests Not in Plan ({run.casesRunThatAreNotInTestPlan.length})
                                    </h5>
                                    <div class="space-y-1 max-h-40 overflow-y-auto">
                                        {#each (expandedFlakyTests[run.date + '-notinplan'] ? run.casesRunThatAreNotInTestPlan : run.casesRunThatAreNotInTestPlan.slice(0, 10)) as test}
                                            <div class="text-xs p-2 bg-background/30 rounded">
                                                <span class="text-muted-foreground">#{test.testCaseId}</span> - {test.testCaseName}
                                            </div>
                                        {/each}
                                        {#if run.casesRunThatAreNotInTestPlan.length > 10 && !expandedFlakyTests[run.date + '-notinplan']}
                                            <button 
                                                class="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors cursor-pointer"
                                                onclick={() => expandedFlakyTests[run.date + '-notinplan'] = true}
                                            >
                                                ... and {run.casesRunThatAreNotInTestPlan.length - 10} more (click to expand)
                                            </button>
                                        {/if}
                                        {#if expandedFlakyTests[run.date + '-notinplan']}
                                            <button 
                                                class="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors cursor-pointer"
                                                onclick={() => expandedFlakyTests[run.date + '-notinplan'] = false}
                                            >
                                                Show less
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                    </div>
                </details>
            {/each}
        </div>
    {/if}
</div><style>
</style>
