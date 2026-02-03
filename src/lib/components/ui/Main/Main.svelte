<script lang="ts">
    import { slide } from "svelte/transition";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import * as Sidebar from "$lib/components/ui/sidebar/index.js";
    import { useSidebar } from "$lib/components/ui/sidebar/context.svelte.js";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import * as Popover from "$lib/components/ui/popover/index.js";
    import * as Carousel from "$lib/components/ui/carousel/index.js";
    import type { CarouselAPI } from "$lib/components/ui/carousel/context.js";
    import CardTitle from "../card/card-title.svelte";
    import HelpDialog from "../HelpDialog/HelpDialog.svelte";
    import MonthlyHeatmapView from "../MonthlyHeatmapView/MonthlyHeatmapView.svelte";
    import WeeklyView from "../WeeklyView/WeeklyView.svelte";
    import { PipelineAnalytics } from "../PipelineAnalytics/index.js";
    import { MonthlyTestResults } from "../MonthlyTestResults/index.js";
    import { WeeklyTestResults } from "../WeeklyTestResults/index.js";
    import { env } from "$env/dynamic/public";
    import type { PipelineConfig } from "$lib/utils/buildQualityUtils.js";
    import { getTestPassColor, getTestFailColor, BUILD_STATUS_COLORS } from "$lib/constants/colors.js";

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
    const count = 5; // Hardcoded for 5 carousel items
    let current = $state(0);
    let visibleSlides = $state<number[]>([0, 1, 2]); // Default to first 3

    $effect(() => {
        if (carouselApi) {
            current = carouselApi.selectedScrollSnap() + 1;
            visibleSlides = Array.from({ length: 3 }, (_, i) => (current - 1) + i).filter(i => i >= 0 && i < count);
            carouselApi.on("select", () => {
                current = carouselApi!.selectedScrollSnap() + 1;
                visibleSlides = Array.from({ length: 3 }, (_, i) => (current - 1) + i).filter(i => i >= 0 && i < count);
            });
        }
    });
    let gradientColor = $derived.by(() => {
        const colors: Record<string, string> = {
            good: "from-lime-600/60",
            ok: "from-yellow-300/60",
            bad: "from-red-800/60",
            inProgress: "from-sky-500/60",
            interrupted: "from-orange-600/60",
            unknown: "from-zinc-700/60"
        };
        return colors[todayQuality] || colors.unknown;
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

    // Save tab selection to localStorage
    $effect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('buildHealthCurrentTab', currentTab);
        }
    });

    // Save view mode to localStorage
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
</script>

