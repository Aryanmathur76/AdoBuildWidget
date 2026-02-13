<script lang="ts">
  import * as Popover from "$lib/components/ui/popover/index.js";
  // import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import {
    getPipelineBadgeColor,
    getTestPassColor,
    getTestFailColor,
    getTestNoDataColor,
    getTestInProgressColor,
    getTestInterruptedColor
  } from "$lib/constants/colors.js";
  import { getTestQuality } from "$lib/constants/thresholds.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { goto } from "$app/navigation";
  import { env } from "$env/dynamic/public";
  import { pipelineDataService } from "$lib/stores/pipelineDataService.js";

  // Helper function to get bar color based on pass rate and status
  function getBarColor(passRate: number, status: string, totalTests: number): string {
    if (status === "inProgress") {
      return getTestInProgressColor(); // Blue for in-progress
    } else if (status === "interrupted") {
      return getTestInterruptedColor(); // Orange for interrupted
    } else if (status === "future" || totalTests === 0) {
      return "bg-gray-400";
    } else if (status === "no-data") {
      return getTestNoDataColor();
    }

    
    const quality = getTestQuality(passRate);
    switch (quality) {
      case 'good':
        return getTestPassColor();
      case 'ok':
        return 'bg-yellow-500'; // Use yellow for ok quality
      case 'bad':
        return getTestFailColor();
      default:
        return getTestNoDataColor();
    }
  }

  let { dayObj, delay = 0, viewMode = "simple", autoShowPopover = false }: { dayObj: any; delay?: number; viewMode?: "simple" | "graph"; autoShowPopover?: boolean } = $props();

  let showPopover = $state(false);
  let hasAutoShown = $state(false);
  
  // Auto-show popover once when prop is true (with delay)
  $effect(() => {
    if (autoShowPopover && !hasAutoShown) {
      hasAutoShown = true;
      setTimeout(() => {
        showPopover = true;
      }, 2500);
    }
  });
  
  let pipelineData = $state<Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    passCount: number;
    failCount: number;
    notRunCount: number;
    testRuns?: Array<{
      testRunName: string;
      passCount: number;
      failCount: number;
      notRunCount: number;
    }>;
  }>>([]);
  let loadingPipelines = $state(false);
  let hoverTimeout: ReturnType<typeof setTimeout> | null = $state(null);

  // Get pipeline configuration
  let pipelineConfig: any = null;
  try {
    if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
      pipelineConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
    }
  } catch (e) {
    console.warn("Failed to parse pipeline config:", e);
  }

  // Fetch individual pipeline data on mount with delay
  $effect(() => {
    if (dayObj && !dayObj.disabled && dayObj.quality !== "unknown") {
      // Stagger loading to prevent overwhelming the API
      setTimeout(() => {
        fetchPipelineData();
      }, delay);
    }
  });

  // Fetch individual pipeline data
  async function fetchPipelineData() {
    if (
      !pipelineConfig?.pipelines ||
      loadingPipelines ||
      pipelineData.length > 0 // Prevent refetching if we already have data
    )
      return;

    loadingPipelines = true;
    
    // Add a timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.warn(`Pipeline data fetch timed out for ${dayObj.dateStr}`);
      loadingPipelines = false;
    }, 10000); // 10 second timeout

    const results: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      passCount: number;
      failCount: number;
      notRunCount: number;
      testRuns?: Array<{
        testRunName: string;
        passCount: number;
        failCount: number;
        notRunCount: number;
      }>;
    }> = [];

    try {
      for (const pipeline of pipelineConfig.pipelines) {
        if (pipeline.type === "build") {
          // Use the silent method to avoid console errors for missing data
          const data = await pipelineDataService.fetchBuildDataSilent(
            dayObj.dateStr,
            pipeline.id,
          );
          if (data) {
            // Build API might return array of builds (test runs)
            if (Array.isArray(data)) {
              const testRuns = data.map((build: any) => ({
                testRunName: build.testRunName || build.name || 'No Test Runs',
                passCount: build.passedTestCount || 0,
                failCount: build.failedTestCount || 0,
                notRunCount: build.notRunTestCount || 0,
              }));
              
              const totalPass = testRuns.reduce((sum, tr) => sum + tr.passCount, 0);
              const totalFail = testRuns.reduce((sum, tr) => sum + tr.failCount, 0);
              const totalNotRun = testRuns.reduce((sum, tr) => sum + tr.notRunCount, 0);
              
              results.push({
                id: pipeline.id,
                name: pipeline.displayName,
                type: "build",
                status: data[0]?.status || "unknown",
                passCount: totalPass,
                failCount: totalFail,
                notRunCount: totalNotRun,
                testRuns: testRuns,
              });
            } else {
              results.push({
                id: pipeline.id,
                name: pipeline.displayName,
                type: "build",
                status: data.status || "unknown",
                passCount: data.passedTestCount || 0,
                failCount: data.failedTestCount || 0,
                notRunCount: data.notRunTestCount || 0,
                testRuns: [{
                  testRunName: data.testRunName || pipeline.displayName,
                  passCount: data.passedTestCount || 0,
                  failCount: data.failedTestCount || 0,
                  notRunCount: data.notRunTestCount || 0,
                }]
              });
            }
          } else {
            // No build data found for this date - show placeholder
            results.push({
              id: pipeline.id,
              name: pipeline.displayName,
              type: "build",
              status: "no-data",
              passCount: 0,
              failCount: 0,
              notRunCount: 0,
            });
          }
        } else if (pipeline.type === "release") {
          // Use the silent method to avoid console errors for missing data
          const data = await pipelineDataService.fetchReleaseDataSilent(
            dayObj.dateStr,
            pipeline.id,
          );
          if (data) {
            results.push({
              id: pipeline.id,
              name: pipeline.displayName,
              type: "release",
              status: data.status || "unknown",
              passCount: data.passedTestCount || 0,
              failCount: data.failedTestCount || 0,
              notRunCount: data.notRunTestCount || 0,
            });
          } else {
            // No release data found for this date - show placeholder
            results.push({
              id: pipeline.id,
              name: pipeline.displayName,
              type: "release",
              status: "no-data",
              passCount: 0,
              failCount: 0,
              notRunCount: 0,
            });
          }
        }
      }
    } catch (error) {
      console.error("Error fetching pipeline data:", error);
    } finally {
      clearTimeout(timeoutId);
    }

    pipelineData = results;
    loadingPipelines = false;
  }

  // Handle popover open with delay
  function handlePopoverOpen() {
    // Clear any existing timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
    
    // Set a timeout to show popover after 300ms
    hoverTimeout = setTimeout(() => {
      showPopover = true;
    }, 300);
  }

  // Reset popover when closes
  function handlePopoverClose() {
    // Clear the timeout if user moves away before 300ms
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    
    showPopover = false;
  }

  // Format date as YYMMDD
  function formatBuildId(dateStr: string): string {
    // Parse YYYY-MM-DD directly to avoid timezone issues
    const [year, month, day] = dateStr.split('-').map(Number);
    const yy = year.toString().slice(-2);
    const mm = month.toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }
