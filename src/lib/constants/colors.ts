/**
 * Color constants for build status indicators
 */
export const BUILD_STATUS_COLORS = {
  good: "bg-lime-600 text-white",
  ok: "bg-yellow-300 text-black", 
  bad: "bg-red-800 text-white",
  "inProgress": "bg-sky-500 text-white",
  interrupted: "bg-orange-500 text-white",
  unknown: "bg-zinc-700 text-white",
  default: "bg-zinc-700 text-white"
} as const;

/**
 * Helper function to get color class for a given build status
 */
export function getBuildStatusColor(status: string): string {
  return BUILD_STATUS_COLORS[status as keyof typeof BUILD_STATUS_COLORS] ?? BUILD_STATUS_COLORS.default;
}

/**
 * Color constants for the header badge (simplified versions)
 */
export const HEADER_STATUS_COLORS = {
  good: "bg-lime-600",
  ok: "bg-yellow-300 text-black", 
  bad: "bg-red-800",
  "inProgress": "bg-sky-500",
  interrupted: "bg-orange-500",
  unknown: "bg-zinc-700",
  default: "bg-zinc-700"
} as const;

/**
 * Helper function to get header color class for a given build status
 */
export function getHeaderStatusColor(status: string): string {
  return HEADER_STATUS_COLORS[status as keyof typeof HEADER_STATUS_COLORS] ?? HEADER_STATUS_COLORS.default;
}

/**
 * Color constants for pipeline status badges
 */
export const PIPELINE_BADGE_COLORS = {
  good: "bg-lime-600 text-white",
  succeeded: "bg-lime-600 text-white",
  bad: "bg-red-800 text-white", 
  failed: "bg-red-800 text-white",
  ok: "bg-yellow-300 text-black",
  "partially-succeeded": "bg-yellow-300 text-black",
  inProgress: "bg-sky-500 text-white",
  "in progress": "bg-sky-500 text-white",
  interrupted: "bg-orange-500 text-white",
  unknown: "bg-zinc-700 text-white",
  default: "bg-zinc-700 text-white"
} as const;

/**
 * Helper function to get badge color class for pipeline status
 */
export function getPipelineBadgeColor(status: string): string {
  return PIPELINE_BADGE_COLORS[status as keyof typeof PIPELINE_BADGE_COLORS] ?? PIPELINE_BADGE_COLORS.default;
}

/**
 * Helper function to get badge text for pipeline status
 */
export function getPipelineBadgeText(status: string): string {
  switch (status) {
    case 'good':
    case 'succeeded':
      return 'Good';
    case 'bad':
    case 'failed':
      return 'Bad';
    case 'ok':
    case 'partially-succeeded':
      return 'Partially Succeeded';
    case 'inProgress':
    case 'in progress':
      return 'In Progress';
    case 'interrupted':
      return 'Interrupted';
    case 'unknown':
    default:
      return 'Unknown';
  }
}