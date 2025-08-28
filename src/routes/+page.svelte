
<script lang="ts">
import CalendarIcon from "@lucide/svelte/icons/calendar";
import {
    DateFormatter,
    type DateValue,
    getLocalTimeZone
} from "@internationalized/date";
import { cn } from "$lib/utils.js";
import { buttonVariants } from "$lib/components/ui/button/index.js";
import { Calendar } from "$lib/components/ui/calendar/index.js";
import * as Popover from "$lib/components/ui/popover/index.js";
import * as Card from "$lib/components/ui/card/index.js";
import BuildCard from "$lib/components/ui/BuildCard/buildCard.svelte";
import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
import { env } from '$env/dynamic/public';

const df = new DateFormatter("en-US", {
    dateStyle: "long"
});

import { today } from "@internationalized/date";
let value = $state<DateValue | undefined>(today(getLocalTimeZone()));

let contentRef = $state<HTMLElement | null>(null);
let popoverOpen = $state(false);

if (!env.PUBLIC_AZURE_PIPELINE_CONFIG) {
   throw new Error("Missing PUBLIC_AZURE_PIPELINE_CONFIG environment variable.");
}

let parsedConfig;
try {
   parsedConfig = JSON.parse(env.PUBLIC_AZURE_PIPELINE_CONFIG);
} catch (e) {
   throw new Error("Failed to parse PUBLIC_AZURE_PIPELINE_CONFIG: " + (e instanceof Error ? e.message : String(e)));
}

if (!parsedConfig.pipelines || parsedConfig.pipelines.length === 0) {
   throw new Error("PUBLIC_AZURE_PIPELINE_CONFIG contains no pipelines.");
}

const pipelineConfig = parsedConfig;

let pipelineStatuses = $state<Record<string, string | null>>(
   Object.fromEntries(pipelineConfig.pipelines.map((p: { displayName: string }) => [p.displayName, null]))
);

let pipelineLinks = $state<Record<string, string | null>>(
   Object.fromEntries(pipelineConfig.pipelines.map((p: { displayName: string }) => [p.displayName, null]))
);

async function getPipelineStatus(pipelineName: string, definitionId: number) {
   if (!value) {
      pipelineStatuses = { ...pipelineStatuses, [pipelineName]: null };
      return;
   }
   const dateStr = value ? value.toDate(getLocalTimeZone()).toISOString().split('T')[0] : '';
   const res = await fetch(`/api/pipeline-status?definitionId=${definitionId}&date=${dateStr}`);
   const data = await res.json();
   pipelineStatuses = { ...pipelineStatuses, [pipelineName]: data.status || null };

   const linkRes = await fetch(`/api/release-link?definitionId=${definitionId}&date=${dateStr}`);
   const linkData = await linkRes.json();
   pipelineLinks = { ...pipelineLinks, [pipelineName]: linkData.link || null };
}

// Reset pipelineStatuses to null only when the date changes
let prevDate: string | undefined;
$effect(() => {
  const currentDate = value ? value.toString() : undefined;
  if (currentDate !== prevDate) {
      pipelineStatuses = Object.fromEntries(Object.keys(pipelineStatuses).map(k => [k, 'Unknown']));
      prevDate = currentDate;
      if (popoverOpen && value) {
      popoverOpen = false;
      }
  }
});

// Reactively fetch status when date changes
$effect(() => {
   for (const pipeline of pipelineConfig.pipelines) {
      getPipelineStatus(pipeline.displayName, pipeline.id);
   }
});
</script>
 


<div class="w-full h-full min-h-screen">

  <Card.Root class="w-full h-screen min-h-screen rounded-none">
      <ScrollArea class="h-full w-full">
         <Card.Header class="flex items-center justify-between">
            <Card.Title class="whitespace-nowrap">Build Information</Card.Title>
            <Popover.Root bind:open={popoverOpen}>
               <Popover.Trigger
                  class={cn(
                     buttonVariants({
                        variant: "outline",
                        class: "w-48 justify-between font-normal"
                     }),
                     !value && "text-muted-foreground"
                  )}
               >
                  <CalendarIcon />
                  {value ? df.format(value.toDate(getLocalTimeZone())) : "Pick a date"}
               </Popover.Trigger>
               <Popover.Content bind:ref={contentRef} class="w-auto p-0">
                     <Calendar
                     type="single"
                     bind:value
                     captionLayout="dropdown"
                     maxValue={today(getLocalTimeZone())}
                     />
               </Popover.Content>
            </Popover.Root>
         </Card.Header>
         <Card.Content>
            <div class="mt-8 flex flex-col gap-4 w-full">
            {#each pipelineConfig.pipelines as pipeline}
               <BuildCard
                  pipelineName={pipeline.displayName}
                  link={pipelineLinks[pipeline.displayName] ?? undefined}
                  status={pipelineStatuses[pipeline.displayName] ?? undefined}
               />
            {/each}
            </div>
         </Card.Content>
      </ScrollArea>
  </Card.Root>
</div>