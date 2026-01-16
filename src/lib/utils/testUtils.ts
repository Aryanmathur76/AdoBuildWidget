// Utility functions extracted from MonthlyTestResults.svelte

export function formatDate(dateString: string | null): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getPassRateColor(passRate: number): string {
    if (passRate >= 95) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (passRate >= 90) return 'bg-lime-500/20 text-lime-400 border-lime-500/30';
    if (passRate >= 80) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (passRate >= 70) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
}

export function getBufferBadgeColor(bufferDays: number): string {
    if (bufferDays === 0) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (bufferDays <= 2) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
}
