<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from "mode-watcher";
	import favicon from '$lib/assets/favicon.svg';
	
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>


<div class="min-h-screen w-full flex flex-col bg-background">
  <ModeWatcher />
  <main class="flex-1 flex flex-col">
	{@render children?.()}
  </main>
</div>
