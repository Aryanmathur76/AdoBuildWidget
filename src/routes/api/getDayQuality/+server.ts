import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getPipelineConfig} from '$lib/utils';
import { determineOverallDayQuality } from '$lib/utils/getOverallDayQuality';

//Returns overall day quality for all configured pipelines for a given date using constructBuild and constructRelease APIs
//The object returned is { date: 'YYYY-MM-DD', pipelineIds: [id1, id2, ...], quality: 'good|ok|bad|in progress|unknown|interrupted' }

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

// Helper to fetch release pipeline data
async function fetchReleasePipeline(baseUrl: string, pipelineId: string, date: string): Promise<{
  id: string,
  status: string,
  passCount: number,
  failCount: number
}> {
  try {
    const response = await fetch(`${baseUrl}/api/constructRelease?date=${date}&releaseDefinitionId=${pipelineId}`);
    if (!response.ok) {
      return { id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 };
    }
    
    const releaseData = await response.json();
    
    return {
      id: pipelineId,
      status: releaseData.status || 'unknown',
      passCount: releaseData.passedTestCount ?? 0,
      failCount: releaseData.failedTestCount ?? 0
    };
  } catch (error) {
    console.error(`Error fetching release pipeline ${pipelineId}:`, error);
    return { id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 };
  }
}

// Helper to fetch build pipeline data
async function fetchBuildPipeline(baseUrl: string, pipelineId: string, date: string): Promise<{
  id: string,
  status: string,
  passCount: number,
  failCount: number
}[]> {
  try {
    const response = await fetch(`${baseUrl}/api/constructBuild?date=${date}&buildDefinitionId=${pipelineId}`);
    if (!response.ok) {
      return [{ id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 }];
    }
    
    const buildDataArray = await response.json();
    
    // constructBuild returns an array of builds
    if (!Array.isArray(buildDataArray) || buildDataArray.length === 0) {
      return [{ id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 }];
    }
    
    return buildDataArray.map(buildData => ({
      id: pipelineId,
      status: buildData.status || 'unknown',
      passCount: buildData.passedTestCount ?? 0,
      failCount: buildData.failedTestCount ?? 0
    }));
  } catch (error) {
    console.error(`Error fetching build pipeline ${pipelineId}:`, error);
    return [{ id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 }];
  }
}

// --- Main Handler ---
export async function GET({ url, request }: { url: URL, request: Request }) {
  try {
    const date = url.searchParams.get('date');
    console.log(`[getDayQuality] Fetching day quality for date: ${date}`);
    
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorJson('Invalid date format. Expected YYYY-MM-DD', 400);
    }

    // Check cache and return early if not expired
    const cached = checkCache(date);
    if (cached) {
      console.log(`[getDayQuality] Returning cached result for ${date}`);
      return json(cached);
    }

    // Initialize variables for this request
    const pipelineIds: string[] = [];
    let totalPassCount = 0;
    let totalFailCount = 0;
    const statuses: string[] = [];

    // Load pipelines from env variable AZURE_PIPELINE_CONFIG
    let pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);
    console.log(`[getDayQuality] Loaded pipeline config:`, pipelineConfig);
    
    // Dynamically determine the base URL for local api call
    let baseUrl = `http://${request.headers.get('host')}`;

    // Process all pipelines
    for (const pipeline of pipelineConfig.pipelines) {
      pipelineIds.push(pipeline.id);
      
      if (pipeline.type === 'build') {
        const buildResults = await fetchBuildPipeline(baseUrl, pipeline.id, date);
        
        for (const buildResult of buildResults) {
          statuses.push(buildResult.status);
          totalPassCount += buildResult.passCount;
          totalFailCount += buildResult.failCount;
        }
      } else if (pipeline.type === 'release') {
        const releaseResult = await fetchReleasePipeline(baseUrl, pipeline.id, date);
        
        statuses.push(releaseResult.status);
        totalPassCount += releaseResult.passCount;
        totalFailCount += releaseResult.failCount;
      }
    }

    // Determine overall quality
    const result = determineOverallDayQuality(statuses);
    console.log(`[getDayQuality] Result for ${date}:`, { 
      date, 
      pipelineIds, 
      quality: result, 
      totalPassCount, 
      totalFailCount,
      statuses 
    });
    
    const response = { 
      date, 
      pipelineIds, 
      quality: result, 
      totalPassCount, 
      totalFailCount 
    };
    
    // Update cache
    cache[date] = { result: response, timestamp: Date.now() };
    
    return json(response);
  } catch (e: any) {
    // Always log errors
    console.error(`[getDayQuality] Error:`, e);
    if (e && typeof e === 'object' && 'error' in e && 'status' in e) {
      return errorJson(e.error, e.status);
    }
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching day quality', details: err.message }, { status: 500 });
  }
}
