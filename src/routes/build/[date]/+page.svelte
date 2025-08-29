
<script lang="ts">
import { page } from "$app/stores";
import { derived } from "svelte/store";
import BuildDashboard from "$lib/components/ui/BuildDashboard/BuildDashboard.svelte";
// Get the date param from the URL
const dateStore = derived<typeof page, string | undefined>(page, ($page) => $page.params.date as string | undefined);
let date: string | undefined;
const unsubscribe = dateStore.subscribe(value => date = value);
</script>

<BuildDashboard {date} />
