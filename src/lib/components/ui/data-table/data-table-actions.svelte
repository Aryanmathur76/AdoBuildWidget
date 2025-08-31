<script lang="ts">
// Actions cell for DataTable (e.g., row menu or buttons)
export let id: string;
</script>

<div class="flex items-center gap-2 justify-end">
  <button
    class="rounded px-2 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700"
    title="View"
    on:click={() => alert(`View details for ${id}`)}
  >
    View
  </button>
  <button
    class="rounded px-2 py-1 text-xs font-medium bg-red-100 hover:bg-red-200 text-red-700"
    title="Delete"
    on:click={() => alert(`Delete row ${id}`)}
  >
    Delete
  </button>
</div>
