<script lang="ts">
import Badge from "$lib/components/ui/badge/badge.svelte";
import { Skeleton } from "$lib/components/ui/skeleton/index.js";
import { getPipelineBadgeColor, getPipelineBadgeText } from "$lib/constants/colors.js";

export let status: string | null = null;
</script>

{#if status === null}
    <Skeleton class="h-6 w-24 rounded-sm" />
{:else}
    <Badge class="{getPipelineBadgeColor(status)}" style="border-radius: 4px;" variant="default">
        <strong>{getPipelineBadgeText(status)}</strong>
    </Badge>
{/if}
