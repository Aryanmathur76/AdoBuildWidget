import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

//Returns overall build quality for all configured pipelines for a given date
//The object returned is { date: 'YYYY-MM-DD', releaseIds: [id1, id2, ...], quality: 'good|ok|bad|in progress|unknown' }


// --- In-memory cache ---
type CacheEntry = { result: any, timestamp: number };
const cache: Record<string, CacheEntry> = {};
const CACHE_INTERVAL = 10 * 60 * 1000; // 10 minutes in ms

// --- Types ---
interface Release {
  id: number;
  createdOn: string;
  status?: string;
  environments?: Environment[];
  [key: string]: any;
}
interface Environment {
  status: string;
  [key: string]: any;
}

function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}


// --- Main Handler ---
export async function GET({ url, request }: { url: URL, request: Request }) {
  try {
    const date = url.searchParams.get('date');
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorJson('Invalid date format. Expected YYYY-MM-DD', 400);
    }

    // Check cache
    const cacheKey = date;
    const now = Date.now();
    if (cache[cacheKey] && (now - cache[cacheKey].timestamp < CACHE_INTERVAL)) {
      return json(cache[cacheKey].result);
    }

    const pipelineConfigRaw = env.PUBLIC_AZURE_PIPELINE_CONFIG;
    if (!pipelineConfigRaw) {
      return errorJson('Missing pipeline config', 500);
    }
    let pipelineConfig;
    try {
      pipelineConfig = JSON.parse(pipelineConfigRaw);
    } catch (e) {
      return errorJson('Failed to parse pipeline config', 500);
    }
    if (!pipelineConfig.pipelines || !Array.isArray(pipelineConfig.pipelines)) {
      return errorJson('No pipelines configured', 500);
    }

    // Dynamically determine the base URL for local fetch
    let baseUrl = '';
    if (url.origin) {
      baseUrl = url.origin;
    } else if (request.headers.get('host')) {
      baseUrl = `http://${request.headers.get('host')}`;
    }

    // For each pipeline, get the releaseId for this date
    const releaseIds: string[] = [];
    for (const pipeline of pipelineConfig.pipelines) {
      const relRes = await fetch(`${baseUrl}/api/release-id?definitionId=${pipeline.id}&date=${date}`);
      if (!relRes.ok) {
        releaseIds.push('');
        continue;
      }
      const relData = await relRes.json();
      if (relData && relData.releaseId) {
        releaseIds.push(relData.releaseId.toString());
      } else {
        releaseIds.push('');
      }
    }

  const statuses: string[] = [];
  let releasesWithTestsRan = 0;
  let totalPassCount = 0;
  let totalFailCount = 0;
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
        releasesWithTestsRan++;
        totalPassCount += passCount ?? 0;
        totalFailCount += failCount ?? 0;
      }

      // Build pipeline-status URL with test results as query params
      let pipelineStatusUrl = `${baseUrl}/api/pipeline-status?releaseId=${releaseId}`;
      if (passCount !== null) pipelineStatusUrl += `&passCount=${passCount}`;
      if (failCount !== null) pipelineStatusUrl += `&failCount=${failCount}`;
      const res = await fetch(pipelineStatusUrl);
      if (!res.ok) {
        statuses.push('unknown');
        continue;
      }
      const data = await res.json();
      let status = data.status;
      if (!status || status === 'No Run Found') {
        statuses.push('unknown');
      } else if (status === 'succeeded') {
        statuses.push('good');
      } else if (status === 'partially succeeded' || status === 'partiallySucceeded') {
        statuses.push('ok');
      } else if (status === 'failed' || status === 'interrupted' || status === 'canceled' || status === 'rejected') {
        statuses.push('bad');
      } else if (status === 'in progress' || status === 'inProgress' || status === 'active' || status === 'pending' || status === 'queued' || status === 'notStarted' || status === 'notDeployed') {
        statuses.push('in progress');
      } else {
        statuses.push('unknown');   
      }
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
  const response = { date, releaseIds, quality: result, releasesWithTestsRan, totalPassCount, totalFailCount };
    // Update cache
    cache[cacheKey] = { result: response, timestamp: now };
    return json(response);
  } catch (e: any) {
    if (e && typeof e === 'object' && 'error' in e && 'status' in e) {
      return errorJson(e.error, e.status);
    }
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching build quality', details: err.message }, { status: 500 });
  }
}
