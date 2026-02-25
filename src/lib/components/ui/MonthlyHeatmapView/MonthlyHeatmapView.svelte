<script lang="ts">
    import { fly } from "svelte/transition";
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
                totalNotRunCount: buildQuality.totalNotRunCount,
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

            const results = await fetchBuildQualitiesForDates(dateStrings, pipelineConfig);
            dayBuildQuality = { ...dayBuildQuality, ...results };
        }
    }

    // Typewriter state for AI analysis output
    let displayedRationale = $state('');
    let isTyping = $state(false);

    $effect(() => {
        if (!bestBuildRationale) { displayedRationale = ''; return; }
        displayedRationale = '';
        isTyping = true;
        let i = 0;
        const interval = setInterval(() => {
            if (i < bestBuildRationale.length) {
                displayedRationale = bestBuildRationale.slice(0, i + 1);
                i++;
            } else {
                clearInterval(interval);
                isTyping = false;
            }
        }, 8);
        return () => clearInterval(interval);
    });

    // Analyze best build using AI
    async function analyzeBestBuild() {
        analyzingBestBuild = true;
        const monthDates = getDatesInMonth(currentYear, currentMonth);

        try {
            // Build a detailed structure: { [date]: { pipelines: { [pipelineId]: { ran, passCount, failCount, displayName } } } }
            const buildData: Record<string, any> = {};
            for (const date of monthDates) {
                if (!dayBuildQuality[date] || !pipelineConfig?.pipelines) continue;
                buildData[date] = { pipelines: {} };
                for (const pipeline of pipelineConfig.pipelines) {
                    const pipelineId = pipeline.id;
                    let passCount = 0, failCount = 0, ran = false;
                    let displayName = pipeline.displayName || pipelineId;
                    // Match HeatmapButton: check both build and release types
                    if (pipeline.type === "build" || pipeline.type === "build/release") {
                        const buildDataObj = pipelineDataService && pipelineDataService.fetchBuildDataSilent
                            ? await pipelineDataService.fetchBuildDataSilent(date, pipelineId.toString())
                            : null;
                        if (buildDataObj) {
                            if (Array.isArray(buildDataObj)) {
                                for (const build of buildDataObj) {
                                    passCount += build.passedTestCount || 0;
                                    failCount += build.failedTestCount || 0;
                                }
                            } else {
                                passCount += buildDataObj.passedTestCount || 0;
                                failCount += buildDataObj.failedTestCount || 0;
                            }
                        }
                    }
                    if (pipeline.type === "release" || pipeline.type === "build/release") {
                        const releaseDataObj = pipelineDataService && pipelineDataService.fetchReleaseDataSilent
                            ? await pipelineDataService.fetchReleaseDataSilent(date, pipelineId.toString())
                            : null;
                        if (releaseDataObj) {
                            passCount += releaseDataObj.passedTestCount || 0;
                            failCount += releaseDataObj.failedTestCount || 0;
                        }
                    }
                    ran = (passCount + failCount) > 0;
                    buildData[date].pipelines[pipelineId] = {
                        ran,
                        passCount,
                        failCount,
                        displayName
                    };
                }
            }
            const body = JSON.stringify({
                buildData,
                analysisType: "best-build-month"
            });
            console.log("AI Insights request body:", body);

            const response = await fetch("/api/ai-insights", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body
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
            Daily Tests - Monthly
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
    <div class="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-1">
        <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 inline-block bg-[var(--success)]"></span>Good
        </span>
        <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 inline-block bg-[var(--partially-succeeded)]"></span>OK
        </span>
        <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 inline-block bg-[var(--failure)]"></span>Bad
        </span>
        <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 inline-block bg-[var(--in-progress)]"></span>In Progress
        </span>
        <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 inline-block bg-[var(--interrupted)]"></span>Interrupted
        </span>
        <span class="flex items-center gap-1">
            <span class="w-2.5 h-2.5 inline-block bg-muted/60 border border-border/40"></span>No Data
        </span>
    </div>
    <div class="flex items-center justify-center gap-2 mt-2">
        <button
            onclick={() => currentMonthPage > 1 && currentMonthPage--}
            disabled={currentMonthPage <= 1}
            class="px-1.5 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-mono"
            aria-label="Previous month"
        >◀</button>
        <span class="text-xs font-medium tracking-wider min-w-[72px] text-center uppercase">{monthNames[currentMonth].slice(0, 3)} {currentYear}</span>
        <button
            onclick={() => currentMonthPage < months.length && currentMonthPage++}
            disabled={currentMonthPage >= months.length}
            class="px-1.5 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-mono"
            aria-label="Next month"
        >▶</button>
        {#if currentMonthPage !== today.getMonth() + 1}
            <button
                onclick={() => currentMonthPage = today.getMonth() + 1}
                class="px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors uppercase tracking-wide"
            >TODAY</button>
        {/if}
    </div>
    {#if bestBuildRationale}
        <div class="mt-3 p-3 bg-muted/50 rounded-md font-mono">
            <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-outlined text-primary" style="font-size: 1.25em;">psychology</span>
                <h4 class="text-sm font-medium">AI Analysis</h4>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{displayedRationale}{#if isTyping}<span class="cursor-blink">_</span>{/if}</p>
        </div>
    {/if}
</div>
