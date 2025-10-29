<script lang="ts">
    import { slide } from "svelte/transition";
    import { fly } from "svelte/transition";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import * as Sidebar from "$lib/components/ui/sidebar/index.js";
    import { useSidebar } from "$lib/components/ui/sidebar/context.svelte.js";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import HeatmapButton from "./HeatmapButton.svelte";
    import WeeklyView from "../WeeklyView/WeeklyView.svelte";
    import { PipelineAnalytics } from "../PipelineAnalytics/index.js";
    import * as Pagination from "$lib/components/ui/pagination/index.js";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import CardTitle from "../card/card-title.svelte";
    import { env } from "$env/dynamic/public";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import {
        getBuildStatusColor,
        getHeaderStatusColor,
    } from "$lib/constants/colors.js";
    import {
        getDateString,
        isFutureDay,
        getDatesInMonth,
        getDayOfWeekLabels,
        fetchBuildQualitiesForDates,
        type DayBuildQuality,
        type PipelineConfig,
    } from "$lib/utils/buildQualityUtils.js";

    // Svelte binding for Pagination.Root (1-based page index)
    const today = new Date();
    let currentMonthPage = $state(today.getMonth() + 1);
    let currentMonth = $derived(currentMonthPage - 1);

    // Track current tab for animations - persist to localStorage
    let currentTab = $state(
        typeof window !== 'undefined' 
            ? localStorage.getItem('buildHealthCurrentTab') || "Monthly"
            : "Monthly"
    );
    let tabAnimationKey = $state(0);

    // Track heatmap view mode - persist to localStorage
    let heatmapViewMode = $state<"simple" | "graph">(
        typeof window !== 'undefined'
            ? (localStorage.getItem('buildHealthViewMode') as "simple" | "graph") || "simple"
            : "simple"
    );

    // Track the best build day for highlighting, with localStorage cache
    let bestBuildDay = $state<string | null>(null);
    let analyzingBestBuild = $state(false);
    let bestBuildRationale = $state<string>("");

    // Load cached best build and weekly trend on mount
    $effect(() => {
        if (typeof window !== "undefined") {
            const cacheKey = `buildHeatmap-bestBuild-${currentYear}-${currentMonth}`;
            const cachedBestBuild = localStorage.getItem(cacheKey);
            if (cachedBestBuild) {
                try {
                    const parsed = JSON.parse(cachedBestBuild);
                    bestBuildDay = parsed.bestBuildDay;
                    bestBuildRationale = parsed.bestBuildRationale;
                } catch {}
            }
        }
    });

    // Fetch all build qualities for the current month only when the month changes
    let lastFetchedMonth = $state(-1);

    // Track if we're on desktop (lg breakpoint = 1024px) and mobile (sm breakpoint = 640px)
    let isDesktop = $state(false);
    let isMobile = $state(false);
    
    // Update isDesktop and isMobile on window resize
    $effect(() => {
        if (typeof window !== 'undefined') {
            const checkScreen = () => {
                isDesktop = window.innerWidth >= 1024;
                isMobile = window.innerWidth < 640;
            };
            checkScreen();
            window.addEventListener('resize', checkScreen);
            return () => window.removeEventListener('resize', checkScreen);
        }
    });

    // Get sidebar context - will be available after Provider is mounted
    let sidebar: ReturnType<typeof useSidebar> | undefined = $state();
    
    // Initialize sidebar context after mount
    $effect(() => {
        if (typeof window !== 'undefined') {
            sidebar = useSidebar();
        }
    });

    // Save tab selection to localStorage when it changes
    $effect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('buildHealthCurrentTab', currentTab);
        }
    });

    // Save view mode to localStorage when it changes
    $effect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('buildHealthViewMode', heatmapViewMode);
        }
    });

    // Trigger animation when switching back to Monthly tab
    $effect(() => {
        if (currentTab === "Monthly") {
            tabAnimationKey = Date.now();
        }
    });

    const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    const currentYear = new Date().getFullYear();
    const months = monthNames.map((name, idx) => {
        // Get days in month: new Date(year, month+1, 0) gives last day of month
        const days = new Date(currentYear, idx + 1, 0).getDate();
        return { name, days };
    });

    // Store build quality for each day (YYYY-MM-DD => quality)
    let dayBuildQuality: Record<string, DayBuildQuality> = $state({});

    // Get pipeline configuration for optional prefetching
    let pipelineConfig: PipelineConfig | null = null;

    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch (e) {
        console.warn("Failed to parse pipeline config for prefetching:", e);
    }

    // Calculate what days of the week each position represents based on the 1st of the month
    let dayLabels = $derived(getDayOfWeekLabels(currentYear, currentMonth));

    let daysInMonth = $derived(
        Array.from({ length: months[currentMonth].days }, (_, dIdx) => {
            const day = dIdx + 1;
            const dateStr = getDateString(currentYear, currentMonth, day);
            const quality = dayBuildQuality[dateStr]?.quality ?? "unknown";
            const colorClass = getBuildStatusColor(quality);

            const buildQuality = dayBuildQuality[dateStr] ?? {};
            return {
                day,
                dateStr,
                quality,
                colorClass,
                animationClass: "",
                disabled: isFutureDay(currentYear, currentMonth, day),
                totalPassCount: buildQuality.totalPassCount,
                totalFailCount: buildQuality.totalFailCount,
                releasesWithTestsRan: buildQuality.releasesWithTestsRan,
            };
        }),
    );

    $effect(() => {
        if (currentMonth !== lastFetchedMonth) {
            lastFetchedMonth = currentMonth;
            // Load cached best build for the new month
            if (typeof window !== "undefined") {
                const cacheKey = `buildHeatmap-bestBuild-${currentYear}-${currentMonth}`;
                const cachedBestBuild = localStorage.getItem(cacheKey);
                if (cachedBestBuild) {
                    try {
                        const parsed = JSON.parse(cachedBestBuild);
                        bestBuildDay = parsed.bestBuildDay;
                        bestBuildRationale = parsed.bestBuildRationale;
                    } catch {
                        bestBuildDay = null;
                        bestBuildRationale = "";
                    }
                } else {
                    bestBuildDay = null;
                    bestBuildRationale = "";
                }
            } else {
                bestBuildDay = null;
                bestBuildRationale = "";
            }
            fetchAllBuildQualitiesForMonth();
        }
    });

    // Parallelize API calls with a concurrency limit
    async function fetchAllBuildQualitiesForMonth() {
        const dateStrings = getDatesInMonth(currentYear, currentMonth).filter(
            (dateStr) => !dayBuildQuality[dateStr],
        );

        if (dateStrings.length > 0) {
            // Prefetch all detailed pipeline data for the month (builds/releases)
            // Only run prefetch in browser (not during SSR)
            if (typeof window !== "undefined") {
                pipelineDataService.prefetchAllPipelineDataForMonth(
                    dateStrings,
                    pipelineConfig,
                );
            }
            
            // Fetch all dates in parallel and update state once per result
            dateStrings.forEach(async (dateStr) => {
                const result = await fetchBuildQualitiesForDates(
                    [dateStr],
                    pipelineConfig,
                );
                if (result && result[dateStr]) {
                    // Direct property assignment is safer than spreading for concurrent updates
                    dayBuildQuality[dateStr] = result[dateStr];
                }
            });
        }
    }

    // Analyze the current month to find the best build day
    async function analyzeBestBuild() {
        analyzingBestBuild = true;
        bestBuildDay = null;

        try {
            // Get all dates in the current month
            const monthDates = getDatesInMonth(currentYear, currentMonth).filter(
                dateStr => !isFutureDay(currentYear, currentMonth, parseInt(dateStr.split('-')[2]))
            );

            // Collect pipeline data for each day in the month
            const buildData = {
                days: await Promise.all(monthDates.map(async (dateStr) => {
                    // Get detailed pipeline data for this day
                    const pipelines: any[] = [];

                    if (pipelineConfig?.pipelines) {
                        for (const pipeline of pipelineConfig.pipelines) {
                            try {
                                if (pipeline.type === "build") {
                                    const buildData = await pipelineDataService.fetchBuildDataSilent(dateStr, String(pipeline.id));
                                    if (buildData) {
                                        if (Array.isArray(buildData)) {
                                            buildData.forEach((build: any) => {
                                                pipelines.push({
                                                    pipelineType: 'build',
                                                    pipelineName: build.name || build.testRunName || pipeline.displayName || `Build ${pipeline.id}`,
                                                    passCount: build.passedTestCount || 0,
                                                    failCount: build.failedTestCount || 0,
                                                    status: build.status || "unknown",
                                                    completedDate: build.completedTime || null,
                                                });
                                            });
                                        } else {
                                            pipelines.push({
                                                pipelineType: 'build',
                                                pipelineName: pipeline.displayName,
                                                passCount: buildData.passedTestCount || 0,
                                                failCount: buildData.failedTestCount || 0,
                                                status: buildData.status || "unknown",
                                                completedDate: buildData.completedTime || null,
                                            });
                                        }
                                    }
                                } else if (pipeline.type === "release") {
                                    const releaseData = await pipelineDataService.fetchReleaseDataSilent(dateStr, String(pipeline.id));
                                    if (releaseData) {
                                        pipelines.push({
                                            pipelineType: 'release',
                                            pipelineName: pipeline.displayName,
                                            passCount: releaseData.passedTestCount || 0,
                                            failCount: releaseData.failedTestCount || 0,
                                            status: releaseData.status || "unknown",
                                            completedDate: releaseData.completedTime || null,
                                        });
                                    }
                                }
                            } catch (error) {
                                console.warn(`Error fetching pipeline data for ${dateStr}:`, error);
                            }
                        }
                    }

                    return {
                        date: dateStr,
                        pipelines,
                        dayQuality: dayBuildQuality[dateStr]
                    };
                }))
            };

            // Send to AI for analysis
            const response = await fetch('/api/ai-insights', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    buildData,
                    analysisType: 'best-build-month'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to analyze best build');
            }

            const result = await response.json();
            const insights = result.insights;

            // Extract the best build date from the AI response
            // Look for patterns like "October 15", "15th", "2025-10-15", etc.
            const datePatterns = [
                /\b(\d{4}-\d{2}-\d{2})\b/g,  // YYYY-MM-DD
                /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,  // Month DD
                /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,  // DD Month
                /\b(\d{1,2})(?:st|nd|rd|th)?\b/g  // Just DD (assume current month)
            ];

            let bestDate = null;
            for (const pattern of datePatterns) {
                const matches = insights.match(pattern);
                if (matches) {
                    for (const match of matches) {
                        // Convert to YYYY-MM-DD format
                        if (match.includes('-')) {
                            // Already YYYY-MM-DD
                            bestDate = match;
                        } else if (match.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i)) {
                            // Month DD format
                            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                            const monthMatch = match.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
                            if (monthMatch) {
                                const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthMatch[1].toLowerCase());
                                const day = parseInt(monthMatch[2]);
                                if (monthIndex === currentMonth) {
                                    bestDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                }
                            }
                        } else if (match.match(/^\d{1,2}$/)) {
                            // Just a day number, assume current month
                            const day = parseInt(match);
                            if (day >= 1 && day <= 31) {
                                bestDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            }
                        }
                        
                        if (bestDate && monthDates.includes(bestDate)) {
                            break;
                        }
                    }
                    if (bestDate) break;
                }
            }

            if (bestDate && monthDates.includes(bestDate)) {
                bestBuildDay = bestDate;
                bestBuildRationale = insights;
                // Cache best build result
                if (typeof window !== "undefined") {
                    const cacheKey = `buildHeatmap-bestBuild-${currentYear}-${currentMonth}`;
                    localStorage.setItem(cacheKey, JSON.stringify({ bestBuildDay, bestBuildRationale }));
                }
                console.log(`Best build identified: ${bestDate}`, insights);
            } else {
                console.warn('Could not identify best build date from AI response:', insights);
            }

        } catch (error) {
            console.error('Error analyzing best build:', error);
        } finally {
            analyzingBestBuild = false;
        }
    }
