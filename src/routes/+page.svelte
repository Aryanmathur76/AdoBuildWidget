
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

const df = new DateFormatter("en-US", {
    dateStyle: "long"
});

import { today } from "@internationalized/date";
let value = $state<DateValue | undefined>(today(getLocalTimeZone()));
let contentRef = $state<HTMLElement | null>(null);

// Example pipeline URLs for each pipeline name

// Only store definitionIds for each pipeline
const pipelineDefinitionIds = {
   "ProdEval English": 910,
   "ProdEval Chinese": 1034,
   "ProdEval Debug": 1042,
};

let pipelineStatuses = $state<Record<string, string | null>>({
   "ProdEval English": null,
   "ProdEval Chinese": null,
   "ProdEval Debug": null,
});

async function getPipelineStatus(pipelineName: string, definitionId: number) {
   if (!value) {
      pipelineStatuses = { ...pipelineStatuses, [pipelineName]: null };
      console.log(pipelineStatuses);
      return;
   }
   const dateStr = value ? value.toDate(getLocalTimeZone()).toISOString().split('T')[0] : '';
   const res = await fetch(`/api/pipeline-status?definitionId=${definitionId}&date=${dateStr}`);
   const data = await res.json();
   pipelineStatuses = { ...pipelineStatuses, [pipelineName]: data.status || null };
   console.log("pipeline name:", pipelineName);
   console.log("pipeline status:", data.status);
}

// Reactively fetch status when date changes
$effect(() => {
   if (value) {
      for (const [name, definitionId] of Object.entries(pipelineDefinitionIds)) {
         getPipelineStatus(name, definitionId);
      }
   }
});
</script>
 

<Card.Root style="max-width: 400px; margin: 1rem auto;">
   <Card.Header>
      <Card.Title>Build Information</Card.Title>
   </Card.Header>
   <Card.Content>
      <Popover.Root>
         <Popover.Trigger
            class={cn(
               buttonVariants({
                  variant: "outline",
                  class: "w-[280px] justify-start text-left font-normal"
               }),
               !value && "text-muted-foreground"
            )}
         >
            <CalendarIcon />
            {value ? df.format(value.toDate(getLocalTimeZone())) : "Pick a date"}
         </Popover.Trigger>
         <Popover.Content bind:ref={contentRef} class="w-auto p-0">
            <Calendar type="single" bind:value />
         </Popover.Content>
      </Popover.Root>
      <div style="margin-top: 2rem;">
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
      </div>
   </Card.Content>
</Card.Root>