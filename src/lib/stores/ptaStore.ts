import { writable } from 'svelte/store';

/** True when the PTA side panel is open. */
export const ptaOpen = writable(false);

/** Pending text to inject into the PTA input. Set by BuildCard, consumed and cleared by PTAChat. */
export const ptaInject = writable<string | null>(null);
