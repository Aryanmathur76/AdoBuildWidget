<script lang="ts">
    import { slide } from "svelte/transition";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import * as Sidebar from "$lib/components/ui/sidebar/index.js";
    import { useSidebar } from "$lib/components/ui/sidebar/context.svelte.js";
    import { Card, CardContent } from "$lib/components/ui/card/index.js";
    import * as Popover from "$lib/components/ui/popover/index.js";
    import CardTitle from "../card/card-title.svelte";
    import HelpDialog from "../HelpDialog/HelpDialog.svelte";
    import MonthlyHeatmapView from "../MonthlyHeatmapView/MonthlyHeatmapView.svelte";
    import WeeklyView from "../WeeklyView/WeeklyView.svelte";
    import { PipelineAnalytics } from "../PipelineAnalytics/index.js";
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
                isDesktop = window.innerWidth >= 1024;
                isMobile = window.innerWidth < 640;
                isSmallView = window.innerWidth < 1024;
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
    <Sidebar.Provider>
        <Sidebar.Inset class="h-full max-h-full">
            <Card class={`py-0 border-0 shadow-none h-full rounded-none overflow-hidden flex flex-col bg-gradient-to-b ${gradientColor} to-background`}>
                <!-- Mobile: Tabs Interface -->
                <Tabs.Root bind:value={currentTab} class="h-full flex flex-col lg:hidden">
                    <div class="flex items-center justify-between px-4 pt-4 pb-2 bg-transparent rounded-lg">
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
                    <div class="flex-1 min-h-0 overflow-hidden">
                        <Tabs.Content value="Monthly" class="h-full overflow-auto">
                            <MonthlyHeatmapView viewMode={heatmapViewMode} onTodayQualityChange={(q) => todayQuality = q} />
                        </Tabs.Content>
                        <Tabs.Content value="Weekly" class="h-full overflow-auto">
                            <WeeklyView viewMode={heatmapViewMode} />
                        </Tabs.Content>
                        <Tabs.Content value="Analytics" class="h-full overflow-auto">
                            <PipelineAnalytics />
                        </Tabs.Content>
                    </div>
                </Tabs.Root>

                <!-- Desktop: 3-Column Layout -->
                <div class="hidden lg:flex flex-col h-full overflow-hidden">
                    <div class="flex items-center px-4 pt-4 pb-2 bg-transparent rounded-lg">
                        <CardTitle>
                            <span class="inline-flex text-base font-bold py-1 items-center gap-1">
                                <span class="material-symbols-outlined" style="font-size: 1.75em; line-height: 1;">health_metrics</span>
                                <span>DELTAV BUILD HEALTH</span>
                            </span>
                        </CardTitle>
                        <Popover.Root>
                            <Popover.Trigger class="hover:opacity-80 transition-opacity flex items-center gap-1 mx-2 px-2 py-1 rounded border border-input/50 bg-background/20 hover:bg-accent/20 cursor-help">
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
                        <div class="ml-auto flex items-center gap-2">
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
                    <div class="flex-1 min-h-0 px-4 pb-4">
                        <div class="grid grid-cols-1 xl:grid-cols-3 grid-rows-[minmax(0,1fr)] gap-4 h-full">
                            <Card class="flex flex-col h-full bg-background/70 backdrop-blur-sm">
                                <CardContent class="flex-1 min-h-0 p-4 pt-0 flex flex-col overflow-auto">
                                    <MonthlyHeatmapView viewMode={heatmapViewMode} onTodayQualityChange={(q) => todayQuality = q} />
                                </CardContent>
                            </Card>
                            <Card class="flex flex-col h-full bg-background/70 backdrop-blur-sm">
                                <CardContent class="flex-1 min-h-0 p-4 pt-0 flex flex-col overflow-auto">
                                    <WeeklyView viewMode={heatmapViewMode} />
                                </CardContent>
                            </Card>
                            <Card class="flex flex-col h-full bg-background/70 backdrop-blur-sm">
                                <CardContent class="flex-1 min-h-0 p-4 pt-0 flex flex-col overflow-auto">
                                    <PipelineAnalytics />
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

<HelpDialog bind:open={helpDialogOpen} isMobile={isSmallView} />

<style>
</style>
