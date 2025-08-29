
<script lang="ts">
import { page } from "$app/stores";
import { derived } from "svelte/store";
import BuildDashboard from "$lib/components/ui/BuildDashboard/BuildDashboard.svelte";
// Get the date param from the URL
const dateStore = derived(page, ($page) => $page.params.date);
let date: string | undefined;
const unsubscribe = dateStore.subscribe(value => date = value);
</script>

<BuildDashboard {date} />
