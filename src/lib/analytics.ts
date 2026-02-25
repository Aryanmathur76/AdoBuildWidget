/**
 * analytics.ts — thin wrapper around Azure Application Insights
 *
 * Usage:
 *   Call initAppInsights(connectionString) once on mount in +layout.svelte.
 *   Call trackPageView(path) on every navigation via afterNavigate.
 */

import type { ApplicationInsights } from '@microsoft/applicationinsights-web';

let appInsights: ApplicationInsights | null = null;

/**
 * Initialise Application Insights. Safe to call server-side (no-ops) and
 * safe to call multiple times (only initialises once).
 */
export async function initAppInsights(connectionString: string): Promise<void> {
    if (typeof window === 'undefined' || !connectionString || appInsights) return;

    // Dynamic import keeps the ~100 KB SDK out of the critical JS bundle
    const { ApplicationInsights } = await import('@microsoft/applicationinsights-web');

    appInsights = new ApplicationInsights({
        config: {
            connectionString,
            enableAutoRouteTracking: false,  // we handle this via afterNavigate
            disableFetchTracking: false,
            enableCorsCorrelation: false,    // avoid CORS pre-flight on API calls
        },
    });

    appInsights.loadAppInsights();
    appInsights.trackPageView();  // track the initial load
}

/** Call on every SvelteKit navigation to record a page view. */
export function trackPageView(path: string): void {
    appInsights?.trackPageView({ uri: path });
}
