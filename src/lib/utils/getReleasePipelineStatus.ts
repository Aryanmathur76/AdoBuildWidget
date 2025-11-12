import type { Release } from '$lib/types/release';
import { getTestQuality } from '$lib/constants/thresholds';

// Function to calculate the latest completion time from release environments
// Traverses all environments and finds the latest finishTime or dateEnded from tasks
export function calculateReleaseCompletionTime(environments: any[]): string | undefined {
  let latestFinishTime: string | undefined = undefined;
  
  if (!environments || !Array.isArray(environments)) {
    return latestFinishTime;
  }
  
  for (let i = 0; i < environments.length; i++) {
    const environment = environments[i];
    
    // Navigate through deploySteps -> releaseDeployPhases -> deploymentJobs -> tasks
    if (environment.deploySteps && Array.isArray(environment.deploySteps)) {
      
      for (let j = 0; j < environment.deploySteps.length; j++) {
        const deployStep = environment.deploySteps[j];
        
        // Check releaseDeployPhases
        if (deployStep.releaseDeployPhases && Array.isArray(deployStep.releaseDeployPhases)) {
          
          for (let k = 0; k < deployStep.releaseDeployPhases.length; k++) {
            const phase = deployStep.releaseDeployPhases[k];
            
            // Check deploymentJobs
            if (phase.deploymentJobs && Array.isArray(phase.deploymentJobs)) {
              
              for (let l = 0; l < phase.deploymentJobs.length; l++) {
                const job = phase.deploymentJobs[l];
                
                // Check job-level finishTime/dateEnded
                const jobFinishTime = job.job?.finishTime || job.job?.dateEnded;
                if (jobFinishTime) {
                  if (!latestFinishTime || new Date(jobFinishTime) > new Date(latestFinishTime)) {
                    latestFinishTime = jobFinishTime;
                  }
                }
                
                // Check tasks within the job
                if (job.tasks && Array.isArray(job.tasks)) {
                  
                  for (let m = 0; m < job.tasks.length; m++) {
                    const task = job.tasks[m];
                    const taskFinishTime = task.finishTime || task.dateEnded;
                    
                    if (taskFinishTime) {
                      if (!latestFinishTime || new Date(taskFinishTime) > new Date(latestFinishTime)) {
                        latestFinishTime = taskFinishTime;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  return latestFinishTime;
}

// Function to get the status of a release pipeline
// Returns 'good', 'ok', 'bad', 'interrupeted', or 'unknown'
// Takes Release object as input, retrieved from Azure DevOps REST API
export async function getReleasePipelineStatus(releaseDetails: Release, considerAutomationStatus = true) {
  
    if (!releaseDetails) {
      throw new Error('Provided release is null or undefined');
    }

    if (!releaseDetails.envs || releaseDetails.envs.length === 0) {
      throw new Error('Release has no environments');
    }

    //FILTER OUT PTA ENVIRONMENT IF IT EXISTS
    const filteredEnvs = releaseDetails.envs.filter(env => env.name !== 'PTA');
    releaseDetails = { ...releaseDetails, envs: filteredEnvs };

    if (releaseDetails.envs.some(env => env.status === 'inProgress') || releaseDetails.envs.some(env => env.status === 'queued')) {
      return 'inProgress';
    }

    if (releaseDetails.passedTestCount === undefined || releaseDetails.failedTestCount === undefined) {
      return 'unknown';
    }

    // If the pass ratio is 100% return 'good'
    const totalTests = releaseDetails.passedTestCount + releaseDetails.failedTestCount;

    if (totalTests > 0) {
      const passRate = (releaseDetails.passedTestCount / totalTests) * 100;

      return getTestQuality(passRate);
    }
    else{
    //If automation status is considered, check for interrupted or failed statuses ONLY if no tests have been run
      if (considerAutomationStatus){
        if (releaseDetails.envs.some(env => env.status === 'canceled' || env.status === 'aborted')) {
          return 'interrupted';
        }

        if (releaseDetails.envs.some(env => env.status === 'failed' || env.status === 'rejected')) {
          return 'interrupted';
        }
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

