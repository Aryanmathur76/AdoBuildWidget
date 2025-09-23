import type { Build } from '$lib/types/build';

// Function to get the status of a build pipeline
// Returns 'good', 'ok', 'bad', 'interrupted', or 'unknown'
// Takes Build object as input, retrieved from Azure DevOps REST API
export async function getBuildPipelineStatus(buildDetails: Build) {
  
    if (!buildDetails) {
      throw new Error('Provided build is null or undefined');
    }

    if (!buildDetails.status) {
      throw new Error('Build has no status');
    }

    if (buildDetails.status === 'inProgress') {
      return 'inProgress';
    }

    if (buildDetails.result === 'canceled' || buildDetails.status === 'cancelling' || buildDetails.status === 'postponed') {
      return 'interrupted';
    }

    if (buildDetails.result === 'failed') {
      return 'bad';
    }

    if (buildDetails.passedTestCount === undefined || buildDetails.failedTestCount === undefined) {
      return 'unknown';
    }

    // If the pass ratio is 100% return 'good'
    const totalTests = buildDetails.passedTestCount + buildDetails.failedTestCount;

    if (totalTests > 0) {
      const passRate = (buildDetails.passedTestCount / totalTests) * 100;

      if (passRate === 100) {
        return 'good';
      } else if (passRate >= 70) {
        return 'ok';
      } else {
        return 'bad';
      }
    }

    return 'unknown';
}