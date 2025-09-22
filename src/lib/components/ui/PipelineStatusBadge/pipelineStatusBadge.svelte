<script lang="ts">
import Badge from "$lib/components/ui/badge/badge.svelte";
import { Skeleton } from "$lib/components/ui/skeleton/index.js";
export let status: string | null = null;
</script>

{#if status === null}
    <Skeleton class="h-6 w-24 rounded" />
{:else if status === 'good' || status === 'succeeded'}
    <Badge style="background: var(--success);" variant="default"><strong>Good</strong></Badge>
{:else if status === 'bad' || status === 'failed'}
    <Badge style="background: var(--failure);" variant="destructive"><strong>Bad</strong></Badge>
{:else if status === 'interrupted'}
    <Badge style="background: var(--failure);" variant="destructive"><strong>Interrupted</strong></Badge>
{:else if status === 'ok'}
    <Badge style="background: var(--partially-succeeded); color: black;" variant="secondary"><strong>Partially Succeeded</strong></Badge>
{:else if status === 'inProgress'}
    <Badge style="background: var(--in-progress); color: black;" variant="secondary"><strong>In Progress</strong></Badge>
{:else if status === 'unknown'}
    <Badge variant="outline"><strong>Unknown</strong></Badge>
{/if}