<div class="w-full h-screen max-h-screen overflow-hidden" transition:slide={{ duration: 300 }}>
    <Card class={`py-0 border-0 shadow-none h-full rounded-none flex flex-col bg-gradient-to-b ${gradientColor} to-background`}>
        {#if isMobile}
        <!-- Mobile: Tabs Interface with Sidebar -->
        <div class="h-full">
            <Sidebar.Provider>
                <Sidebar.Inset class="h-full">
                    <Tabs.Root bind:value={currentTab} class="h-full flex flex-col">
                    <!-- Collapsible header - shows arrow handle, expands on click/hover -->
                    <div class="relative">
                        <!-- Small arrow handle always visible -->
                        <div onclick={() => mobileMenuOpen = !mobileMenuOpen} class="flex justify-center cursor-pointer bg-background/30 hover:bg-transparent transition-colors">
                            <span class="material-symbols-outlined text-muted-foreground hover:opacity-0 transition-opacity" style="font-size: 1.25em;">expand_more</span>
                        </div>
                        <!-- Full header - hidden by default, shown on click or hover -->
                        <div class="absolute top-0 left-0 right-0 transition-all duration-200 ease-out bg-gradient-to-b from-background/95 to-background/80 backdrop-blur-sm z-50 shadow-lg" style={`opacity: ${mobileMenuOpen ? 1 : 0}; pointer-events: ${mobileMenuOpen ? 'auto' : 'none'}; transform: translateY(${mobileMenuOpen ? 0 : '-100%'});`}>
                            <div class="flex items-center justify-between px-4 pt-3 pb-2">
                                <div class="flex items-center gap-2">
                                    <CardTitle>
                                        <span class="inline-flex text-base font-bold py-1 items-center gap-1">
                                            <span class="material-symbols-outlined" style="font-size: 1.75em; line-height: 1;">health_metrics</span>
                                            <span>DELTAV BUILD HEALTH</span>
                                        </span>
                                    </CardTitle>
                                    <Popover.Root>
                                        <Popover.Trigger class="hover:opacity-80 transition-opacity flex items-center gap-1 px-2 py-1 rounded border border-input/50 bg-background/20 hover:bg-accent/20 cursor-help">
                                            <span class="text-sm font-semibold text-primary">{pipelineConfig?.pipelines.length || 0}</span>
                                            <span class="material-symbols-outlined text-primary" style="font-size: 1.1em;">science</span>
                                        </Popover.Trigger>
                                        <Popover.Content class="w-auto p-3">
                                            <div class="space-y-2">
                                                <h4 class="font-semibold text-sm">Test Pipelines</h4>   
                                                <div class="space-y-1 max-h-64 overflow-y-auto">
                                                    {#each pipelineConfig?.pipelines || [] as pipeline}
                                                        <div class="text-xs flex items-center gap-2 p-1.5 rounded hover:bg-muted/50">
                                                            <span class="material-symbols-outlined text-muted-foreground" style="font-size: 1em;">
                                                                {pipeline.type === 'build' ? 'build' : 'rocket_launch'}
                                                            </span>
                                                            <span class="text-foreground flex-1">{pipeline.displayName}</span>
                                                        </div>
                                                    {/each}
                                                </div>
                                            </div>
                                        </Popover.Content>
                                    </Popover.Root>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button onclick={() => heatmapViewMode = heatmapViewMode === "graph" ? "simple" : "graph"} class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-input/50 bg-background/20 hover:bg-accent/20 hover:text-accent-foreground transition-colors" aria-label="Toggle view mode">
                                        <span class="material-symbols-outlined" style="font-size: 1.25em;">
                                            {#if heatmapViewMode === "graph"}bar_chart{:else}view_day{/if}
                                        </span>
                                        {#if !isMobile}<span>{heatmapViewMode === "graph" ? "Graph" : "Simple"}</span>{/if}
                                    </button>
                                    <button onclick={() => helpDialogOpen = true} class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-input/50 bg-background/20 hover:bg-accent/20 hover:text-accent-foreground transition-colors" title="Get help about this widget" aria-label="Help">
                                        <span class="material-symbols-outlined" style="font-size: 1.25em;">help</span>
                                        {#if !isMobile}<span>Help</span>{/if}
                                    </button>
                                    <Sidebar.Trigger class="flex items-center gap-2">
                                        <span class="material-symbols-outlined" style="font-size: 1.75em; line-height: 1;">settings</span>
                                    </Sidebar.Trigger>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="flex-1 min-h-0 overflow-hidden" onclick={() => mobileMenuOpen = false}>
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
                    </div>
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
        <!-- Desktop: Carousel Layout (No Sidebar) -->
        <div class="flex flex-col h-full">
            <div class="relative flex items-center justify-between p-4 bg-transparent rounded-lg">
                <div class="flex items-center gap-2">
                    <CardTitle>
                        <span class="inline-flex font-bold items-center gap-1">
                            <span class="material-symbols-outlined" style="font-size: 1.75em; line-height: 1;">health_metrics</span>
                            <span>DELTAV BUILD HEALTH</span>
                        </span>
                    </CardTitle>
                    <Popover.Root>
                        <Popover.Trigger class="hover:opacity-80 transition-opacity flex items-center gap-1 px-2 py-1 rounded border border-input/50 bg-background/20 hover:bg-accent/20 cursor-help">
                            <span class="text-sm font-semibold text-primary">{pipelineConfig?.pipelines.length || 0}</span>
                            <span class="material-symbols-outlined text-primary" style="font-size: 1.1em;">science</span>
                        </Popover.Trigger>
                        <Popover.Content class="w-auto p-3">
                            <div class="space-y-2">
                                <h4 class="font-semibold text-sm">Test Pipelines</h4>
                                <div class="space-y-1 max-h-64 overflow-y-auto">
                                    {#each pipelineConfig?.pipelines || [] as pipeline}
                                        <div class="text-xs flex items-center gap-2 p-1.5 rounded hover:bg-muted/50">
                                            <span class="material-symbols-outlined text-muted-foreground" style="font-size: 1em;">
                                                {pipeline.type === 'build' ? 'build' : 'rocket_launch'}
                                            </span>
                                            <span class="text-foreground flex-1">{pipeline.displayName}</span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </Popover.Content>
                    </Popover.Root>
                </div>
                {#if carouselApi && count > 0}
                    <div class="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-3 pointer-events-none">
                        {#each Array(count) as _, i (i)}
                            <span class="inline-block w-3 h-3 border border-primary rounded-full transition-all duration-200 pointer-events-auto"
                                style="background:{visibleSlides.includes(i) ? 'var(--color-primary)' : 'var(--color-border)'}; opacity:{visibleSlides.includes(i) ? 1 : 0.4};">
                            </span>
                        {/each}
                    </div>
                {/if}
                <div class="flex items-center gap-2">
                    <button onclick={() => heatmapViewMode = heatmapViewMode === "graph" ? "simple" : "graph"} class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-input/50 bg-background/20 hover:bg-accent/20 hover:text-accent-foreground transition-colors" aria-label="Toggle view mode">
                        <span class="material-symbols-outlined" style="font-size: 1.25em;">{#if heatmapViewMode === "graph"}bar_chart{:else}view_day{/if}</span>
                        <span>{heatmapViewMode === "graph" ? "Graph" : "Simple"}</span>
                    </button>
                    <button onclick={() => helpDialogOpen = true} class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-input/50 bg-background/20 hover:bg-accent/20 hover:text-accent-foreground transition-colors" title="Get help about this widget" aria-label="Help">
                        <span class="material-symbols-outlined" style="font-size: 1.25em;">help</span>
                        <span>Help</span>
                    </button>
                </div>
            </div>
            <div class="h-full flex-1 min-h-0 px-4 pb-4">
                <Carousel.Root opts={{ align: "start", slidesToScroll: 1 }} class="h-full flex flex-col" setApi={(api) => carouselApi = api}>
                    <Carousel.Content class="h-full flex-1 min-h-0 -ml-4">
                        <Carousel.Item class="h-full pl-4 basis-1/3">
                            <Card class="h-full bg-background/70 backdrop-blur-sm">
                                <CardContent class="flex-1 min-h-0 p-4 pt-0 flex flex-col overflow-auto h-full">
                                    <MonthlyHeatmapView viewMode={heatmapViewMode} onTodayQualityChange={(q) => todayQuality = q} />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                        <Carousel.Item class="h-full pl-4 basis-1/3">
                            <Card class="h-full bg-background/70 backdrop-blur-sm">
                                <CardContent class="flex-1 min-h-0 p-4 pt-0 flex flex-col overflow-auto h-full">
                                    <WeeklyView viewMode={heatmapViewMode} />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                        <Carousel.Item class="h-full pl-4 basis-1/3">
                            <Card class="h-full bg-background/70 backdrop-blur-sm">
                                <CardContent class="flex-1 min-h-0 p-4 pt-0 flex flex-col overflow-auto h-full">
                                    <PipelineAnalytics />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                        <Carousel.Item class="h-full pl-4 basis-1/3">
                            <Card class="h-full bg-background/70 backdrop-blur-sm">
                                <CardContent class="flex-1 min-h-0 p-4 pt-0 flex flex-col overflow-auto h-full">
                                    <MonthlyTestResults />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                        <Carousel.Item class="h-full pl-4 basis-1/3">
                            <Card class="h-full bg-background/70 backdrop-blur-sm">
                                <CardContent class="flex-1 min-h-0 p-4 pt-0 flex flex-col overflow-auto h-full">
                                    <WeeklyTestResults />
                                </CardContent>
                            </Card>
                        </Carousel.Item>
                    </Carousel.Content>
                    <Carousel.Previous class="-left-4" />
                    <Carousel.Next class="-right-4" />
                </Carousel.Root>
            </div>
        </div>
        {/if}
    </Card>
</div>

<HelpDialog bind:open={helpDialogOpen} isMobile={isSmallView} />

<style>
</style>
