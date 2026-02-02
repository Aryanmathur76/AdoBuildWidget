import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getPipelineConfig} from '$lib/utils';
import { determineOverallDayQuality } from '$lib/utils/getOverallDayQuality';

//Returns overall day quality for all configured pipelines for a given date using constructBuild and constructRelease APIs
//The object returned is { date: 'YYYY-MM-DD', pipelineIds: [id1, id2, ...], quality: 'good|ok|bad|inProgress|unknown|interrupted' }

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
    const url = `${baseUrl}/api/constructRelease?date=${date}&releaseDefinitionId=${pipelineId}`;
    console.log(`[getDayQuality] Fetching release pipeline ${pipelineId} for date ${date}:`, url);
    
    const response = await fetch(url);
    console.log(`[getDayQuality] Release response status:`, response.status, response.statusText);
    
    if (!response.ok) {
      console.log(`[getDayQuality] Release fetch not ok, returning unknown`);
      return { id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 };
    }
    
    const releaseData = await response.json();
    console.log(`[getDayQuality] Release data received:`, releaseData);
    
    // Handle null response (no releases found for this date)
    if (releaseData === null) {
      console.log(`[getDayQuality] Release data is null, returning unknown`);
      return { id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 };
    }
    
    const result = {
      id: pipelineId,
      status: releaseData.status || 'unknown',
      passCount: releaseData.passedTestCount ?? 0,
      failCount: releaseData.failedTestCount ?? 0
    };
    console.log(`[getDayQuality] Release result:`, result);
    return result;
  } catch (error) {
    console.error(`[getDayQuality] Error fetching release pipeline ${pipelineId}:`, error);
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
    const url = `${baseUrl}/api/constructBuild?date=${date}&buildDefinitionId=${pipelineId}`;
    console.log(`[getDayQuality] Fetching build pipeline ${pipelineId} for date ${date}:`, url);
    
    const response = await fetch(url);
    console.log(`[getDayQuality] Build response status:`, response.status, response.statusText);
    
    if (!response.ok) {
      console.log(`[getDayQuality] Build fetch not ok, returning unknown`);
      return [{ id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 }];
    }
    
    const buildDataArray = await response.json();
    console.log(`[getDayQuality] Build data received:`, buildDataArray);
    
    // constructBuild returns an array of builds
    if (!Array.isArray(buildDataArray) || buildDataArray.length === 0) {
      console.log(`[getDayQuality] Build data array is empty, returning unknown`);
      return [{ id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 }];
    }
    
    const results = buildDataArray.map(buildData => ({
      id: pipelineId,
      status: buildData.status || 'unknown',
      passCount: buildData.passedTestCount ?? 0,
      failCount: buildData.failedTestCount ?? 0
    }));
    console.log(`[getDayQuality] Build results:`, results);
    return results;
  } catch (error) {
    console.error(`[getDayQuality] Error fetching build pipeline ${pipelineId}:`, error);
    return [{ id: pipelineId, status: 'unknown', passCount: 0, failCount: 0 }];
  }
}

// --- Main Handler ---
export async function GET({ url, request }: { url: URL, request: Request }) {
  try {
    const date = url.searchParams.get('date');
    console.log(`[getDayQuality] GET request for date:`, date);
    
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.log(`[getDayQuality] Invalid date format`);
      return errorJson('Invalid date format. Expected YYYY-MM-DD', 400);
    }

    // Check cache and return early if not expired
    const cached = checkCache(date);
    if (cached) {
      console.log(`[getDayQuality] Cache hit for date`, date);
      return json(cached);
    }
    console.log(`[getDayQuality] Cache miss for date`, date);

    // Initialize variables for this request
    const pipelineIds: string[] = [];
    let totalPassCount = 0;
    let totalFailCount = 0;
    const statuses: string[] = [];

    // Load pipelines from env variable AZURE_PIPELINE_CONFIG
    let pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);
    console.log(`[getDayQuality] Pipeline config:`, pipelineConfig);
    
    // Dynamically determine the base URL for local api call
    let baseUrl = `http://${request.headers.get('host')}`;
    console.log(`[getDayQuality] Base URL:`, baseUrl);

    // Process all pipelines
    for (const pipeline of pipelineConfig.pipelines) {
      console.log(`[getDayQuality] Processing pipeline:`, pipeline.id, pipeline.type);
      pipelineIds.push(pipeline.id);
      
      if (pipeline.type === 'build') {
        const buildResults = await fetchBuildPipeline(baseUrl, pipeline.id, date);
        
        for (const buildResult of buildResults) {
          console.log(`[getDayQuality] Build result status:`, buildResult.status);
          statuses.push(buildResult.status);
          totalPassCount += buildResult.passCount;
          totalFailCount += buildResult.failCount;
        }
      } else if (pipeline.type === 'release') {
        const releaseResult = await fetchReleasePipeline(baseUrl, pipeline.id, date);
        console.log(`[getDayQuality] Release result status:`, releaseResult.status);
        
        statuses.push(releaseResult.status);
        totalPassCount += releaseResult.passCount;
        totalFailCount += releaseResult.failCount;
      }
    }

    // Determine overall quality
    console.log(`[getDayQuality] Statuses:`, statuses);
    const result = determineOverallDayQuality(statuses);
    console.log(`[getDayQuality] Overall quality result:`, result);
    
    const response = { 
      date, 
      pipelineIds, 
      quality: result, 
      totalPassCount, 
      totalFailCount 
    };
    console.log(`[getDayQuality] Final response:`, response);
    
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
