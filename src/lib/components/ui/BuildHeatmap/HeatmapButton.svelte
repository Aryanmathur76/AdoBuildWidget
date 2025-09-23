<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import PipelineStatusBadge from "../PipelineStatusBadge/pipelineStatusBadge.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { goto } from "$app/navigation";
  import { env } from "$env/dynamic/public";
  
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
          const response = await fetch(`/api/constructBuild?date=${dayObj.dateStr}&buildDefinitionId=${pipeline.id}`);
          if (response.ok) {
            const data = await response.json();
            // Build API might return array of builds
            if (Array.isArray(data)) {
              data.forEach((build: any, index: number) => {
                results.push({
                  id: `${pipeline.id}-${index}`,
                  name: `${pipeline.displayName || `Build ${pipeline.id}`}${data.length > 1 ? ` #${index + 1}` : ''}`,
                  type: 'build',
                  status: build.status || 'unknown',
                  passCount: build.passedTestCount || 0,
                  failCount: build.failedTestCount || 0
                });
              });
            } else {
              results.push({
                id: pipeline.id,
                name: pipeline.displayName || `Build ${pipeline.id}`,
                type: 'build',
                status: data.status || 'unknown',
                passCount: data.passedTestCount || 0,
                failCount: data.failedTestCount || 0
              });
            }
          } else {
            results.push({
              id: pipeline.id,
              name: pipeline.displayName || `Build ${pipeline.id}`,
              type: 'build',
              status: 'unknown',
              passCount: 0,
              failCount: 0
            });
          }
        } else if (pipeline.type === 'release') {
          const response = await fetch(`/api/constructRelease?date=${dayObj.dateStr}&releaseDefinitionId=${pipeline.id}`);
          if (response.ok) {
            const data = await response.json();
            results.push({
              id: pipeline.id,
              name: pipeline.displayName || `Release ${pipeline.id}`,
              type: 'release',
              status: data.status || 'unknown',
              passCount: data.passedTestCount || 0,
              failCount: data.failedTestCount || 0
            });
          } else {
            results.push({
              id: pipeline.id,
              name: pipeline.displayName || `Release ${pipeline.id}`,
              type: 'release',
              status: 'unknown',
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
      <strong>{dayObj.day}</strong>
    </Popover.Trigger>
    
    <Popover.Content 
      class="w-80 p-4" 
      side="top"
    >
      <div class="space-y-3">
        <div class="border-b pb-2">
          <h4 class="font-semibold text-sm">Build Details - {dayObj.dateStr}</h4>
          <p class="text-xs text-muted-foreground">
            Overall Status: <span class="capitalize font-medium">{dayObj.quality || 'Unknown'}</span>
          </p>
        </div>
        
        {#if loadingPipelines}
          <div class="space-y-2">
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-full" />
          </div>
        {:else if pipelineData.length > 0}
          <div class="space-y-2">
            {#each pipelineData as pipeline (pipeline.id)}
              <div class="flex items-center justify-between py-1">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{pipeline.name}</p>
                  <p class="text-xs text-muted-foreground">
                    {pipeline.type} • Pass: {pipeline.passCount} • Fail: {pipeline.failCount}
                  </p>
                </div>
                <div class="ml-2 flex-shrink-0">
                  <PipelineStatusBadge status={pipeline.status} />
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
          <div class="border-t pt-2">
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
