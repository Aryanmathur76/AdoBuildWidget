

<script lang="ts">

import * as Card from "$lib/components/ui/card/index.js";
import PipelineStatusBadge from "$lib/components/ui/PipelineStatusBadge/pipelineStatusBadge.svelte";
import { toast } from "svelte-sonner";
import { Toaster } from '$lib/components/ui/sonner';
export let pipelineName: string = "PipelineName";
export let link: string | null = null;
export let status: string = "Unknown";

function handleCopy() {
    if (link) {
        navigator.clipboard.writeText(link);
        toast.info(link, { duration: 6000 });
    }
}
</script>

<Toaster position="top-center" richColors />
<Card.Root>
    <Card.Content>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%;">
            <!-- Left: Title and Description/Body -->
            <div class="flex flex-col items-start min-w-0 flex-1">
                <span class="font-semibold text-[1.1rem] leading-[1.2] truncate pb-1">{pipelineName}</span>
                <slot />
            </div>    <!-- Right: Badge and Link Icon -->
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
                {#if link}
                    <button
                        title="Copy link"
                        aria-label="Copy link"
                        on:click={handleCopy}
                        style="background: none; border: none; padding: 0; cursor: pointer; display: flex; align-items: center;"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke="currentColor" stroke-width="2" fill="none" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
                          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/>
                        </svg>
                    </button>
                {/if}
                <PipelineStatusBadge {status} />
            </div>
        </div>
    </Card.Content>
</Card.Root>