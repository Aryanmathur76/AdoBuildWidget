<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from "mode-watcher";
	import favicon from '$lib/assets/favicon.svg';
	import PTAChat from '$lib/components/ui/PTAChat.svelte';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { env } from '$env/dynamic/public';
	import { initAppInsights, trackPageView } from '$lib/analytics';

	let { children } = $props();

	onMount(() => {
		initAppInsights(env.PUBLIC_APPINSIGHTS_CONNECTION_STRING ?? '');
	});

	// Track every client-side navigation as a page view
	afterNavigate(({ to }) => {
		if (to?.url) trackPageView(to.url.pathname);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&family=Material+Symbols:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
</svelte:head>

<div class="w-full h-screen flex flex-col bg-background overflow-hidden">
  <ModeWatcher />
  <div class="app-body">
    <main class="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      {@render children?.()}
    </main>
    <PTAChat />
  </div>
</div>

<style>
  .app-body {
    flex: 1;
    display: flex;
    flex-direction: row;
    min-height: 0;
    overflow: hidden;
  }
</style>
