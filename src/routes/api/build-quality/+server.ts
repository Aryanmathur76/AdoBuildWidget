import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getPipelineConfig, successThreshold, partiallySucceededThreshold } from '$lib/utils';

//Returns overall build quality for all configured pipelines for a given date
//The object returned is { date: 'YYYY-MM-DD', pipelineIds: [id1, id2, ...], quality: 'good|ok|bad|in progress|unknown' }

// --- In-memory cache ---
type CacheEntry = { result: any, timestamp: number };
const cache: Record<string, CacheEntry> = {};
const CACHE_INTERVAL = 25 * 60 * 1000; // 25 minutes in ms

function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

function checkCache(key: string): any | null {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp < CACHE_INTERVAL) {
    return entry.result;
  }
  return null;
}

// Helper to compute status based on pass/fail counts
function computeStatus(passCount: number | null, failCount: number | null): string {
  const totalTests = (passCount ?? 0) + (failCount ?? 0);
  
  if (totalTests === 0) {
    return 'unknown';
  }
  
  const passRate = ((passCount ?? 0) / totalTests) * 100;
  
  if (passRate >= successThreshold) {
    return 'good';
  } else if (passRate >= partiallySucceededThreshold) {
    return 'ok';
  } else {
    return 'bad';
  }
}

// Helper to fetch releaseId for a pipeline and date
async function fetchReleaseId(baseUrl: string, pipelineId: string, date: string): Promise<string> {
  try {
    const relRes = await fetch(`${baseUrl}/api/release-id?definitionId=${pipelineId}&date=${date}`);
    if (!relRes.ok) {
      return '';
    }
    const relData = await relRes.json();
    const releaseId = relData?.releaseId ? relData.releaseId.toString() : '';
    return releaseId;
  } catch (error) {
    return '';
  }
}

async function fetchBuildId(baseUrl: string, pipelineId: string, date: string): Promise<string> {
  try {
    const buildRes = await fetch(`${baseUrl}/api/build-id?definitionId=${pipelineId}&date=${date}`);
    if (!buildRes.ok) {
      return '';
    }
    const buildData = await buildRes.json();
    const buildId = buildData?.buildId ? buildData.buildId.toString() : '';
    return buildId;
  } catch (error) {
    return '';
  }
}

// Helper to fetch test-run results for a pipeline run
async function fetchTestRunResults(baseUrl: string, pipelineId: string, pipelineType: string, date: string): Promise<{ passCount: number | null, failCount: number | null }> {
  try {
    const testRunRes = await fetch(`${baseUrl}/api/test-run?pipelineId=${pipelineId}&pipelineType=${pipelineType}&date=${date}`);
    if (testRunRes.ok) {
      const testRunData = await testRunRes.json();
      const passCount = typeof testRunData.passCount === 'number' ? testRunData.passCount : null;
      const failCount = typeof testRunData.failCount === 'number' ? testRunData.failCount : null;
      return { passCount, failCount };
    }
  } catch (error) {
    // Silent error handling
  }
  return { passCount: null, failCount: null };
}

// Helper to fetch pipeline status with test results
async function fetchPipelineStatus(baseUrl: string, pipelineId: string, pipelineType: string, passCount: number | null, failCount: number | null): Promise<string> {
  try {
    let pipelineStatusUrl = `${baseUrl}/api/pipeline-status?pipelineId=${pipelineId}&pipelineType=${pipelineType}`;
    if (passCount !== null) pipelineStatusUrl += `&passCount=${passCount}`;
    if (failCount !== null) pipelineStatusUrl += `&failCount=${failCount}`;
    
    const res = await fetch(pipelineStatusUrl);
    if (!res.ok) {
      return 'unknown';
    }
    const data = await res.json();
    
    // Check if pipeline is in progress first
    const pipelineStatus = (data.status ?? '').toString().toLowerCase();
    if (pipelineStatus === 'in progress') {
      return 'in progress';
    }

    if (pipelineStatus === 'interrupted') {
      return 'interrupted';
    }

    if ((pipelineStatus === 'failed') && passCount === 0 && failCount === 0) {
      return 'failed';
    }
    
    // Use test results to determine status
    return computeStatus(passCount, failCount);
  } catch (error) {
    return 'unknown';
  }
}

