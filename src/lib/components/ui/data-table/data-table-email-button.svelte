<script lang="ts">
// Email button for DataTable column header
export let onclick: ((event: Event) => void) | undefined = undefined;
</script>

<button
  type="button"
  class="font-medium text-left w-full flex items-center gap-2"
  on:click={onclick}
>
  Email
  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12H8m8 0a4 4 0 11-8 0 4 4 0 018 0zm0 0v4m0-4V8" />
  </svg>
</button>
