

<script lang="ts">
import * as Card from "$lib/components/ui/card/index.js";
import Badge from "$lib/components/ui/badge/badge.svelte";
export let pipelineName: string = "PipelineName";
export let status: string = "Unknown";

</script>

<Card.Root>
    <Card.Content>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
            <span>{pipelineName}</span>
            {#if status === 'succeeded'}
                <Badge style="background: var(--success);" variant="default">Success</Badge>
            {:else if status === 'failed'}
                <Badge style="background: var(--failure);" variant="destructive">Failed</Badge>
            {:else if status === 'not completed'}
                <Badge style="background: var(--failure);" variant="destructive">Not Completed</Badge>
            {:else if status === 'partially succeeded'}
                <Badge style="background: var(--partially-succeeded);" variant="secondary">Partially Succeeded</Badge>
            {:else if status === 'in progress' || status === 'active'}
                <Badge style="background: var(--in-progress);" variant="secondary">In Progress</Badge>
            {:else if status === 'No Run Found'}
                <Badge variant="outline">No Run Found</Badge>
            {/if}
        </div>
    </Card.Content>
</Card.Root>