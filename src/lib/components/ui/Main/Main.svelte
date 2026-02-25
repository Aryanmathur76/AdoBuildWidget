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
    import { env } from "$env/dynamic/public";
    import type { PipelineConfig } from "$lib/utils/buildQualityUtils.js";
    import { ptaOpen } from "$lib/stores/ptaStore";
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
    let currentTab = $state(
        typeof window !== 'undefined'
            ? localStorage.getItem('buildHealthCurrentTab') || "Monthly"
            : "Monthly"
    );
    let heatmapViewMode = $state<"simple" | "graph">(
        typeof window !== 'undefined'
            ? (localStorage.getItem('buildHealthViewMode') as "simple" | "graph") || "simple"
            : "simple"
    );
    let helpDialogOpen = $state(false);
    let todayQuality = $state<string>("unknown");
    let mobileMenuOpen = $state(false);
    let carouselApi = $state<CarouselAPI>();
    let isClearingCache = $state(false);
    const count = 5; // Hardcoded for 5 carousel items
    let current = $state(0);
    let visibleSlides = $state<number[]>([0, 1, 2]); // Default to first 3

    // Track PTA panel open state from the shared store
    let ptaIsOpen = $state(false);
    $effect(() => {
        const unsub = ptaOpen.subscribe(v => { ptaIsOpen = v; });
        return unsub;
    });

    $effect(() => {
        const slidesVisible = ptaIsOpen ? 2 : 3;
        if (carouselApi) {
            current = carouselApi.selectedScrollSnap() + 1;
            visibleSlides = Array.from({ length: slidesVisible }, (_, i) => (current - 1) + i).filter(i => i >= 0 && i < count);
            carouselApi.on("select", () => {
                current = carouselApi!.selectedScrollSnap() + 1;
                visibleSlides = Array.from({ length: ptaIsOpen ? 2 : 3 }, (_, i) => (current - 1) + i).filter(i => i >= 0 && i < count);
            });
        }
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

<div class="w-full h-screen max-h-screen overflow-hidden" transition:slide={{ duration: 300 }}>
    <Toaster position="top-center" richColors />
    <Card class="py-0 border-0 shadow-none h-full rounded-none flex flex-col bg-background">
        {#if isMobile}
        <!-- Mobile: Tabs Interface with Sidebar -->
        <div class="h-full">
            <Sidebar.Provider>
                <Sidebar.Inset class="h-full">
                    <Tabs.Root bind:value={currentTab} class="h-full flex flex-col">
                    <!-- Collapsible header - shows arrow handle, expands on click/hover -->
                    <div class="relative">
                        <!-- Small arrow handle always visible -->
                        <button type="button" onclick={() => mobileMenuOpen = !mobileMenuOpen} class="flex justify-center cursor-pointer bg-background/30 hover:bg-transparent transition-colors w-full" aria-label="Toggle menu">
                            <span class="material-symbols-outlined text-muted-foreground hover:opacity-0 transition-opacity" style="font-size: 1.25em;" aria-hidden="true">expand_more</span>
                        </button>
                        <!-- Full header - hidden by default, shown on click or hover -->
                        <div class="absolute top-0 left-0 right-0 transition-all duration-200 ease-out bg-gradient-to-b from-background/95 to-background/80 backdrop-blur-sm z-50 shadow-lg" style={`opacity: ${mobileMenuOpen ? 1 : 0}; pointer-events: ${mobileMenuOpen ? 'auto' : 'none'}; transform: translateY(${mobileMenuOpen ? 0 : '-100%'});`}>
                            <div class="flex items-center justify-between px-3 pt-2 pb-1.5">
                                <div class="flex items-center gap-3">
                                    <span class="text-primary font-bold tracking-widest uppercase text-xs">▶ DELTAV BUILD HEALTH</span>
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
                                <div class="flex items-center gap-2">
                                    <button onclick={() => heatmapViewMode = heatmapViewMode === "graph" ? "simple" : "graph"} class="flex items-center gap-1 px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors uppercase tracking-wide" aria-label="Toggle view mode">
                                        <span class="material-symbols-outlined" style="font-size: 1em;">
                                            {#if heatmapViewMode === "graph"}bar_chart{:else}view_day{/if}
                                        </span>
                                    </button>
                                    <button onclick={() => helpDialogOpen = true} class="flex items-center gap-1 px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors uppercase tracking-wide" title="Get help about this widget" aria-label="Help">
                                        <span class="material-symbols-outlined" style="font-size: 1em;">help</span>
                                    </button>
                                    <Sidebar.Trigger class="flex items-center gap-2">
                                        <span class="material-symbols-outlined" style="font-size: 1.25em; line-height: 1;">settings</span>
                                    </Sidebar.Trigger>
                                </div>
                            </div>
                        </div>
                    </div>
                    {#if mobileMenuOpen}
                        <div class="absolute inset-0 z-40" role="presentation" onclick={() => mobileMenuOpen = false}></div>
                    {/if}
                    <main class="flex-1 min-h-0 overflow-hidden">
                        <Tabs.Content value="Monthly" class="h-full overflow-auto">
                            <MonthlyHeatmapView viewMode={heatmapViewMode} onTodayQualityChange={(q) => todayQuality = q} isMainView={true} />
                        </Tabs.Content>
                        <Tabs.Content value="Weekly" class="h-full overflow-auto">
                            <WeeklyView viewMode={heatmapViewMode} />
                        </Tabs.Content>
                        <Tabs.Content value="Analytics" class="h-full overflow-auto">
                            <PipelineAnalytics />
                        </Tabs.Content>
                        <Tabs.Content value="TestResults" class="h-full overflow-auto p-1">
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
                                        <Sidebar.MenuButton onclick={() => { currentTab = "Monthly"; sidebar?.toggle(); }} class={currentTab === "Monthly" ? "bg-accent" : ""}>
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">view_module</span>
                                            <span>Daily Tests - Monthly</span>
                                        </Sidebar.MenuButton>
                                    </Sidebar.MenuItem>
                                    <Sidebar.MenuItem>
                                        <Sidebar.MenuButton onclick={() => { currentTab = "Weekly"; sidebar?.toggle(); }} class={currentTab === "Weekly" ? "bg-accent" : ""}>
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">view_week</span>
                                            <span>Daily Tests - Weekly</span>
                                        </Sidebar.MenuButton>
                                    </Sidebar.MenuItem>
                                    <Sidebar.MenuItem>
                                        <Sidebar.MenuButton onclick={() => { currentTab = "Analytics"; sidebar?.toggle(); }} class={currentTab === "Analytics" ? "bg-accent" : ""}>
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">bar_chart</span>
                                            <span>Daily Pipeline Analytics</span>
                                        </Sidebar.MenuButton>
                                    </Sidebar.MenuItem>
                                    <Sidebar.MenuItem>
                                        <Sidebar.MenuButton onclick={() => { currentTab = "TestResults"; sidebar?.toggle(); }} class={currentTab === "TestResults" ? "bg-accent" : ""}>
                                            <span class="material-symbols-outlined" style="font-size: 1.5em;">calendar_month</span>
                                            <span>Monthly Test Run Analysis</span>
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
                <div class="flex items-center gap-3">
                    <span class="text-primary font-bold tracking-widest uppercase text-xs">▶ DELTAV BUILD HEALTH</span>
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
                {#if carouselApi && count > 0}
                    <span class="absolute left-1/2 -translate-x-1/2 text-xs text-muted-foreground tracking-widest pointer-events-none">
                        [{current}/{count}]
                    </span>
                {/if}
                <div class="flex items-center gap-2">
                    <button onclick={() => heatmapViewMode = heatmapViewMode === "graph" ? "simple" : "graph"} class="flex items-center gap-1 px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors uppercase tracking-wide" aria-label="Toggle view mode">
                        <span class="material-symbols-outlined" style="font-size: 1em;">{#if heatmapViewMode === "graph"}bar_chart{:else}view_day{/if}</span>
                        <span>{heatmapViewMode === "graph" ? "[GRAPH]" : "[SIMPLE]"}</span>
                    </button>
                    <button onclick={() => helpDialogOpen = true} class="flex items-center gap-1 px-2 py-0.5 text-xs border border-border hover:bg-accent hover:text-accent-foreground transition-colors uppercase tracking-wide" title="Get help" aria-label="Help">
                        <span class="material-symbols-outlined" style="font-size: 1em;">help</span>
                        <span>[HELP]</span>
                    </button>
                </div>
            </div>
            <div class="h-full flex-1 min-h-0 px-2 pb-2">
                <Carousel.Root opts={{ align: "start", slidesToScroll: 1 }} class="h-full flex flex-col" setApi={(api) => carouselApi = api}>
                    <Carousel.Content class="h-full flex-1 min-h-0 -ml-2">
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
                    <Carousel.Previous class="-left-3" />
                    <Carousel.Next class="-right-3" />
                </Carousel.Root>
            </div>
        </div>
        {/if}
    </Card>
</div>

<HelpDialog bind:open={helpDialogOpen} isMobile={isSmallView} />

<style>
</style>
