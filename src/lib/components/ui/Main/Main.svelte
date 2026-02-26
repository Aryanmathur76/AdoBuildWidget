<script module lang="ts">
    // Persists across SvelteKit client-side navigations but resets on hard refresh
    let bootHasPlayed = false;
</script>

<script lang="ts">
    import { slide } from "svelte/transition";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import * as Sidebar from "$lib/components/ui/sidebar/index.js";
    import { useSidebar } from "$lib/components/ui/sidebar/context.svelte.js";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import * as Carousel from "$lib/components/ui/carousel/index.js";
    import type { CarouselAPI } from "$lib/components/ui/carousel/context.js";
    import HelpDialog from "../HelpDialog/HelpDialog.svelte";
    import MonthlyHeatmapView from "../MonthlyHeatmapView/MonthlyHeatmapView.svelte";
    import WeeklyView from "../WeeklyView/WeeklyView.svelte";
    import { PipelineAnalytics } from "../PipelineAnalytics/index.js";
    import { MonthlyTestResults } from "../MonthlyTestResults/index.js";
    import { WeeklyTestResults } from "../WeeklyTestResults/index.js";
    import { DailyDigest } from "../DailyDigest/index.js";
    import { env } from "$env/dynamic/public";
    import type { PipelineConfig } from "$lib/utils/buildQualityUtils.js";
    import { ptaOpen } from "$lib/stores/ptaStore";
    import { getBuildStatusColor } from "$lib/constants/colors.js";
    import TrashIcon from "@lucide/svelte/icons/trash-2";
    import Loader2 from "@lucide/svelte/icons/loader-2";
    import { toast } from "svelte-sonner";
    import { Toaster } from "$lib/components/ui/sonner";

    // Always use retro terminal theme
    $effect(() => {
        if (typeof window !== 'undefined') {
            document.documentElement.setAttribute('data-theme', 'terminal');
        }
    });

    // State
    const VALID_TABS = ["Today", "Monthly", "Weekly", "Analytics", "TestResults"];
    let currentTab = $state(
        typeof window !== 'undefined'
            ? (() => {
                const urlTab = new URL(window.location.href).searchParams.get('tab');
                if (urlTab && VALID_TABS.includes(urlTab)) return urlTab;
                return localStorage.getItem('buildHealthCurrentTab') || "Monthly";
              })()
            : "Monthly"
    );
    let heatmapViewMode = $state<"simple" | "graph">(
        typeof window !== 'undefined'
            ? (localStorage.getItem('buildHealthViewMode') as "simple" | "graph") || "simple"
            : "simple"
    );
    let helpDialogOpen = $state(false);
    let todayQuality = $state<string>("unknown");
    let carouselApi = $state<CarouselAPI>();
    let isClearingCache = $state(false);
    const count = 6; // Hardcoded for 6 carousel items
    let current = $state(0);
    let visibleSlides = $state<number[]>([0, 1, 2]); // Default to first 3
    let canScrollPrev = $state(false);
    let canScrollNext = $state(true);
    const FLASH_DELAYS = [0, 100, 200, 300, 400].sort(() => Math.random() - 0.5);
    let bootVisible = $state(!bootHasPlayed);
    let appReady = $state(bootHasPlayed);
    let bootPhase = $state<'visible' | 'deleting'>('visible');
    // Animated boot sequence state
    const _bootCfg = (() => {
        try { return env.PUBLIC_AZURE_PIPELINE_CONFIG ? JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG) : null; } catch { return null; }
    })();
    const _bootPipelines: any[] = _bootCfg?.pipelines ?? [];
    const _totalPipelines = _bootPipelines.length;
    const _releaseCount = _bootPipelines.filter((p: any) => p.type === 'release').length;

    const BOOT_LINES = [
        { text: "ESTABLISHING NETWORK INTERFACE",  suffix: "OK"                                                              },
        { text: "CONNECTING TO AZURE DEVOPS",      suffix: "OK"                                                              },
        { text: "AUTHENTICATING SERVICE PRINCIPAL",suffix: "OK"                                                              },
        { text: "FETCHING PIPELINE CONFIGURATION", suffix: _totalPipelines > 0 ? `${_totalPipelines} PIPELINE${_totalPipelines !== 1 ? 'S' : ''}` : "OK" },
        { text: "LOADING BUILD HISTORY [90 DAYS]", suffix: "OK"                                                              },
        { text: "SCANNING RELEASE DEFINITIONS",    suffix: _releaseCount > 0 ? `${_releaseCount} FOUND` : "NONE"            },
        { text: "WARMING BUILD DATA CACHE",        suffix: "HIT"                                                             },
        { text: "SYSTEM READY",                    suffix: ""                                                                },
    ];
    type BootLine = { text: string; suffix: string };
    let bootTypedLines = $state<BootLine[]>([]);
    let bootCurrentText = $state('');
    let bootCurrentSuffix = $state('');
    let matrixCanvas = $state<HTMLCanvasElement | null>(null);

    $effect(() => {
        if (!matrixCanvas || !bootVisible || bootPhase === 'deleting') return;
        const canvas = matrixCanvas;
        const ctx = canvas.getContext('2d')!;

        const resize = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        };
        resize();

        const CHARS = '01ABCDEF░▒▓▪■□◆01234567▄▀';
        const FS = 13;
        let cols = Math.floor(canvas.width / FS);
        let drops = Array.from({ length: cols }, () => -Math.floor(Math.random() * 30));

        let animId: number;
        let last = 0;

        function frame(t: number) {
            animId = requestAnimationFrame(frame);
            if (t - last < 65) return;
            last = t;

            ctx.fillStyle = 'rgba(0,0,0,0.07)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = `${FS}px monospace`;
            const isDark = document.documentElement.classList.contains('dark');
            ctx.fillStyle = isDark ? 'rgba(50,150,255,0.8)' : 'rgba(20,80,200,0.85)';

            for (let i = 0; i < drops.length; i++) {
                if (drops[i] < 0) { drops[i]++; continue; }
                const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
                ctx.fillText(ch, i * FS, drops[i] * FS);
                if (drops[i] * FS > canvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            }
        }

        animId = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(animId);
    });

    // Track PTA panel open state from the shared store.
    // Delay the carousel switch until the panel animation finishes (220ms) so
    // Embla's ResizeObserver and the flex-width transition don't compete.
    // On close, revert immediately so it's done before the panel finishes leaving.
    let ptaIsOpen = $state(false);
    let ptaOpenTimer: ReturnType<typeof setTimeout> | null = null;
    $effect(() => {
        const unsub = ptaOpen.subscribe(v => {
            if (ptaOpenTimer) { clearTimeout(ptaOpenTimer); ptaOpenTimer = null; }
            if (v) {
                ptaOpenTimer = setTimeout(() => { ptaIsOpen = true; }, 230);
            } else {
                ptaIsOpen = false;
            }
        });
        return () => { unsub(); if (ptaOpenTimer) clearTimeout(ptaOpenTimer); };
    });

    $effect(() => {
        const slidesVisible = ptaIsOpen ? 2 : 3;
        if (carouselApi) {
            current = carouselApi.selectedScrollSnap() + 1;
            canScrollPrev = carouselApi.canScrollPrev();
            canScrollNext = carouselApi.canScrollNext();
            visibleSlides = Array.from({ length: slidesVisible }, (_, i) => (current - 1) + i).filter(i => i >= 0 && i < count);
            carouselApi.on("select", () => {
                current = carouselApi!.selectedScrollSnap() + 1;
                canScrollPrev = carouselApi!.canScrollPrev();
                canScrollNext = carouselApi!.canScrollNext();
                visibleSlides = Array.from({ length: ptaIsOpen ? 2 : 3 }, (_, i) => (current - 1) + i).filter(i => i >= 0 && i < count);
            });
        }
    });

    // Boot splash: animated typewriter sequence
    $effect(() => {
        if (typeof window === 'undefined') return;
        if (bootHasPlayed) return;
        let cancelled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const t = (fn: () => void, delay: number) => {
            timers.push(setTimeout(() => { if (!cancelled) fn(); }, delay));
        };

        let delay = 250;
        for (let i = 0; i < BOOT_LINES.length; i++) {
            const line = BOOT_LINES[i];
            const lineIdx = i;
            // Reset current line
            t(() => { bootCurrentText = ''; bootCurrentSuffix = ''; }, delay);
            delay += 30;
            // Type each character
            for (let j = 1; j <= line.text.length; j++) {
                const slice = line.text.slice(0, j);
                t(() => { bootCurrentText = slice; }, delay);
                delay += 8;
            }
            // Show suffix
            delay += 90;
            if (line.suffix) {
                const sfx = line.suffix;
                t(() => { bootCurrentSuffix = sfx; }, delay);
                delay += 180;
            } else {
                delay += 60;
            }
            // Commit to completed lines
            const txt = line.text, sfx = line.suffix;
            t(() => { bootTypedLines = [...bootTypedLines, { text: txt, suffix: sfx }]; bootCurrentText = ''; bootCurrentSuffix = ''; }, delay);
            delay += 40;
        }
        // Sequential delete exit: lines pop off bottom-to-top every 45ms
        t(() => { bootPhase = 'deleting'; }, delay + 350);
        for (let i = BOOT_LINES.length; i >= 0; i--) {
            const len = i;
            t(() => { bootTypedLines = bootTypedLines.slice(0, len); },
              delay + 350 + (BOOT_LINES.length - i) * 45);
        }
        t(() => { bootVisible = false; appReady = true; bootHasPlayed = true; },
          delay + 350 + BOOT_LINES.length * 45 + 100);

        return () => { cancelled = true; timers.forEach(clearTimeout); };
    });

    // Responsive state
    let isDesktop = $state(false);
    let isMobile = $state(false);
    let isSmallView = $state(false);

    // Update responsive state on window resize
    $effect(() => {
        if (typeof window !== 'undefined') {
            const checkScreen = () => {
                const w = window.innerWidth;
                const h = window.innerHeight;
                const aspect = w / h;
                const squareTolerance = 0.15; // adjust tolerance as needed
                const isSquare = Math.abs(aspect - 1) <= squareTolerance;

                // If aspect is close to square, force mobile view
                isMobile = isSquare || w < 640;
                isDesktop = !isMobile && w >= 1024;
                isSmallView = isSquare || w < 1024;
            };
            checkScreen();
            window.addEventListener('resize', checkScreen);
            return () => window.removeEventListener('resize', checkScreen);
        }
    });

    // Get sidebar context
    let sidebar: ReturnType<typeof useSidebar> | undefined = $state();

    $effect(() => {
        if (typeof window !== 'undefined') {
            sidebar = useSidebar();
        }
    });

    // Save tab selection to localStorage and sync to URL when it changes
    $effect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('buildHealthCurrentTab', currentTab);
            history.replaceState({}, '', '?tab=' + encodeURIComponent(currentTab));
        }
    });

    // Keyboard carousel navigation (ArrowLeft / ArrowRight)
    $effect(() => {
        if (typeof window === 'undefined') return;
        function handleCarouselKey(e: KeyboardEvent) {
            if (!isDesktop || !carouselApi) return;
            const el = document.activeElement as HTMLElement | null;
            if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
            if (e.key === 'ArrowLeft')  { e.preventDefault(); carouselApi.scrollPrev(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); carouselApi.scrollNext(); }
        }
        window.addEventListener('keydown', handleCarouselKey);
        return () => window.removeEventListener('keydown', handleCarouselKey);
    });

    // Save view mode to localStorage when it changes
    $effect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('buildHealthViewMode', heatmapViewMode);
        }
    });

    // Get pipeline configuration
    let pipelineConfig: PipelineConfig | null = $state(null);
    try {
        if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
            pipelineConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
        }
    } catch (e) {
        console.warn("Failed to parse pipeline config:", e);
    }

    async function clearCache() {
        isClearingCache = true;
        try {
            const response = await fetch('/api/cache/flush', {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success) {
                toast.loading('Cache cleared successfully - The site is about to refresh...');
                // Refresh page after 2 seconds
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else {
                toast.error(`Failed to clear cache: ${result.error}`);
            }
        } catch (error) {
            toast.error(`Error clearing cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            isClearingCache = false;
        }
    }
</script>

<div class="retro-container w-full h-screen max-h-screen overflow-hidden" transition:slide={{ duration: 300 }}>
    <Toaster position="top-center" richColors />
    {#if bootVisible}
        <div class="fixed inset-0 z-[10000] bg-background flex flex-col items-center justify-center font-mono overflow-hidden"
             style="pointer-events: {bootPhase !== 'visible' ? 'none' : 'all'};">
            <canvas bind:this={matrixCanvas} class="absolute inset-0 w-full h-full opacity-20" aria-hidden="true"></canvas>
            <div class="relative z-10 text-xs tracking-wide w-[380px] max-w-[90vw]">
                <!-- Title -->
                <div class="text-primary font-bold mb-1 text-sm">▶ DELTAV BUILD HEALTH</div>
                <div class="border-t border-border/50 mb-3"></div>
                <!-- Completed lines -->
                {#each bootTypedLines as line}
                    <div class="flex items-baseline justify-between gap-4 leading-5">
                        <span class="text-muted-foreground">{line.text}</span>
                        {#if line.suffix}
                            <span class="text-blue-600 dark:text-blue-400 shrink-0 text-[10px]">[{line.suffix}]</span>
                        {/if}
                    </div>
                {/each}
                <!-- Currently typing line -->
                {#if bootCurrentText !== undefined && bootTypedLines.length < BOOT_LINES.length && bootPhase !== 'deleting'}
                    <div class="flex items-baseline justify-between gap-4 leading-5">
                        <span class="text-foreground">{bootCurrentText}<span class="cursor-blink">_</span></span>
                        {#if bootCurrentSuffix}
                            <span class="text-blue-600 dark:text-blue-400 shrink-0 text-[10px]">[{bootCurrentSuffix}]</span>
                        {/if}
                    </div>
                {/if}
            </div>

        </div>
    {/if}
    <Card class="py-0 border-0 shadow-none h-full rounded-none flex flex-col bg-background">
        {#if isMobile}
        <!-- Mobile: Tabs Interface with Sidebar -->
        <div class="h-full">
            <Sidebar.Provider>
                <Sidebar.Inset class="h-full">
                    <Tabs.Root bind:value={currentTab} class="h-full flex flex-col">
                    <!-- Permanent mini-header -->
                    <div class="flex items-center justify-between py-1 px-3 border-b border-border" style={appReady ? `animation:flash-in 280ms ease-out both;animation-delay:${FLASH_DELAYS[3]}ms` : 'opacity:0'}>
                        <span class="text-primary font-bold tracking-widest uppercase text-xs">▶ DELTAV BUILD HEALTH<span class="cursor-blink">_</span></span>
                        <div class="flex items-center gap-2">
                            <button onclick={() => heatmapViewMode = heatmapViewMode === "graph" ? "simple" : "graph"} class="flex items-center gap-1 px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors" title={heatmapViewMode === "graph" ? "Switch to simple view" : "Switch to graph view"} aria-label="Toggle view mode">
                                <span class="material-symbols-outlined" style="font-size: 1em;">
                                    {#if heatmapViewMode === "graph"}bar_chart{:else}view_day{/if}
                                </span>
                            </button>
                            <button onclick={() => helpDialogOpen = true} class="flex items-center gap-1 px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors" title="Get help about this widget" aria-label="Help">
                                <span class="material-symbols-outlined" style="font-size: 1em;">help</span>
                            </button>
                            <Sidebar.Trigger class="flex items-center gap-1 px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors" title="Open menu">
                                <span class="material-symbols-outlined" style="font-size: 1em; line-height: 1;">settings</span>
                            </Sidebar.Trigger>
                        </div>
                    </div>
                    <main class="flex-1 min-h-0 overflow-hidden" style={appReady ? `animation:flash-in 280ms ease-out both;animation-delay:${FLASH_DELAYS[4]}ms` : 'opacity:0'}>
                        <Tabs.Content value="Today" class="h-full overflow-auto p-2 pt-0">
                            <DailyDigest />
                        </Tabs.Content>
                        <Tabs.Content value="Monthly" class="h-full overflow-auto p-2 pt-0">
                            <MonthlyHeatmapView viewMode={heatmapViewMode} onTodayQualityChange={(q) => todayQuality = q} isMainView={true} />
                        </Tabs.Content>
                        <Tabs.Content value="Weekly" class="h-full overflow-auto p-2 pt-0">
                            <WeeklyView viewMode={heatmapViewMode} />
                        </Tabs.Content>
                        <Tabs.Content value="Analytics" class="h-full overflow-auto p-2 pt-0">
                            <PipelineAnalytics />
                        </Tabs.Content>
                        <Tabs.Content value="TestResults" class="h-full overflow-auto p-2 pt-0">
                            <MonthlyTestResults />
                        </Tabs.Content>
                    </main>
                </Tabs.Root>
                </Sidebar.Inset>
                <Sidebar.Root side="right" collapsible="offcanvas" class="bg-background/80 backdrop-blur-md">
                    <Sidebar.Content>
                        <Sidebar.Group>
                            <Sidebar.GroupLabel>Views</Sidebar.GroupLabel>
                            <Sidebar.GroupContent>
                                <Sidebar.Menu>
                                    <Sidebar.MenuItem>
                                        <Sidebar.MenuButton onclick={() => { currentTab = "Today"; sidebar?.toggle(); }} class={currentTab === "Today" ? "bg-accent border-l-2 border-primary py-3 min-h-[44px]" : "border-l-2 border-transparent py-3 min-h-[44px]"}>
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">today</span>
                                            <span>Daily Digest</span>
                                        </Sidebar.MenuButton>
                                    </Sidebar.MenuItem>
                                    <Sidebar.MenuItem>
                                        <Sidebar.MenuButton onclick={() => { currentTab = "Monthly"; sidebar?.toggle(); }} class={currentTab === "Monthly" ? "bg-accent border-l-2 border-primary py-3 min-h-[44px]" : "border-l-2 border-transparent py-3 min-h-[44px]"}>
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">view_module</span>
                                            <span>Daily Tests - Monthly</span>
                                        </Sidebar.MenuButton>
                                    </Sidebar.MenuItem>
                                    <Sidebar.MenuItem>
                                        <Sidebar.MenuButton onclick={() => { currentTab = "Weekly"; sidebar?.toggle(); }} class={currentTab === "Weekly" ? "bg-accent border-l-2 border-primary py-3 min-h-[44px]" : "border-l-2 border-transparent py-3 min-h-[44px]"}>
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">view_week</span>
                                            <span>Daily Tests - Weekly</span>
                                        </Sidebar.MenuButton>
                                    </Sidebar.MenuItem>
                                    <Sidebar.MenuItem>
                                        <Sidebar.MenuButton onclick={() => { currentTab = "Analytics"; sidebar?.toggle(); }} class={currentTab === "Analytics" ? "bg-accent border-l-2 border-primary py-3 min-h-[44px]" : "border-l-2 border-transparent py-3 min-h-[44px]"}>
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">bar_chart</span>
                                            <span>Daily Pipeline Analytics</span>
                                        </Sidebar.MenuButton>
                                    </Sidebar.MenuItem>
                                    <Sidebar.MenuItem>
                                        <Sidebar.MenuButton onclick={() => { currentTab = "TestResults"; sidebar?.toggle(); }} class={currentTab === "TestResults" ? "bg-accent border-l-2 border-primary py-3 min-h-[44px]" : "border-l-2 border-transparent py-3 min-h-[44px]"}>
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">calendar_month</span>
                                            <span>Monthly Test Run Analysis</span>
                                        </Sidebar.MenuButton>
                                    </Sidebar.MenuItem>
                                </Sidebar.Menu>
                            </Sidebar.GroupContent>
                        </Sidebar.Group>
                        <Sidebar.Group>
                            <Sidebar.GroupLabel>Display</Sidebar.GroupLabel>
                            <Sidebar.GroupContent>
                                <Sidebar.Menu>
                                    <Sidebar.MenuItem>
                                        <Sidebar.MenuButton onclick={() => { heatmapViewMode = heatmapViewMode === "graph" ? "simple" : "graph"; sidebar?.toggle(); }} class="border-l-2 border-transparent py-3 min-h-[44px]">
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">{heatmapViewMode === "graph" ? "bar_chart" : "view_day"}</span>
                                            <span>{heatmapViewMode === "graph" ? "Switch to Simple" : "Switch to Graph"}</span>
                                        </Sidebar.MenuButton>
                                    </Sidebar.MenuItem>
                                </Sidebar.Menu>
                            </Sidebar.GroupContent>
                        </Sidebar.Group>
                    </Sidebar.Content>
                </Sidebar.Root>
            </Sidebar.Provider>
        </div>
        {:else}
        <!-- Desktop: Carousel Layout -->
        <div class="flex flex-col h-full">
            <!-- Retro terminal header -->
            <div class="relative flex items-center justify-between py-1 px-3 border-b border-border bg-card">
                <div class="flex items-center gap-2" style={appReady ? `animation:flash-in 280ms ease-out both;animation-delay:${FLASH_DELAYS[0]}ms` : 'opacity:0'}>
                    <span class="text-primary font-bold tracking-widest uppercase text-xs">▶ DELTAV BUILD HEALTH<span class="cursor-blink">_</span></span>
                    {#if todayQuality !== 'unknown'}
                        <span class="flex items-center gap-1 border-l border-border/50 pl-2 ml-1">
                            <span class="relative inline-flex">
                                <span class="animate-ping absolute inline-flex w-2 h-2 rounded-full {getBuildStatusColor(todayQuality).split(' ')[0]} opacity-50"></span>
                                <span class="relative w-2 h-2 rounded-full inline-block {getBuildStatusColor(todayQuality).split(' ')[0]}"></span>
                            </span>
                            <span class="text-xs text-muted-foreground uppercase tracking-wide">TODAY: {todayQuality.toUpperCase()}</span>
                        </span>
                    {/if}
                </div>
                {#if carouselApi && count > 0}
                    <div class="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                        <button onclick={() => carouselApi?.scrollPrev()} disabled={!canScrollPrev} class="px-1.5 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-mono" aria-label="Previous">◀</button>
                        {#each Array.from({length: count}, (_, i) => i) as i}
                            <button
                                onclick={() => carouselApi?.scrollTo(i)}
                                class="rounded-full transition-all duration-150 {visibleSlides.includes(i) ? 'w-2 h-2 bg-primary' : 'w-1.5 h-1.5 bg-border hover:bg-muted-foreground/50'}"
                                aria-label="Go to slide {i + 1}"
                            ></button>
                        {/each}
                        <button onclick={() => carouselApi?.scrollNext()} disabled={!canScrollNext} class="px-1.5 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-mono" aria-label="Next">▶</button>
                    </div>
                {/if}
                <div class="flex items-center gap-2" style={appReady ? `animation:flash-in 280ms ease-out both;animation-delay:${FLASH_DELAYS[1]}ms` : 'opacity:0'}>
                    <button onclick={() => heatmapViewMode = heatmapViewMode === "graph" ? "simple" : "graph"} class="flex items-center gap-1 px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors" title={heatmapViewMode === "graph" ? "Switch to simple view" : "Switch to graph view"} aria-label="Toggle view mode">
                        <span class="material-symbols-outlined" style="font-size: 14px; line-height: 1;">{#if heatmapViewMode === "graph"}bar_chart{:else}view_day{/if}</span>
                    </button>
                    <button onclick={() => helpDialogOpen = true} class="flex items-center gap-1 px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors" title="Get help" aria-label="Help">
                        <span class="material-symbols-outlined" style="font-size: 14px; line-height: 1;">help</span>
                    </button>
                    <button
                        onclick={clearCache}
                        disabled={isClearingCache}
                        title="Clear cache and refresh"
                        class="flex items-center gap-1 px-1.5 py-0.5 border border-border hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                    >
                        {#if isClearingCache}
                            <Loader2 size={14} class="text-primary animate-spin" />
                        {:else}
                            <TrashIcon size={14} class="text-primary" />
                        {/if}
                    </button>
                </div>
            </div>
            <div class="h-full flex-1 min-h-0 px-2 pt-2 pb-2" style={appReady ? `animation:flash-in 280ms ease-out both;animation-delay:${FLASH_DELAYS[2]}ms` : 'opacity:0'}>
                <Carousel.Root opts={{ align: "start", slidesToScroll: 1 }} class="h-full flex flex-col" setApi={(api) => carouselApi = api}>
                    <Carousel.Content class="h-full flex-1 min-h-0 -ml-2">
                        <Carousel.Item class="h-full pl-2 {ptaIsOpen ? 'basis-1/2' : 'basis-1/3'}">
                            <Card class="h-full bg-card border border-border">
                                <CardContent class="flex-1 min-h-0 p-2 pt-0 flex flex-col overflow-auto h-full">
                                    <DailyDigest />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                        <Carousel.Item class="h-full pl-2 {ptaIsOpen ? 'basis-1/2' : 'basis-1/3'}">
                            <Card class="h-full bg-card border border-border">
                                <CardContent class="flex-1 min-h-0 p-2 pt-0 flex flex-col overflow-auto h-full">
                                    <MonthlyHeatmapView viewMode={heatmapViewMode} onTodayQualityChange={(q) => todayQuality = q} />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                        <Carousel.Item class="h-full pl-2 {ptaIsOpen ? 'basis-1/2' : 'basis-1/3'}">
                            <Card class="h-full bg-card border border-border">
                                <CardContent class="flex-1 min-h-0 p-2 pt-0 flex flex-col overflow-auto h-full">
                                    <WeeklyView viewMode={heatmapViewMode} />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                        <Carousel.Item class="h-full pl-2 {ptaIsOpen ? 'basis-1/2' : 'basis-1/3'}">
                            <Card class="h-full bg-card border border-border">
                                <CardContent class="flex-1 min-h-0 p-2 pt-0 flex flex-col overflow-auto h-full">
                                    <PipelineAnalytics />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                        <Carousel.Item class="h-full pl-2 {ptaIsOpen ? 'basis-1/2' : 'basis-1/3'}">
                            <Card class="h-full bg-card border border-border">
                                <CardContent class="flex-1 min-h-0 p-2 pt-0 flex flex-col overflow-auto h-full">
                                    <MonthlyTestResults />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                        <Carousel.Item class="h-full pl-2 {ptaIsOpen ? 'basis-1/2' : 'basis-1/3'}">
                            <Card class="h-full bg-card border border-border">
                                <CardContent class="flex-1 min-h-0 p-2 pt-0 flex flex-col overflow-auto h-full">
                                    <WeeklyTestResults />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                    </Carousel.Content>
                </Carousel.Root>
            </div>
        </div>
        {/if}
    </Card>
</div>

<HelpDialog bind:open={helpDialogOpen} isMobile={isSmallView} />

<style>
    /* ── Subtle vignette ── */
    .retro-container::after {
        content: '';
        position: fixed;
        inset: 0;
        background: radial-gradient(ellipse at center, transparent 70%, rgba(0, 0, 0, 0.15) 100%);
        pointer-events: none;
        z-index: 9998;
    }

</style>
