/**
 * Color constants for build status indicators
 */
export const BUILD_STATUS_COLORS = {
  good: "bg-[var(--success)] text-white",
  ok: "bg-[var(--partially-succeeded)] text-black",
  bad: "bg-[var(--failure)] text-white",
  inProgress: "bg-[var(--in-progress)] text-white",
  interrupted: "bg-[var(--interrupted)] text-white",
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
  good: "bg-[var(--success)] text-white",
  ok: "bg-[var(--partially-succeeded)] text-black",
  bad: "bg-[var(--failure)] text-white",
  "inProgress": "bg-[var(--in-progress)] text-white",
  interrupted: "bg-[var(--interrupted)] text-white",
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
  good: "bg-[var(--success)] text-white",
  succeeded: "bg-[var(--success)] text-white",
  bad: "bg-[var(--failure)] text-white",
  failed: "bg-[var(--failure)] text-white",
  ok: "bg-[var(--partially-succeeded)] text-black",
  "partially-succeeded": "bg-[var(--partially-succeeded)] text-black",
  inProgress: "bg-[var(--in-progress)] text-white",
  "in progress": "bg-[var(--in-progress)] text-white",
  interrupted: "bg-[var(--interrupted)] text-white",
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
  pass: "bg-[var(--success)]",
  fail: "bg-[var(--failure)]",
  noData: "bg-zinc-400",
  inProgress: "bg-[var(--in-progress)]",
  interrupted: "bg-[var(--interrupted)]"
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

/**
 * Helper function to get test result in-progress color
 */
export function getTestInProgressColor(): string {
  return TEST_RESULT_COLORS.inProgress;
}

export function getTestInterruptedColor(): string {
  return TEST_RESULT_COLORS.interrupted;
}