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
  good: "bg-lime-600 text-white",
  ok: "bg-yellow-300 text-black", 
  bad: "bg-red-800 text-white",
  "inProgress": "bg-sky-500 text-white",
  interrupted: "bg-orange-500 text-white",
  unknown: "bg-zinc-700 text-white",
  default: "bg-zinc-700 text-white"
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

/**
 * Color constants for test result bars
 */
export const TEST_RESULT_COLORS = {
  pass: "bg-lime-600",
  fail: "bg-red-800",
  noData: "bg-zinc-400"
} as const;

/**
 * Helper function to get test result pass color
 */
export function getTestPassColor(): string {
  return TEST_RESULT_COLORS.pass;
}

/**
 * Helper function to get test result fail color
 */
export function getTestFailColor(): string {
  return TEST_RESULT_COLORS.fail;
}

/**
 * Helper function to get test result no-data color
 */
export function getTestNoDataColor(): string {
  return TEST_RESULT_COLORS.noData;
}