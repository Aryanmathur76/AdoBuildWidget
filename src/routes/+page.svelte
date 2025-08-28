
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

const df = new DateFormatter("en-US", {
    dateStyle: "long"
});

import { today } from "@internationalized/date";
let value = $state<DateValue | undefined>(today(getLocalTimeZone()));
let contentRef = $state<HTMLElement | null>(null);

// Only store definitionIds for each pipeline
const pipelineDefinitionIds = {
   "ProdEval English": 910,
   "ProdEval Chinese": 1034,
   "ProdEval Debug": 1042,
   "Daily CR": 1054
};

let pipelineStatuses = $state<Record<string, string | null>>({
   "ProdEval English": null,
   "ProdEval Chinese": null,
   "ProdEval Debug": null,
   "Daily CR": null
});

async function getPipelineStatus(pipelineName: string, definitionId: number) {
   if (!value) {
      pipelineStatuses = { ...pipelineStatuses, [pipelineName]: null };
      return;
   }
   const dateStr = value ? value.toDate(getLocalTimeZone()).toISOString().split('T')[0] : '';
   const res = await fetch(`/api/pipeline-status?definitionId=${definitionId}&date=${dateStr}`);
   const data = await res.json();
   pipelineStatuses = { ...pipelineStatuses, [pipelineName]: data.status || null };
}

// Reset pipelineStatuses to null only when the date changes
let prevDate: string | undefined;
$effect(() => {
  const currentDate = value ? value.toString() : undefined;
  if (currentDate !== prevDate) {
    pipelineStatuses = Object.fromEntries(Object.keys(pipelineStatuses).map(k => [k, 'Unknown']));
    prevDate = currentDate;
  }
});

// Reactively fetch status when date changes
$effect(() => {
   for (const [name, definitionId] of Object.entries(pipelineDefinitionIds)) {
      getPipelineStatus(name, definitionId);
   }
});
</script>
 


<div class="w-full h-full min-h-screen">
  <Card.Root class="w-full h-screen min-h-screen rounded-none">
   <Card.Header class="flex items-center justify-between">
      <Card.Title class="whitespace-nowrap">Build Information</Card.Title>
      <Popover.Root>
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
      <ScrollArea class="h-[60vh] w-full">
        <div class="mt-8 flex flex-col gap-4 w-full">
          <BuildCard
            pipelineName="ProdEval English"
            status={pipelineStatuses["ProdEval English"] ?? undefined}
          />
          <BuildCard
            pipelineName="ProdEval Chinese"
            status={pipelineStatuses["ProdEval Chinese"] ?? undefined}
          />
          <BuildCard
            pipelineName="ProdEval Debug"
            status={pipelineStatuses["ProdEval Debug"] ?? undefined}
          />
          <BuildCard
            pipelineName="Daily CR"
            status={pipelineStatuses["Daily CR"] ?? undefined}
          />
        </div>
      </ScrollArea>
   </Card.Content>
  </Card.Root>
</div>