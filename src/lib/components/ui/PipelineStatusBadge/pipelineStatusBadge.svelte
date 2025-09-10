<script lang="ts">
import Badge from "$lib/components/ui/badge/badge.svelte";
import { Skeleton } from "$lib/components/ui/skeleton/index.js";
export let status: string | null = null;
</script>

{#if status === null}
    <Skeleton class="h-6 w-24 rounded" />
{:else if status === 'succeeded'}
    <Badge style="background: var(--success);" variant="default"><strong>Success</strong></Badge>
{:else if status === 'failed'}
    <Badge style="background: var(--failure);" variant="destructive"><strong>Failed</strong></Badge>
{:else if status === 'not completed'}
    <Badge style="background: var(--failure);" variant="destructive"><strong>Not Completed</strong></Badge>
{:else if status === 'interrupted'}
    <Badge style="background: var(--failure);" variant="destructive"><strong>Interrupted</strong></Badge>
{:else if status === 'partially succeeded'}
    <Badge style="background: var(--partially-succeeded);" variant="secondary"><strong>Partially Succeeded</strong></Badge>
{:else if status === 'in progress' || status === 'active'}
    <Badge style="background: var(--in-progress);" variant="secondary"><strong>In Progress</strong></Badge>
{:else if status === 'Unknown'}
    <Badge variant="outline"><strong>No Run Found</strong></Badge>
{/if}
