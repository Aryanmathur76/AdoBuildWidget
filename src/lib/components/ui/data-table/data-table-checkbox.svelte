<script lang="ts">
// Checkbox for selecting rows in the DataTable
export let checked: boolean = false;
export let indeterminate: boolean = false;
export let onCheckedChange: (value: boolean) => void = () => {};
export let ariaLabel: string = "";
</script>

<input
  type="checkbox"
  bind:checked
  indeterminate={indeterminate}
  aria-label={ariaLabel}
  on:change={(e) => onCheckedChange(e.currentTarget.checked)}
  class="accent-primary h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/50"
/>
