import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getPipelineConfig} from '$lib/utils';
import { determineOverallDayQuality } from '$lib/utils/getOverallDayQuality';
import { getOrSetDailyTestCache } from '$lib/utils/dailyTestCache';

//Returns overall day quality for all configured pipelines for a given date using constructBuild and constructRelease APIs
//The object returned is { date: 'YYYY-MM-DD', pipelineIds: [id1, id2, ...], quality: 'good|ok|bad|inProgress|unknown|interrupted' }

function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

// Helper to fetch release pipeline data
async function fetchReleasePipeline(baseUrl: string, pipelineId: string, date: string): Promise<{
  id: string,
  status: string,
  passCount: number,
  failCount: number,
  notRunCount: number
}> {
  try {
    const response = await fetch(`${baseUrl}/api/constructRelease?date=${date}&releaseDefinitionId=${pipelineId}`);
    if (!response.ok) {
      return { id: pipelineId, status: 'unknown', passCount: 0, failCount: 0, notRunCount: 0 };
    }

    const releaseData = await response.json();

    // Handle null response (no releases found for this date)
    if (releaseData === null) {
      return { id: pipelineId, status: 'unknown', passCount: 0, failCount: 0, notRunCount: 0 };
    }

    return {
      id: pipelineId,
      status: releaseData.status || 'unknown',
      passCount: releaseData.passedTestCount ?? 0,
      failCount: releaseData.failedTestCount ?? 0,
      notRunCount: releaseData.notRunTestCount ?? 0
    };
  } catch (error) {
    console.error(`Error fetching release pipeline ${pipelineId}:`, error);
    return { id: pipelineId, status: 'unknown', passCount: 0, failCount: 0, notRunCount: 0 };
  }
}

// Helper to fetch build pipeline data
async function fetchBuildPipeline(baseUrl: string, pipelineId: string, date: string): Promise<{
  id: string,
  status: string,
  passCount: number,
  failCount: number,
  notRunCount: number
}[]> {
  try {
    const response = await fetch(`${baseUrl}/api/constructBuild?date=${date}&buildDefinitionId=${pipelineId}`);
    if (!response.ok) {
      return [{ id: pipelineId, status: 'unknown', passCount: 0, failCount: 0, notRunCount: 0 }];
    }

    const buildDataArray = await response.json();

    // constructBuild returns an array of builds
    if (!Array.isArray(buildDataArray) || buildDataArray.length === 0) {
      return [{ id: pipelineId, status: 'unknown', passCount: 0, failCount: 0, notRunCount: 0 }];
    }

    return buildDataArray.map(buildData => ({
      id: pipelineId,
      status: buildData.status || 'unknown',
      passCount: buildData.passedTestCount ?? 0,
      failCount: buildData.failedTestCount ?? 0,
      notRunCount: buildData.notRunTestCount ?? 0
    }));
  } catch (error) {
    console.error(`Error fetching build pipeline ${pipelineId}:`, error);
    return [{ id: pipelineId, status: 'unknown', passCount: 0, failCount: 0, notRunCount: 0 }];
  }
}

// --- Main Handler ---
export async function GET({ url, request }: { url: URL, request: Request }) {
  try {
    const date = url.searchParams.get('date');

    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorJson('Invalid date format. Expected YYYY-MM-DD', 400);
    }

    // Load pipelines from env variable AZURE_PIPELINE_CONFIG
    let pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);

    // Dynamically determine the base URL for local api call
    let baseUrl = `http://${request.headers.get('host')}`;

    const response = await getOrSetDailyTestCache(`dayquality:${date}`, async () => {
      const pipelineIds: string[] = [];
      let totalPassCount = 0;
      let totalFailCount = 0;
      let totalNotRunCount = 0;
      const statuses: string[] = [];

      // Fetch all pipelines in parallel
      const settled = await Promise.allSettled(
        pipelineConfig.pipelines.map(pipeline =>
          pipeline.type === 'build'
            ? fetchBuildPipeline(baseUrl, pipeline.id, date)
                .then(results => ({ pipeline, type: 'build' as const, results }))
            : fetchReleasePipeline(baseUrl, pipeline.id, date)
                .then(result  => ({ pipeline, type: 'release' as const, result }))
        )
      );

      for (const outcome of settled) {
        if (outcome.status === 'rejected') continue;
        const v = outcome.value;
        pipelineIds.push(v.pipeline.id);
        if (v.type === 'build') {
          for (const r of v.results) {
            statuses.push(r.status);
            totalPassCount  += r.passCount;
            totalFailCount  += r.failCount;
            totalNotRunCount += r.notRunCount;
          }
        } else {
          statuses.push(v.result.status);
          totalPassCount  += v.result.passCount;
          totalFailCount  += v.result.failCount;
          totalNotRunCount += v.result.notRunCount;
        }
      }

      // Determine overall quality
      const result = determineOverallDayQuality(statuses);

      return {
        date,
        pipelineIds,
        quality: result,
        totalPassCount,
        totalFailCount,
        totalNotRunCount
      };
    }, 25 * 60);

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