// Helper to determine overall quality based on statuses and test results
function determineOverallDayQuality(statuses: string[], totalPassCount: number, totalFailCount: number): string {
  // Prioritize 'in progress' status
  if (statuses.includes('in progress')) {
    return 'in progress';
  }

  if (statuses.includes('interrupted')) {
    console.log("interrupted");
    return 'interrupted';
  }
    
  const totalTests = totalPassCount + totalFailCount;
  
  if (totalTests > 0) {
    const passRate = (totalPassCount / totalTests) * 100;
    if ((passRate >= successThreshold) && !statuses.includes('failed')) {
      return 'good';
    } else if (passRate >= successThreshold){
      return 'ok';
    } else if (passRate >= partiallySucceededThreshold) {
      return 'ok';
    } else if (passRate < partiallySucceededThreshold) {
      return 'bad';
    } else {
      return 'unknown';
    }
  } else {
    if (statuses.includes('failed') || statuses.includes('interrupted')) {
    return 'bad';
    }
    else{
      return 'unknown';
    }
  }
}


// --- Main Handler ---
export async function GET({ url, request }: { url: URL, request: Request }) {
  try {
    const date = url.searchParams.get('date');
    console.log(`[build-quality] Fetching build quality for date: ${date}`);
    
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorJson('Invalid date format. Expected YYYY-MM-DD', 400);
    }

    // Check cache and return early if not expired
    const cached = checkCache(date);
    if (cached) {
      return json(cached);
    }

  // Initialize variables for this request (avoiding global state accumulation)
  const pipelineIds: Array<["build"|"release", string]> = [];
    let totalPassCount = 0;
    let totalFailCount = 0;

    //Load pipelines from env variable AZURE_PIPELINE_CONFIG
    let pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);
    console.log(`[build-quality] Loaded pipeline config:`, pipelineConfig);
    // Dynamically determine the base URL for local api call
    let baseUrl = `http://${request.headers.get('host')}`;

    // Collect pipelineIds / buildIds for all pipelines
    for (const pipeline of pipelineConfig.pipelines) {
      if (pipeline.type == 'build') {
        const buildId = await fetchBuildId(baseUrl, pipeline.id, date);
        pipelineIds.push(["build", buildId]);
      }
      else if (pipeline.type == 'release') {
        console.log('Fetching releaseId for pipeline:', pipeline);
        const releaseId = await fetchReleaseId(baseUrl, pipeline.id, date);
        pipelineIds.push(["release", releaseId]);
      }
    }

    const statuses: string[] = [];

    for (const [type, id] of pipelineIds) {
      if (!id) {
        statuses.push('unknown');
        continue;
      }
      // Fetch test-run results for this id and date
      const { passCount, failCount } = await fetchTestRunResults(baseUrl, id, type, date);

      // Track releases/builds with tests and total pass/fail counts
      if ((passCount ?? 0) + (failCount ?? 0) > 0) {
        totalPassCount += passCount ?? 0;
        totalFailCount += failCount ?? 0;
      }

      // Fetch pipeline status
      const computedStatus = await fetchPipelineStatus(baseUrl, id, type, passCount, failCount);
      statuses.push(computedStatus);
    }

    // Determine overall quality
    const result = determineOverallDayQuality(statuses, totalPassCount, totalFailCount);
    console.log(`[build-quality] Result for ${date}:`, { date, pipelineIds, quality: result, totalPassCount, totalFailCount });
    console.log(statuses);
    
  const response = { date, pipelineIds, quality: result, totalPassCount, totalFailCount };
    
    // Update cache
    cache[date] = { result: response, timestamp: Date.now() };
    
    return json(response);
  } catch (e: any) {
    // Always log errors
    console.error(`[build-quality] Error:`, e);
    if (e && typeof e === 'object' && 'error' in e && 'status' in e) {
      return errorJson(e.error, e.status);
    }
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching build quality', details: err.message }, { status: 500 });
  }
}
