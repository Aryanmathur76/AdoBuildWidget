<script lang="ts">
    import { Dialog, DialogContent, DialogTitle, DialogDescription } from "$lib/components/ui/dialog/index.js";
    import { PIPELINE_TEST_THRESHOLDS } from "$lib/constants/thresholds.js";
    let { open = $bindable(false), isMobile = false }: { open?: boolean; isMobile?: boolean } = $props();
</script>

<Dialog bind:open>
    <DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogTitle>DeltaV Build Health Help</DialogTitle>
        <DialogDescription>
            <div class="space-y-6 mt-4 text-sm leading-relaxed">
                <!-- Overview Section -->
                <div>
                    <h3 class="font-semibold text-foreground mb-2">Overview</h3>
                    <p>
                        The Build Health Widget provides a visual summary of daily DeltaV testing. 
                        It helps you quickly identify build quality trends and potential issues across DeltaV.
                    </p>
                </div>

                <!-- View Modes Section -->
                <div>
                    <h3 class="font-semibold text-foreground mb-2">View Modes</h3>
                    <div class="space-y-2">
                        <div>
                            <p class="font-bold">Simple View</p>
                            <p class="text-muted-foreground">
                                Displays a calendar grid with color-coded cells for each day. Colors indicate build health status:
                            </p>
                            <ul class="list-disc list-inside mt-1 text-muted-foreground">
                                <li><span class="font-medium">Green</span>: At least {PIPELINE_TEST_THRESHOLDS.good}% pass rate on each set of tests</li>
                                <li><span class="font-medium">Yellow</span>: Between {PIPELINE_TEST_THRESHOLDS.good}% and {PIPELINE_TEST_THRESHOLDS.ok}% pass rate on at least one test set</li>
                                <li><span class="font-medium">Red</span>: Below {PIPELINE_TEST_THRESHOLDS.ok}% pass rate on at least one test set</li>
                                <li><span class="font-medium">Orange</span>: Pipeline failure - tests have been interrupted or not run</li>
                                <li><span class="font-medium">Gray</span>: No test data for that day</li>
                            </ul>
                        </div>
                        <div>
                            <p class="font-bold">Graph View</p>
                            <p class="text-muted-foreground">
                                Displays a bar chart showing test results for each test set for each day, making it easier to track trends over time.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Tabs Section -->
                {#if isMobile}
                    <div>
                        <h3 class="font-semibold text-foreground mb-2">Time Period Selection</h3>
                        <p class="text-muted-foreground">
                            Use the tabs to switch between <strong>Monthly</strong> and <strong>Weekly</strong> views:
                        </p>
                        <ul class="list-disc list-inside mt-1 text-muted-foreground">
                            <li><strong>Monthly</strong>: Shows the entire current month at a glance</li>
                            <li><strong>Weekly</strong>: Shows detailed view of a single week with daily build metrics</li>
                        </ul>
                    </div>
                {/if}

                <!-- Build Details Section -->
                <div>
                    <h3 class="font-semibold text-foreground mb-2">Understanding Build Details</h3>
                    <p class="text-muted-foreground mb-2">
                        Click on any day in the calendar to view:
                    </p>
                    <ul class="list-disc list-inside text-muted-foreground space-y-1">
                        <li><strong>Pipeline Status</strong>: Overall status of your builds and releases</li>
                        <li><strong>Test Results</strong>: Pie charts showing pass/fail ratios</li>
                        <li><strong>Completion Time</strong>: When the builds/releases completed</li>
                        <li><strong>Test Details</strong>: Detailed view of individual test cases (click the science icon)</li>
                    </ul>
                </div>

                <!-- Features Section -->
                <div>
                    <h3 class="font-semibold text-foreground mb-2">Key Features</h3>
                    <ul class="list-disc list-inside text-muted-foreground space-y-1">
                        <li><strong>Best Build Day</strong>: Analyzes the month to highlight the best performing day</li>
                        <li><strong>Pipeline Analytics</strong>: View detailed statistics and trends for your pipelines</li>
                        <li><strong>Quick Links</strong>: Click the eye icon to copy links to your Azure DevOps pipelines</li>
                    </ul>
                </div>

                <!-- Color Legend Section -->
                <div>
                    <h3 class="font-semibold text-foreground mb-2">Color Legend</h3>
                    <div class="space-y-2 text-muted-foreground">
                        <div class="flex items-center gap-2">
                            <div class="w-4 h-4 bg-green-500 rounded"></div>
                            <span>Green: At least {PIPELINE_TEST_THRESHOLDS.good}% pass rate on each test set</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-4 h-4 bg-yellow-500 rounded"></div>
                            <span>Yellow: Between {PIPELINE_TEST_THRESHOLDS.good}% and {PIPELINE_TEST_THRESHOLDS.ok}% pass rate on at least one test set</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-4 h-4 bg-red-500 rounded"></div>
                            <span>Red: Below {PIPELINE_TEST_THRESHOLDS.ok}% pass rate on at least one test set</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-4 h-4 bg-orange-500 rounded"></div>
                            <span>Orange: Pipeline failure - tests interrupted or not run</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-4 h-4 bg-gray-400 rounded"></div>
                            <span>Gray: No test data for that day</span>
                        </div>
                    </div>
                </div>

                <!-- Tips Section -->
                <div>
                    <h3 class="font-semibold text-foreground mb-2">Tips & Tricks</h3>
                    <ul class="list-disc list-inside text-muted-foreground space-y-1">
                        <li>Use the monthly view to identify problem weeks or patterns</li>
                        <li>Switch to weekly view for detailed daily metrics</li>
                        <li>Use the "Best Build" feature to find your highest quality day</li>
                        <li>Check the Analytics section for detailed pipeline statistics</li>
                        <li>Hover over cells to see quick status previews</li>
                    </ul>
                </div>
            </div>
        </DialogDescription>
    </DialogContent>
</Dialog>
