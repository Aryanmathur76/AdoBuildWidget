import type { Release } from '$lib/types/release';

// Function to get the status of a release pipeline
// Returns 'good', 'ok', 'bad', 'interrupeted', or 'unknown'
// Takes Release object as input, retrieved from Azure DevOps REST API
export async function getReleasePipelineStatus(releaseDetails: Release) {
  
    if (!releaseDetails) {
      throw new Error('Provided release is null or undefined');
    }

    if (!releaseDetails.envs || releaseDetails.envs.length === 0) {
      throw new Error('Release has no environments');
    }

    console.log('All Env statuses: ' + JSON.stringify(releaseDetails.envs.map(env => env.status)));

    if (releaseDetails.envs.some(env => env.status === 'inProgress')) {
      return 'inProgress';
    }

    if (releaseDetails.envs.some(env => env.status === 'canceled' || env.status === 'aborted')) {
      return 'interrupted';
    }

    if (releaseDetails.envs.some(env => env.status === 'failed' || env.status === 'rejected')) {
      console.log('Release pipeline: ' + JSON.stringify(releaseDetails));
      return 'failed';
    }

    if (releaseDetails.passedTestCount === undefined || releaseDetails.failedTestCount === undefined) {
      return 'unknown';
    }

    // If the pass ratio is 100% return 'good'
    const totalTests = releaseDetails.passedTestCount + releaseDetails.failedTestCount;

    if (totalTests > 0) {
      const passRate = (releaseDetails.passedTestCount / totalTests) * 100;

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

// Function takes in an array of Release Objects and returns the latest release
export function getLatestRelease(releases: Release[]): Release | null {
    // If no releases, return null
    if (!releases || releases.length === 0) {
      return null;
    }

    //Iterate through releases and find the one with the latest createdOn date
    return releases.reduce((latest, current) => {
      const latestDate = new Date(latest.createdOn);
      const currentDate = new Date(current.createdOn);
      return currentDate > latestDate ? current : latest;
    }, releases[0]);
}