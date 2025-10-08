import type { Build } from '$lib/types/build';
import { getTestQuality } from '$lib/constants/thresholds';

// Function to get the status of a build pipeline
// Returns 'good', 'ok', 'bad', 'interrupted', or 'unknown'
// Takes Build object as input, retrieved from Azure DevOps REST API
export async function getBuildPipelineStatus(buildDetails: Build, considerAutomationStatus = false) {
  
    if (!buildDetails) {
      throw new Error('Provided build is null or undefined');
    }

    if (!buildDetails.status) {
      throw new Error('Build has no status');
    }

    if (buildDetails.status === 'inProgress') {
      return 'inProgress';
    }

    if (considerAutomationStatus){
      if (buildDetails.result === 'canceled' || buildDetails.status === 'cancelling' || buildDetails.status === 'postponed') {
        return 'interrupted';
      }

      if (buildDetails.result === 'failed') {
        return 'bad';
      }
    }

    if (buildDetails.passedTestCount === undefined || buildDetails.failedTestCount === undefined) {
      return 'unknown';
    }
    
    const totalTests = buildDetails.passedTestCount + buildDetails.failedTestCount;

    if (totalTests > 0) {
      const passRate = (buildDetails.passedTestCount / totalTests) * 100;

      return getTestQuality(passRate);
    }

    return 'unknown';
}