</script>

<div class="w-full h-screen max-h-screen overflow-hidden" transition:slide={{ duration: 300 }}>
    <Sidebar.Provider>
        <Sidebar.Inset class="h-full max-h-full">
            <Card class="py-0 border-0 shadow-none h-full rounded-none overflow-hidden flex flex-col">
                <Tabs.Root bind:value={currentTab} class="h-full flex flex-col lg:hidden">
                    <div class="flex items-center justify-between px-4 pt-4 pb-2">
                        <CardTitle>
                            <span class="inline-flex text-base font-bold py-1 items-center gap-1">
                                <span class="material-symbols-outlined" style="font-size: 1.75em; line-height: 1;">health_metrics</span>
                                DELTAV BUILD HEALTH
                            </span>
                        </CardTitle>
                        <div class="flex items-center gap-2">
                            <button onclick={() => heatmapViewMode = heatmapViewMode === "graph" ? "simple" : "graph"} class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors" aria-label="Toggle view mode">
                                <span class="material-symbols-outlined" style="font-size: 1.25em;">
                                    {#if heatmapViewMode === "graph"}bar_chart{:else}view_day{/if}
                                </span>
                                {#if !isMobile}<span>{heatmapViewMode === "graph" ? "Graph" : "Simple"}</span>{/if}
                            </button>
                            {#if currentTab === "Monthly"}
                                <button onclick={analyzeBestBuild} disabled={analyzingBestBuild} class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50" title="Find the best build day this month">
                                    <span class="material-symbols-outlined" style="font-size: 1.25em;">{#if analyzingBestBuild}refresh{:else}star{/if}</span>
                                    {#if !isMobile}<span>{analyzingBestBuild ? 'Analyzing...' : 'Best Build'}</span>{/if}
                                </button>
                            {/if}
                            <Sidebar.Trigger class="flex items-center gap-2">
                                <span class="material-symbols-outlined" style="font-size: 1.75em; line-height: 1;">settings</span>
                            </Sidebar.Trigger>
                        </div>
                    </div>
                    <div class="flex-1 min-h-0">
                        <Tabs.Content value="Monthly" class="h-full overflow-hidden">
                            <CardContent class="h-full px-4 pb-2 flex flex-col overflow-auto">
                                <div class="grid grid-cols-7 gap-0.5 mb-1 h-5 items-center">
                                    {#each dayLabels as label, i (currentMonth + "-" + i + "-" + tabAnimationKey)}
                                        <div class="text-center text-xs font-medium text-muted-foreground h-full flex items-center justify-center" in:fly={{ y: -15, duration: 250, delay: i * 30 }} out:fly={{ y: 15, duration: 150 }}>{label}</div>
                                    {/each}
                                </div>
                                <div class="grid grid-cols-7 gap-0.5 mb-2 flex-1">
                                    {#each daysInMonth as dayObj, index (currentMonth + "-" + dayObj.day + "-" + tabAnimationKey)}
                                        <div class="w-full aspect-square min-w-0 min-h-0 relative {bestBuildDay === dayObj.dateStr ? 'border-2 border-green-400 rounded-lg shadow-lg shadow-green-400/50' : ''}" in:fly={{ y: 10, duration: 200, delay: index * 15 }}>
                                            {#if dayBuildQuality[dayObj.dateStr]}
                                                <HeatmapButton {dayObj} delay={index * 50} viewMode={heatmapViewMode} />
                                            {:else if dayObj.disabled}
                                                <HeatmapButton {dayObj} delay={index * 50} viewMode={heatmapViewMode} />
                                            {:else}
                                                <Skeleton class="w-full h-full min-w-0 min-h-0 rounded" style="aspect-ratio: 1 / 1;" />
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                                <div class="flex justify-center">
                                    <Pagination.Root count={months.length} perPage={1} siblingCount={1} bind:page={currentMonthPage}>
                                        {#snippet children({ pages, currentPage })}
                                            <Pagination.Content>
                                                <Pagination.Item><Pagination.PrevButton /></Pagination.Item>
                                                {#each pages as page (page.key)}
                                                    {#if page.type === "ellipsis"}
                                                        <Pagination.Item><Pagination.Ellipsis /></Pagination.Item>
                                                    {:else}
                                                        <Pagination.Item><Pagination.Link {page} isActive={currentPage === page.value}>{monthNames[page.value - 1].slice(0, 3)}</Pagination.Link></Pagination.Item>
                                                    {/if}
                                                {/each}
                                                <Pagination.Item><Pagination.NextButton /></Pagination.Item>
                                            </Pagination.Content>
                                        {/snippet}
                                    </Pagination.Root>
                                </div>
                                {#if bestBuildRationale}
                                    <div class="mt-3 p-3 bg-muted/50 rounded-md border">
                                        <div class="flex items-center gap-2 mb-2">
                                            <span class="material-symbols-outlined text-primary" style="font-size: 1.25em;">psychology</span>
                                            <h4 class="text-sm font-medium">AI Analysis</h4>
                                        </div>
                                        <p class="text-sm text-muted-foreground leading-relaxed">{bestBuildRationale}</p>
                                    </div>
                                {/if}
                            </CardContent>
                        </Tabs.Content>
                        <Tabs.Content value="Weekly" class="h-full overflow-hidden">
                            <WeeklyView viewMode={heatmapViewMode} />
                        </Tabs.Content>
                        <Tabs.Content value="Analytics" class="h-[100dvh] max-h-[100dvh] overflow-auto">
                            <PipelineAnalytics />
                        </Tabs.Content>
                    </div>
                </Tabs.Root>
                <div class="hidden lg:flex flex-col h-full overflow-hidden">
                    <div class="flex items-center px-4 pt-4 pb-2">
                        <CardTitle>
                            <span class="inline-flex text-base font-bold py-1 items-center gap-1">
                                <span class="material-symbols-outlined" style="font-size: 1.75em; line-height: 1;">health_metrics</span>
                                DELTAV BUILD HEALTH
                            </span>
                        </CardTitle>
                        <div class="ml-auto flex items-center gap-2">
                            <button onclick={() => heatmapViewMode = heatmapViewMode === "graph" ? "simple" : "graph"} class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors" aria-label="Toggle view mode">
                                <span class="material-symbols-outlined" style="font-size: 1.25em;">{#if heatmapViewMode === "graph"}bar_chart{:else}view_day{/if}</span>
                                <span>{heatmapViewMode === "graph" ? "Graph" : "Simple"}</span>
                            </button>
                        </div>
                    </div>
                    <div class="flex-1 min-h-0 px-4 pb-4">
                        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 h-full">
                            <Card class="flex flex-col h-full">
                                <CardContent class="h-full p-4 pt-0 flex flex-col overflow-auto">
                                    <div class="flex items-center justify-between mb-3">
                                        <h3 class="text-lg font-semibold flex items-center gap-2">
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">view_module</span>
                                            Monthly View
                                        </h3>
                                        <button onclick={analyzeBestBuild} disabled={analyzingBestBuild} class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50" title="Find the best build day this month">
                                            <span class="material-symbols-outlined" style="font-size: 1.25em;">{#if analyzingBestBuild}refresh{:else}star{/if}</span>
                                            <span>{analyzingBestBuild ? 'Analyzing...' : 'Best Build'}</span>
                                        </button>
                                    </div>
                                    <div class="grid grid-cols-7 gap-0.5 mb-1 h-5 items-center">
                                        {#each dayLabels as label, i}
                                            <div class="text-center text-xs font-medium text-muted-foreground h-full flex items-center justify-center">{label}</div>
                                        {/each}
                                    </div>
                                    <div class="grid grid-cols-7 gap-0.5 mb-2 flex-1">
                                        {#each daysInMonth as dayObj, index (currentMonth + "-" + dayObj.day)}
                                            <div class="w-full aspect-square min-w-0 min-h-0 relative {bestBuildDay === dayObj.dateStr ? 'border-2 border-green-400 rounded-lg shadow-lg shadow-green-400/50' : ''}">
                                                {#if dayBuildQuality[dayObj.dateStr]}
                                                    <HeatmapButton {dayObj} delay={index * 50} viewMode={heatmapViewMode} />
                                                {:else if dayObj.disabled}
                                                    <HeatmapButton {dayObj} delay={index * 50} viewMode={heatmapViewMode} />
                                                {:else}
                                                    <Skeleton class="w-full h-full min-w-0 min-h-0 rounded" style="aspect-ratio: 1 / 1;" />
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                    <div class="flex justify-center">
                                        <Pagination.Root count={months.length} perPage={1} siblingCount={1} bind:page={currentMonthPage}>
                                            {#snippet children({ pages, currentPage })}
                                                <Pagination.Content>
                                                    <Pagination.Item><Pagination.PrevButton /></Pagination.Item>
                                                    {#each pages as page (page.key)}
                                                        {#if page.type === "ellipsis"}
                                                            <Pagination.Item><Pagination.Ellipsis /></Pagination.Item>
                                                        {:else}
                                                            <Pagination.Item><Pagination.Link {page} isActive={currentPage === page.value}>{monthNames[page.value - 1].slice(0, 3)}</Pagination.Link></Pagination.Item>
                                                        {/if}
                                                    {/each}
                                                    <Pagination.Item><Pagination.NextButton /></Pagination.Item>
                                                </Pagination.Content>
                                            {/snippet}
                                        </Pagination.Root>
                                    </div>
                                    {#if bestBuildRationale}
                                        <div class="mt-3 p-3 bg-muted/50 rounded-md border">
                                            <div class="flex items-center gap-2 mb-2">
                                                <span class="material-symbols-outlined text-primary" style="font-size: 1.25em;">psychology</span>
                                                <h4 class="text-sm font-medium">AI Analysis</h4>
                                            </div>
                                            <p class="text-sm text-muted-foreground leading-relaxed">{bestBuildRationale}</p>
                                        </div>
                                    {/if}
                                </CardContent>
                            </Card>
                            <Card class="flex flex-col h-full">
                                <CardContent class="h-full p-4 pt-0 flex flex-col overflow-auto">
                                    <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
                                        <span class="material-symbols-outlined" style="font-size: 1.5em;">view_week</span>
                                        Weekly View
                                    </h3>
                                    <div class="flex-1 min-h-0 overflow-auto">
                                        <WeeklyView viewMode={heatmapViewMode} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card class="flex flex-col h-full">
                                <CardContent class="h-full p-4 pt-0 flex flex-col">
                                    <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
                                        <span class="material-symbols-outlined" style="font-size: 1.5em;">bar_chart</span>
                                        Pipeline Analytics
                                    </h3>
                                    <div class="flex-1 h-full overflow-auto">
                                        <PipelineAnalytics />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </Card>
        </Sidebar.Inset>
        {#if !isDesktop}
            <Sidebar.Root side="right" collapsible="offcanvas">
                <Sidebar.Content>
                    <Sidebar.Group>
                        <Sidebar.GroupLabel>Views</Sidebar.GroupLabel>
                        <Sidebar.GroupContent>
                            <Sidebar.Menu>
                                <Sidebar.MenuItem>
                                    <Sidebar.MenuButton onclick={() => { currentTab = "Monthly"; sidebar?.toggle(); }} class={currentTab === "Monthly" ? "bg-accent" : ""}>
                                        <span class="material-symbols-outlined" style="font-size: 1.5em;">view_module</span>
                                        <span>Monthly View</span>
                                    </Sidebar.MenuButton>
                                </Sidebar.MenuItem>
                                <Sidebar.MenuItem>
                                    <Sidebar.MenuButton onclick={() => { currentTab = "Weekly"; sidebar?.toggle(); }} class={currentTab === "Weekly" ? "bg-accent" : ""}>
                                        <span class="material-symbols-outlined" style="font-size: 1.5em;">view_week</span>
                                        <span>Weekly View</span>
                                    </Sidebar.MenuButton>
                                </Sidebar.MenuItem>
                                <Sidebar.MenuItem>
                                    <Sidebar.MenuButton onclick={() => { currentTab = "Analytics"; sidebar?.toggle(); }} class={currentTab === "Analytics" ? "bg-accent" : ""}>
                                        <span class="material-symbols-outlined" style="font-size: 1.5em;">bar_chart</span>
                                        <span>Pipeline Analytics</span>
                                    </Sidebar.MenuButton>
                                </Sidebar.MenuItem>
                            </Sidebar.Menu>
                        </Sidebar.GroupContent>
                    </Sidebar.Group>
                </Sidebar.Content>
            </Sidebar.Root>
        {/if}
    </Sidebar.Provider>
</div>
