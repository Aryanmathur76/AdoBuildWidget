<script lang="ts">
    import { fly } from "svelte/transition";
    import * as Pagination from "$lib/components/ui/pagination/index.js";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import HeatmapButton from "../BuildHeatmap/HeatmapButton.svelte";
    import { 
        getDateString,
        isFutureDay,
        getDatesInMonth,
        getDayOfWeekLabels,
        fetchBuildQualitiesForDates,
        type DayBuildQuality,
        type PipelineConfig,
    } from "$lib/utils/buildQualityUtils.js";
    import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
    import { getBuildStatusColor } from "$lib/constants/colors.js";
    import { env } from "$env/dynamic/public";

    // Props
    interface Props {
        viewMode?: "simple" | "graph";
        onTodayQualityChange?: (quality: string) => void;
        isMainView?: boolean;
    }
    let { viewMode = "simple", onTodayQualityChange, isMainView = false }: Props = $props();

    // Constants
    const today = new Date();
    const currentYear = new Date().getFullYear();
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];
    const months = monthNames.map((name, idx) => {
        const days = new Date(currentYear, idx + 1, 0).getDate();
        return { name, days };
    });

    // State
    let currentMonthPage = $state(today.getMonth() + 1);
    let currentMonth = $derived(currentMonthPage - 1);
    let lastFetchedMonth = $state(-1);
    let tabAnimationKey = $state(0);

    let dayBuildQuality: Record<string, DayBuildQuality> = $state({});
    let bestBuildDay = $state<string | null>(null);
    let analyzingBestBuild = $state(false);
    let bestBuildRationale = $state<string>("");

    // Get pipeline configuration
    let pipelineConfig: PipelineConfig | null = $state(null);
    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch (e) {
        console.warn("Failed to parse pipeline config:", e);
    }

    // Derived values
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

    // Load cached best build on month change
    $effect(() => {
        if (currentMonth !== lastFetchedMonth) {
            lastFetchedMonth = currentMonth;
            tabAnimationKey = Date.now();
            
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
            }
            
            dayBuildQuality = {};
            fetchAllBuildQualitiesForMonth();
        }
    });

    // Notify parent of today's quality for gradient
    $effect(() => {
        const today = new Date();
        const todayStr = getDateString(today.getFullYear(), today.getMonth(), today.getDate());
        const todayQuality = dayBuildQuality[todayStr]?.quality ?? "unknown";
        if (onTodayQualityChange) {
            onTodayQualityChange(todayQuality);
        }
    });

    // Auto-analyze from URL param ?autoAnalyze=true (only on mount)
    let shouldAutoAnalyze = $state(false);
    let hasAutoAnalyzed = $state(false);
    
    // Auto-show today's popover from URL param ?autoShowToday=true (only if this is the main view)
    let shouldAutoShowToday = $state(false);
    let todayDateStr = $state('');
    
    // Initialize URL params only once on mount
    $effect.pre(() => {
        if (typeof window !== "undefined" && !shouldAutoAnalyze && !shouldAutoShowToday && isMainView) {
            const params = new URLSearchParams(window.location.search);
            shouldAutoAnalyze = params.get('autoAnalyze') === 'true';
            shouldAutoShowToday = params.get('autoShowToday') === 'true';
            
            // Set today's date string
            const todayDate = new Date();
            todayDateStr = getDateString(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
            
            console.log('MonthlyHeatmapView init (isMainView=' + isMainView + '):', { shouldAutoShowToday, todayDateStr });
        }
    });
    
    // Trigger auto-analyze when all data is loaded
    $effect(() => {
        if (!shouldAutoAnalyze || hasAutoAnalyzed || analyzingBestBuild) return;
        
        // Count non-future days that should be loaded
        const datesInMonth = getDatesInMonth(currentYear, currentMonth);
        const nonFutureDates = datesInMonth.filter(dateStr => {
            const [y, m, d] = dateStr.split('-').map(Number);
            return !isFutureDay(y, m - 1, d);
        });
        
        const loadedCount = Object.keys(dayBuildQuality).length;
        const expectedCount = nonFutureDates.length;
        
        // Wait until all non-future days are loaded
        if (loadedCount >= expectedCount && expectedCount > 0) {
            hasAutoAnalyzed = true;
            // Add delay to ensure UI settles
            setTimeout(() => {
                analyzeBestBuild();
            }, 2000);
        }
    });

    // Fetch all build qualities for the month
    async function fetchAllBuildQualitiesForMonth() {
        const dateStrings = getDatesInMonth(currentYear, currentMonth).filter(
            (dateStr) => !dayBuildQuality[dateStr],
        );

        if (dateStrings.length > 0) {
            if (typeof window !== "undefined") {
                pipelineDataService.prefetchAllPipelineDataForMonth(
                    dateStrings,
                    pipelineConfig,
                );
            }

            const results = await Promise.allSettled(
                dateStrings.map(async (dateStr) => {
                    const data = await fetchBuildQualitiesForDates([dateStr], pipelineConfig);
                    if (data && data[dateStr]) {
                        // Trigger reactivity by reassigning the object
                        dayBuildQuality = { ...dayBuildQuality, [dateStr]: data[dateStr] };
                    }
                    return { dateStr, data };
                }),
            );
        }
    }

    // Analyze best build using AI
    async function analyzeBestBuild() {
        analyzingBestBuild = true;
        const monthDates = getDatesInMonth(currentYear, currentMonth);

        try {
            const response = await fetch("/api/ai-insights", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    buildData: monthDates
                        .filter((date) => dayBuildQuality[date])
                        .reduce((acc, date) => {
                            acc[date] = dayBuildQuality[date];
                            return acc;
                        }, {} as Record<string, DayBuildQuality>),
                    analysisType: "best-build-month"
                }),
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const result = await response.json();
            const insights = result.insights;

            // Extract date from AI response
            const datePatterns = [
                /\b(\d{4}-\d{2}-\d{2})\b/g,
                /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,
                /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,
                /\b(\d{1,2})(?:st|nd|rd|th)?\b/g
            ];

            let bestDate = null;
            for (const pattern of datePatterns) {
                const matches = insights.match(pattern);
                if (matches) {
                    for (const match of matches) {
                        if (match.includes('-')) {
                            bestDate = match;
                        } else if (match.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i)) {
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
                if (typeof window !== "undefined") {
                    const cacheKey = `buildHeatmap-bestBuild-${currentYear}-${currentMonth}`;
                    localStorage.setItem(cacheKey, JSON.stringify({ bestBuildDay, bestBuildRationale }));
                }
            }
        } catch (error) {
            console.error('Error analyzing best build:', error);
        } finally {
            analyzingBestBuild = false;
        }
    }
</script>

<div class="flex-1 flex flex-col px-4 pb-4 ">
    <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold flex items-center gap-2">
            <span class="material-symbols-outlined" style="font-size: 1.5em;">view_module</span>
            Monthly View
        </h3>
        <button onclick={() => {
            analyzeBestBuild();
        }} disabled={analyzingBestBuild} class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-input/50 bg-background/20 hover:bg-accent/20 hover:text-accent-foreground transition-colors disabled:opacity-50" title="Find the best build day this month">
            <span class="material-symbols-outlined" style="font-size: 1.25em;">{#if analyzingBestBuild}refresh{:else}star{/if}</span>
            <span>{analyzingBestBuild ? 'Analyzing...' : 'Best Build'}</span>
        </button>
    </div>
    <div class="grid grid-cols-7 gap-0.5 mb-1 h-5 items-center">
        {#each dayLabels as label, i (currentMonth + "-" + i + "-" + tabAnimationKey)}
            <div class="text-center text-xs font-medium text-muted-foreground h-full flex items-center justify-center" in:fly={{ y: -15, duration: 250, delay: i * 30 }} out:fly={{ y: 15, duration: 150 }}>{label}</div>
        {/each}
    </div>
    <div class="flex-1 grid grid-cols-7 gap-0.5 mb-2">
        {#each daysInMonth as dayObj, index (currentMonth + "-" + dayObj.day + "-" + tabAnimationKey)}
            <div class="w-full aspect-square min-w-0 min-h-0 relative {bestBuildDay === dayObj.dateStr ? 'border-2 border-green-400 rounded-lg shadow-lg shadow-green-400/50' : ''}" in:fly={{ y: 10, duration: 200, delay: index * 15 }}>
                {#if dayBuildQuality[dayObj.dateStr] || dayObj.disabled}
                    <HeatmapButton {dayObj} delay={index * 50} viewMode={viewMode} autoShowPopover={shouldAutoShowToday && dayObj.dateStr === todayDateStr} />
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
        <div class="mt-3 p-3 bg-muted/50 rounded-md">
            <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-outlined text-primary" style="font-size: 1.25em;">psychology</span>
                <h4 class="text-sm font-medium">AI Analysis</h4>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">{bestBuildRationale}</p>
        </div>
    {/if}
</div>
