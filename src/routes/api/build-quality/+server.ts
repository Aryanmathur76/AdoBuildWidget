import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getPipelineConfig } from '$lib/utils';

//Returns overall build quality for all configured pipelines for a given date
//The object returned is { date: 'YYYY-MM-DD', releaseIds: [id1, id2, ...], quality: 'good|ok|bad|in progress|unknown' }

// --- In-memory cache ---
type CacheEntry = { result: any, timestamp: number };
const cache: Record<string, CacheEntry> = {};
const CACHE_INTERVAL = 25 * 60 * 1000; // 25 minutes in ms

//list of releaseIds for the pipelines configured
const releaseIds: string[] = [];


// Totals across all pipelines with tests
let totalPassCount = 0;
let totalFailCount = 0;


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

function computeStatus(data: any) {
  const status = (data?.status ?? '').toString().toLowerCase();
  if (!status || status === 'no run found') {
    return 'unknown';
  } else if (status === 'succeeded') {
    return 'good';
  } else if (status === 'partially succeeded' || status === 'partiallySucceeded') {
    return 'ok';
  } else if (status === 'failed' || status === 'interrupted' || status === 'canceled' || status === 'rejected') {
    return 'bad';
  } else if (status === 'in progress' || status === 'inProgress' || status === 'active' || status === 'pending' || status === 'queued' || status === 'notStarted' || status === 'notDeployed') {
    return 'in progress';
  } else {
    return 'unknown';
  }
}

// Helper to fetch releaseId for a pipeline and date
async function fetchReleaseId(baseUrl: string, pipelineId: string, date: string): Promise<string> {
  try {
    const relRes = await fetch(`${baseUrl}/api/release-id?definitionId=${pipelineId}&date=${date}`);
    if (!relRes.ok) return '';
    const relData = await relRes.json();
    return relData?.releaseId ? relData.releaseId.toString() : '';
  } catch {
    return '';
  }
}


// --- Main Handler ---
export async function GET({ url, request }: { url: URL, request: Request }) {
  try {
    const date = url.searchParams.get('date');
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorJson('Invalid date format. Expected YYYY-MM-DD', 400);
    }

    // Check cache and return early if not expired
    const cached = checkCache(date);
    if (cached)
      return json(cached);

    //Load pipelines from env variable AZURE_PIPELINE_CONFIG
    let pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);

    // Dynamically determine the base URL for local api call
    let baseUrl = `http://${request.headers.get('host')}`;

    // Collect releaseIds for all pipelines
    for (const pipeline of pipelineConfig.pipelines) {
      const releaseId = await fetchReleaseId(baseUrl, pipeline.id, date);
      releaseIds.push(releaseId);
    }

    const statuses: string[] = [];


    for (const releaseId of releaseIds) {
      if (!releaseId) {
        statuses.push('unknown');
        continue;
      }
      // Fetch test-run results for this releaseId and date
      let passCount: number | null = null;
      let failCount: number | null = null;
      try {
        const testRunRes = await fetch(`${baseUrl}/api/test-run?releaseId=${releaseId}&date=${date}`);
        if (testRunRes.ok) {
          const testRunData = await testRunRes.json();
          if (typeof testRunData.passCount === 'number') passCount = testRunData.passCount;
          if (typeof testRunData.failCount === 'number') failCount = testRunData.failCount;
        }
      } catch {}

      // Track releases with tests and total pass/fail counts
      if ((passCount ?? 0) + (failCount ?? 0) > 0) {
        totalPassCount += passCount ?? 0;
        totalFailCount += failCount ?? 0;
      }

      // Relaese ipeline-status URL with test results as query params
      let pipelineStatusUrl = `${baseUrl}/api/pipeline-status?releaseId=${releaseId}`;
      if (passCount !== null) pipelineStatusUrl += `&passCount=${passCount}`;
      if (failCount !== null) pipelineStatusUrl += `&failCount=${failCount}`;
      const res = await fetch(pipelineStatusUrl);
      if (!res.ok) {
        statuses.push('unknown');
        continue;
      }
      const data = await res.json();

      statuses.push(computeStatus(data.status));
    }

    // Determine overall quality, prioritizing 'in progress' status
    let result: string = 'unknown';
    if (statuses.includes('in progress')) {
      result = 'in progress';
    } else {
      const totalTests = totalPassCount + totalFailCount;
      if (totalTests > 0) {
        const passRate = (totalPassCount / totalTests) * 100;
        if (passRate >= 95) {
          result = 'good';
        } else if (passRate >= 75) {
          result = 'ok';
        } else {
          result = 'bad';
        }
      }
    }
  const response = { date, releaseIds, quality: result, totalPassCount, totalFailCount };
    // Update cache
    cache[date] = { result: response, timestamp: Date.now() };
    return json(response);
  } catch (e: any) {
    if (e && typeof e === 'object' && 'error' in e && 'status' in e) {
      return errorJson(e.error, e.status);
    }
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching build quality', details: err.message }, { status: 500 });
  }
}
