<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from "mode-watcher";
	import favicon from '$lib/assets/favicon.svg';
	
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=health_metrics" />
</svelte:head>


<div class="min-h-screen w-full flex flex-col bg-background">
  <ModeWatcher />
  <main class="flex-1 flex flex-col">
	{@render children?.()}
  </main>
</div>
