<script lang="ts">
    import { onMount } from "svelte";
    import { Card } from "$lib/components/ui/card/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Skeleton } from "$lib/components/ui/skeleton/index.js";
    import type { DayBuildQuality } from "$lib/utils/buildQualityUtils.js";

    interface Props {
        weeklyData: Record<string, DayBuildQuality>;
        weeklyStats: {
            totalTests: number;
            totalPassed: number;
            totalFailed: number;
            successRate: number;
        };
    }

    let { weeklyData, weeklyStats }: Props = $props();

    let insights = $state<string>("");
    let loading = $state(false);
    let error = $state<string>("");

    async function fetchInsights() {
        loading = true;
        error = "";
        insights = "";

        try {
            // Prepare data for AI analysis
            const buildData = {
                weeklyStats,
                dailyBreakdown: Object.entries(weeklyData).map(([date, data]) => ({
                    date,
                    totalPassed: data.totalPassCount || 0,
                    totalFailed: data.totalFailCount || 0,
                    quality: data.quality,
                    releasesWithTests: data.releasesWithTestsRan || 0
                }))
            };

            const response = await fetch('/api/ai-insights', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ buildData })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch insights');
            }

            const result = await response.json();
            insights = result.insights;
        } catch (err) {
            error = err instanceof Error ? err.message : 'An error occurred';
            console.error('Error fetching AI insights:', err);
        } finally {
            loading = false;
        }
    }
</script>

<Card class="pt-2 p-4 flex-1 flex flex-col">
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary" style="font-size: 1.5em;">
                psychology
            </span>
            <h3 class="text-sm font-semibold">AI Insights</h3>
        </div>
        <Button 
            size="sm" 
            variant="outline"
            onclick={fetchInsights}
            disabled={loading}
        >
            {loading ? 'Analyzing...' : 'Get Insights'}
        </Button>
    </div>

    <div class="flex-1 flex items-start justify-start">
        {#if loading}
            <div class="w-full space-y-2">
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-5/6" />
                <Skeleton class="h-4 w-4/6" />
            </div>
        {:else if error}
            <div class="text-sm text-red-600">
                <p class="font-medium">Error: {error}</p>
                <p class="text-xs text-muted-foreground mt-1">Please check your Azure OpenAI configuration</p>
            </div>
        {:else if insights}
            <div class="text-sm text-foreground leading-relaxed">
                <p>{insights}</p>
            </div>
        {:else}
            <div class="flex flex-col items-center justify-center text-center space-y-2 w-full py-4">
                <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <span class="material-symbols-outlined text-muted-foreground">
                        auto_awesome
                    </span>
                </div>
                <div>
                    <p class="text-xs text-muted-foreground font-medium">AI-Powered Analysis</p>
                    <p class="text-xs text-muted-foreground/70">Click "Get Insights" to analyze your build data</p>
                </div>
            </div>
        {/if}
    </div>
</Card>
