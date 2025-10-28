<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from "mode-watcher";
	import favicon from '$lib/assets/favicon.svg';
	
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&family=Material+Symbols:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
	
</svelte:head>


<div class="w-full h-screen flex flex-col bg-background overflow-hidden">
  <ModeWatcher />
  <main class="flex-1 flex flex-col min-h-0">
	{@render children?.()}
  </main>
</div>
