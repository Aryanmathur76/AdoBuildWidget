// Helper to determine overall quality based on individual pipeline statuses
export function determineOverallDayQuality(statuses: string[]): string {
  // Prioritize 'inProgress' status
  if (statuses.includes('inProgress')) {
    return 'inProgress';
  }

  if (statuses.includes('interrupted')) {
    return 'interrupted';
  }

  // If any pipeline is bad/failed, overall is bad
  if (statuses.includes('bad') || statuses.includes('failed')) {
    return 'bad';
  }

  // If any pipeline is ok/partially succeeded, overall is ok
  if (statuses.includes('ok') || statuses.includes('partially succeeded')) {
    return 'ok';
  }

  // If all pipelines are good, overall is good
  if (statuses.every(status => 
    ['good', 'succeeded'].includes(status)
  )) {
    return 'good';
  }

  // Default to unknown if no clear determination can be made
  return 'unknown';
}