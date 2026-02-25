import { writable } from 'svelte/store';

/** True when the PTA side panel is open. */
export const ptaOpen = writable(false);
