import { writable } from 'svelte/store';

/** True when the PTA side panel is open. */
export const ptaOpen = writable(false);

/** Pending text to inject into the PTA input. Set by BuildCard, consumed and cleared by PTAChat. */
export const ptaInject = writable<string | null>(null);

/** Current docked panel width in px. 0 when closed or floating. */
export const ptaWidth = writable(0);