</script>

{#if dayObj}
  <Popover.Root bind:open={showPopover}>
    <Popover.Trigger
      class={`w-full h-full min-w-0 min-h-0 cursor-pointer ${dayObj.animationClass} hover:scale-110 hover:shadow-xl hover:z-10`}
      style="aspect-ratio: 1 / 1; transition: all 0.2s ease-in-out; position: relative; border: none; padding: 1px; display: flex; align-items: end; justify-content: space-between; font-weight: bold; border-radius: 12px;"
      aria-label={`Go to build ${dayObj.dateStr}`}
      onclick={() => goto(`/build/${dayObj.dateStr}`)}
      onmouseenter={handlePopoverOpen}
      onmouseleave={handlePopoverClose}
      disabled={dayObj.disabled}
    >
      {#if viewMode === "simple"}
        <div class="flex items-center justify-center w-full h-full {dayObj.colorClass} rounded-sm">
          {#if dayObj.disabled}
            <span class="material-symbols-outlined text-white" style="font-size: 1.25em;">schedule</span>
          {:else}
            <span class="text-xs font-bold">{dayObj.day}</span>
          {/if}
        </div>
      {:else if loadingPipelines}
        <div class="flex flex-col h-full w-full bg-transparent rounded-sm">
          <div class="h-1/4 w-full flex items-center justify-center {dayObj.colorClass} rounded-t-sm">
            <span class="text-xs font-bold drop-shadow-sm">
              {#if dayObj.disabled}
                <span class="material-symbols-outlined" style="font-size: 0.75em;">schedule</span>
              {:else}
                {dayObj.day}
              {/if}
            </span>
          </div>
          <div class="h-3/4 flex items-end justify-between w-full gap-0.5 px-1 pt-1">
            {#each Array(5) as _, i}
              <div class="flex-1 bg-gray-300 animate-pulse rounded-sm" style="height: {20 + Math.random() * 60}%"></div>
            {/each}
          </div>
        </div>
      {:else if pipelineData.length > 0}
        <div class="flex flex-col h-full w-full bg-transparent rounded-sm">
          <div class="h-1/4 w-full flex items-center justify-center {dayObj.colorClass} rounded-t-sm">
            <span class="text-xs font-bold drop-shadow-sm">
              {#if dayObj.disabled}
                <span class="material-symbols-outlined" style="font-size: 0.75em;">schedule</span>
              {:else}
                {dayObj.day}
              {/if}
            </span>
          </div>
          <div class="h-3/4 flex items-end justify-center w-full gap-0.5 px-1 pt-1">
            {#each pipelineData as pipeline (pipeline.id)}
              {@const totalTests = pipeline.passCount + pipeline.failCount + pipeline.notRunCount}
              {@const passRate = totalTests > 0 ? (pipeline.passCount / totalTests) * 100 : 0}
              {@const barHeight = totalTests > 0 ? Math.max(10, (passRate / 100) * 80) : 10}
              {@const barColor = getBarColor(passRate, pipeline.status, totalTests)}
              <div class="flex-1 {barColor} rounded-xs transition-all duration-200 max-w-4" style="height: {barHeight}%; min-width: 3px;"></div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="flex flex-col h-full w-full bg-transparent rounded-sm">
          <div class="h-1/4 w-full flex items-center justify-center {dayObj.colorClass} rounded-t-sm">
            <span class="text-xs font-bold drop-shadow-sm">{dayObj.day}</span>
          </div>
          <div class="h-3/4 flex items-center justify-center w-full">
            <span class="text-xs font-bold">
              {#if dayObj.disabled}
                <span class="material-symbols-outlined" style="font-size: 1em;">schedule</span>
              {:else}
                {dayObj.day}
              {/if}
            </span>
          </div>
        </div>
      {/if}
    </Popover.Trigger>
    <Popover.Content class="w-80 p-2">
      <div class="space-y-3">
        {#if loadingPipelines}
          <div class="space-y-2">
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
          </div>
        {:else if pipelineData.length > 0}
          <div class="space-y-2">
            {#each pipelineData as pipeline (pipeline.id)}
              <div>
                <div class="flex items-center justify-between gap-2 py-1">
                  <div class="flex-shrink-0">
                    <span class="inline-block text-xs px-2 py-0.5 rounded {getPipelineBadgeColor(pipeline.status)}">{pipeline.name}</span>
                  </div>
                  <div class="flex items-center gap-1.5 flex-shrink-0">
                    <div class="w-40 h-4 bg-zinc-200 rounded overflow-hidden relative">
                      {#if pipeline.passCount + pipeline.failCount + pipeline.notRunCount > 0}
                        {@const totalTests = pipeline.passCount + pipeline.failCount + pipeline.notRunCount}
                        {@const rawFailPercentage = (pipeline.failCount / totalTests) * 100}
                        {@const rawNotRunPercentage = (pipeline.notRunCount / totalTests) * 100}
                        {@const minSegmentPercent = 5}
                        {@const adjustedFailPercentage = pipeline.failCount > 0 && rawFailPercentage < minSegmentPercent ? minSegmentPercent : rawFailPercentage}
                        {@const adjustedNotRunPercentage = pipeline.notRunCount > 0 && rawNotRunPercentage < minSegmentPercent ? minSegmentPercent : rawNotRunPercentage}
                        {@const adjustedPassPercentage = Math.max(0, 100 - adjustedFailPercentage - adjustedNotRunPercentage)}
                        <div class="h-full flex">
                        {#if pipeline.status === "inProgress"}
                          <div class={getTestInProgressColor()} style="width: 100%"></div>
                        {:else if pipeline.status === "interrupted"}
                          <div class={getTestInterruptedColor()} style="width: 100%"></div>
                        {:else}
                          <div class={getTestPassColor()} style="width: {adjustedPassPercentage}%"></div>
                          <div class={getTestFailColor()} style="width: {adjustedFailPercentage}%"></div>
                          <div class="bg-gray-400" style="width: {adjustedNotRunPercentage}%"></div>
                        {/if}
                        </div>
                        <div class="absolute inset-0 flex items-center justify-center">
                          <span class="text-xs text-white drop-shadow-md">P:{pipeline.passCount}{#if pipeline.failCount > 0}&nbsp;F:{pipeline.failCount}{/if}{#if pipeline.notRunCount > 0}&nbsp;N:{pipeline.notRunCount}{/if}</span>
                        </div>
                      {:else}
                        <div class="h-full w-full flex items-center justify-center {pipeline.status === 'interrupted' ? getTestInterruptedColor() : pipeline.status === 'inProgress' ? getTestInProgressColor() : 'bg-gray-400'}">
                          {#if pipeline.status === "inProgress"}
                            <span class="text-xs text-white">In Progress</span>
                          {:else if pipeline.status === "interrupted"}
                            <span class="text-xs text-white">Interrupted</span>
                          {:else}
                            <span class="text-xs text-white">No Data</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
                
                <!-- Show test runs for build pipelines -->
                {#if pipeline.type === "build" && pipeline.testRuns && pipeline.testRuns.length > 0}
                  <div class="ml-4 mt-1 space-y-1">
                    {#each pipeline.testRuns as testRun}
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs text-muted-foreground truncate flex-shrink-0 max-w-[80px]">{testRun.testRunName}</span>
                        <div class="w-32 h-4 bg-zinc-200 rounded overflow-hidden relative flex-shrink-0">
                          {#if testRun.passCount + testRun.failCount + testRun.notRunCount > 0}
                            {@const totalTests = testRun.passCount + testRun.failCount + testRun.notRunCount}
                            {@const rawFailPercentage = (testRun.failCount / totalTests) * 100}
                            {@const rawNotRunPercentage = (testRun.notRunCount / totalTests) * 100}
                            {@const minSegmentPercent = 5}
                            {@const adjustedFailPercentage = testRun.failCount > 0 && rawFailPercentage < minSegmentPercent ? minSegmentPercent : rawFailPercentage}
                            {@const adjustedNotRunPercentage = testRun.notRunCount > 0 && rawNotRunPercentage < minSegmentPercent ? minSegmentPercent : rawNotRunPercentage}
                            {@const adjustedPassPercentage = Math.max(0, 100 - adjustedFailPercentage - adjustedNotRunPercentage)}
                            <div class="h-full flex">
                              <div class={getTestPassColor()} style="width: {adjustedPassPercentage}%"></div>
                              <div class={getTestFailColor()} style="width: {adjustedFailPercentage}%"></div>
                              <div class="bg-gray-400" style="width: {adjustedNotRunPercentage}%"></div>
                            </div>
                            <div class="absolute inset-0 flex items-center justify-center">
                              <span class="text-xs text-white drop-shadow-md">P:{testRun.passCount}{#if testRun.failCount > 0}&nbsp;F:{testRun.failCount}{/if}{#if testRun.notRunCount > 0}&nbsp;N:{testRun.notRunCount}{/if}</span>
                            </div>
                          {:else}
                            <div class="h-full w-full bg-gray-400 flex items-center justify-center">
                              <span class="text-xs text-white">No Data</span>
                            </div>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
          {#if dayObj.totalPassCount !== undefined || dayObj.totalFailCount !== undefined}
            <div class="border-t pt-2 flex justify-between items-center">
              <p class="text-xs font-medium text-muted-foreground">Build ID: {formatBuildId(dayObj.dateStr)}</p>
              <p class="text-xs text-muted-foreground">Total: {(dayObj.totalPassCount || 0) + (dayObj.totalFailCount || 0) + (dayObj.totalNotRunCount || 0)} (P: {dayObj.totalPassCount || 0}{#if (dayObj.totalFailCount || 0) > 0}, F: {dayObj.totalFailCount}{/if}{#if (dayObj.totalNotRunCount || 0) > 0}, N: {dayObj.totalNotRunCount}{/if})</p>
            </div>
          {:else}
            <div class="border-t pt-2">
              <p class="text-xs font-medium text-muted-foreground">Build ID: {formatBuildId(dayObj.dateStr)}</p>
            </div>
          {/if}
        {:else if dayObj.disabled}
          <p class="text-sm text-muted-foreground">Future date - no data available</p>
        {:else if dayObj.quality === "unknown"}
          <p class="text-sm text-muted-foreground">No pipeline data available for this date</p>
        {:else}
          <p class="text-sm text-muted-foreground">No pipeline configuration found</p>
        {/if}
      </div>
    </Popover.Content>
  </Popover.Root>
{/if}
