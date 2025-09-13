# API Endpoints

## /api/build-quality
**GET**
- Parameters: `date` (YYYY-MM-DD)
- Purpose: Returns overall build quality for all configured pipelines for a given date.
- Returns: `{ date, releaseIds, quality, releasesWithTestsRan, totalPassCount, totalFailCount }`
	- `quality`: 'good' | 'ok' | 'bad' | 'in progress' | 'unknown'
	- `releasesWithTestsRan`: Number of releases with non-zero test cases
	- `totalPassCount`: Total number of passed tests
	- `totalFailCount`: Total number of failed tests

## /api/test-run
**GET**
- Parameters: `releaseId`, `date` (YYYY-MM-DD)
- Purpose: Returns aggregate pass/fail counts for the latest test run per environment for a release and date window.
- Returns: `{ passCount, failCount, message? }`

## /api/test-cases
**GET**
- Parameters: `releaseId`, `date` (YYYY-MM-DD)
- Purpose: Returns all test cases for all latest test runs (per environment) for a given release and date window.
- Returns: `{ testCases: [ { id, name, outcome, associatedBugs } ] }`

## /api/release-id
**GET**
- Parameters: `definitionId`, `date` (YYYY-MM-DD)
- Purpose: Returns the latest Azure DevOps release ID for a given pipeline definition and date.
- Returns: `{ releaseId, release }`

## /api/release-link
**GET**
- Parameters: `releaseId`
- Purpose: Returns a direct link to the Azure DevOps release for the given release ID.
- Returns: `{ link }`

## /api/release-description
**GET**
- Parameters: `releaseId`
- Purpose: Returns the description of the Azure DevOps release for the given release ID.
- Returns: `{ description }`

## /api/pipeline-status
**GET**
- Parameters: `releaseId`, `passCount?`, `failCount?`
- Purpose: Returns the status of the pipeline for the given release ID, optionally using test results.
- Returns: `{ status, raw }`
	- `status`: 'succeeded' | 'partially succeeded' | 'failed' | 'interrupted' | 'in progress' | 'No Run Found' | ...
	- `raw`: Full release details from Azure DevOps