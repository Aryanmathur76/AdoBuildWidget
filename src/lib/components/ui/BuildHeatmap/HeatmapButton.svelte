<script>
  import { Button } from "$lib/components/ui/button/index.js";
  import { goto } from "$app/navigation";
  export let dayObj;
</script>

{#if dayObj}
  <Button
    size="icon"
    type="button"
    aria-label={`Go to build ${dayObj.dateStr}`}
    onclick={() => goto(`/build/${dayObj.dateStr}`)}
    class={`w-full h-full min-w-0 min-h-0 cursor-pointer ${dayObj.colorClass} ${dayObj.animationClass}`}
    style="aspect-ratio: 1 / 1; transition: transform 0.2s; position: relative;"
    disabled={dayObj.disabled}
  >
    <strong>{dayObj.day}</strong>
  </Button>
{/if}
