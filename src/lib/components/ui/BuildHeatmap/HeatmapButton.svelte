<script lang="ts">
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { getPipelineBadgeColor, getTestPassColor, getTestFailColor, getTestNoDataColor } from "$lib/constants/colors.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { goto } from "$app/navigation";
  import { env } from "$env/dynamic/public";
  import { pipelineDataService } from "$lib/stores/pipelineDataService.js";
  
  export let dayObj: any;
  
  let showPopover = false;
  let pipelineData: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    passCount: number;
    failCount: number;
  }> = [];
  let loadingPipelines = false;
  
  // Get pipeline configuration
  let pipelineConfig: any = null;
  try {
    if (env.PUBLIC_AZURE_PIPELINE_CONFIG) {
      pipelineConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
    }
  } catch (e) {
    console.warn("Failed to parse pipeline config:", e);
  }
  
  // Fetch individual pipeline data when popover opens
  async function fetchPipelineData() {
    if (!pipelineConfig?.pipelines || loadingPipelines || pipelineData.length > 0) return;
    
    loadingPipelines = true;
    const results: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      passCount: number;
      failCount: number;
    }> = [];
    
    try {
      for (const pipeline of pipelineConfig.pipelines) {
        if (pipeline.type === 'build') {
          // Use the silent method to avoid console errors for missing data
          const data = await pipelineDataService.fetchBuildDataSilent(dayObj.dateStr, pipeline.id);
          if (data) {
            // Build API might return array of builds
            if (Array.isArray(data)) {
              data.forEach((build: any, index: number) => {
                results.push({
                  id: `${pipeline.id}-${index}`,
                  name: build.name || build.testRunName || pipeline.displayName || `Build ${pipeline.id}`,
                  type: 'build',
                  status: build.status || 'unknown',
                  passCount: build.passedTestCount || 0,
                  failCount: build.failedTestCount || 0
                });
              });
            } else {
              results.push({
                id: pipeline.id,
                name: pipeline.displayName,
                type: 'build',
                status: data.status || 'unknown',
                passCount: data.passedTestCount || 0,
                failCount: data.failedTestCount || 0
              });
            }
          } else {
            // No build data found for this date - show placeholder
            results.push({
              id: pipeline.id,
              name: pipeline.displayName,
              type: 'build',
              status: 'no-data',
              passCount: 0,
              failCount: 0
            });
          }
        } else if (pipeline.type === 'release') {
          // Use the silent method to avoid console errors for missing data
          const data = await pipelineDataService.fetchReleaseDataSilent(dayObj.dateStr, pipeline.id);
          if (data) {
            results.push({
              id: pipeline.id,
              name: pipeline.displayName,
              type: 'release',
              status: data.status || 'unknown',
              passCount: data.passedTestCount || 0,
              failCount: data.failedTestCount || 0
            });
          } else {
            // No release data found for this date - show placeholder
            results.push({
              id: pipeline.id,
              name: pipeline.displayName,
              type: 'release',
              status: 'no-data',
              passCount: 0,
              failCount: 0
            });
          }
        }
      }
    } catch (error) {
      console.error("Error fetching pipeline data:", error);
    }
    
    pipelineData = results;
    loadingPipelines = false;
  }
  
  // Handle popover open
  function handlePopoverOpen() {
    showPopover = true;
    if (dayObj && !dayObj.disabled && dayObj.quality !== 'unknown') {
      fetchPipelineData();
    }
  }
  
  // Reset data when popover closes
  function handlePopoverClose() {
    showPopover = false;
    pipelineData = [];
  }
</script>

{#if dayObj}
  <Popover.Root bind:open={showPopover}>
    <Popover.Trigger 
      class={`w-full h-full min-w-0 min-h-0 cursor-pointer ${dayObj.colorClass} ${dayObj.animationClass}`}
      style="aspect-ratio: 1 / 1; transition: transform 0.2s; position: relative; border: none; padding: 0; display: flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 6px;"
      aria-label={`Go to build ${dayObj.dateStr}`}
      onclick={() => goto(`/build/${dayObj.dateStr}`)}
      onmouseenter={handlePopoverOpen}
      onmouseleave={handlePopoverClose}
      disabled={dayObj.disabled}
    >
      {dayObj.day}
    </Popover.Trigger>
    
    <Popover.Content 
      class="w-80 p-2" 
      side="top"
    >
      <div class="space-y-3">
        {#if loadingPipelines}
          <div class="space-y-2">
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
          </div>
        {:else if pipelineData.length > 0}
          <link
            href="https://fonts.googleapis.com/icon?family=Material+Icons|Material+Icons+Outlined"
            rel="stylesheet"
          />
          <div class="space-y-1">
            {#each pipelineData as pipeline (pipeline.id)}
              <div class="flex items-center justify-between gap-2 py-1">
                <div class="flex-shrink-0">
                  <span class="inline-block text-xs px-2 py-0.5 rounded {getPipelineBadgeColor(pipeline.status)}">
                    {pipeline.name}
                  </span>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <div class="w-40 h-4 bg-zinc-200 rounded overflow-hidden relative">
                    {#if pipeline.passCount + pipeline.failCount > 0}
                      {@const totalTests = pipeline.passCount + pipeline.failCount}
                      {@const passPercentage = (pipeline.passCount / totalTests) * 100}
                      <div class="h-full flex">
                        <div class="{getTestPassColor()}" style="width: {passPercentage}%"></div>
                        <div class="{getTestFailColor()}" style="width: {100 - passPercentage}%"></div>
                      </div>
                      <div class="absolute inset-0 flex items-center justify-center">
                        <span class="text-xs text-white drop-shadow-md">
                          Pass: {pipeline.passCount} Fail: {pipeline.failCount}
                        </span>
                      </div>
                    {:else}
                      <div class="h-full {getTestNoDataColor()} w-full flex items-center justify-center">
                        <span class="text-xs text-white">No Tests</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else if dayObj.disabled}
          <p class="text-sm text-muted-foreground">Future date - no data available</p>
        {:else if dayObj.quality === 'unknown'}
          <p class="text-sm text-muted-foreground">No pipeline data available for this date</p>
        {:else}
          <p class="text-sm text-muted-foreground">No pipeline configuration found</p>
        {/if}
        
        {#if dayObj.totalPassCount !== undefined || dayObj.totalFailCount !== undefined}
          <div class="border-t pt-1">
            <p class="text-xs text-muted-foreground">
              Total Tests: {(dayObj.totalPassCount || 0) + (dayObj.totalFailCount || 0)} 
              (Pass: {dayObj.totalPassCount || 0}, Fail: {dayObj.totalFailCount || 0})
            </p>
          </div>
        {/if}
      </div>
    </Popover.Content>
  </Popover.Root>
{/if}
