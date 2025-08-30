<script lang="ts">
import Badge from "$lib/components/ui/badge/badge.svelte";
import { Skeleton } from "$lib/components/ui/skeleton/index.js";
export let status: string | null = null;
</script>

{#if status === 'Unknown' || status === null}
    <Skeleton class="h-6 w-24 rounded" />
{:else if status === 'succeeded'}
    <Badge style="background: var(--success);" variant="default">Success</Badge>
{:else if status === 'failed'}
    <Badge style="background: var(--failure);" variant="destructive">Failed</Badge>
{:else if status === 'not completed'}
    <Badge style="background: var(--failure);" variant="destructive">Not Completed</Badge>
{:else if status === 'interrupted'}
    <Badge style="background: var(--failure);" variant="destructive">Interrupted</Badge>
{:else if status === 'partially succeeded'}
    <Badge style="background: var(--partially-succeeded);" variant="secondary">Partially Succeeded</Badge>
{:else if status === 'in progress' || status === 'active'}
    <Badge style="background: var(--in-progress);" variant="secondary">In Progress</Badge>
{:else if status === 'No Run Found'}
    <Badge variant="outline">No Run Found</Badge>
{/if}
