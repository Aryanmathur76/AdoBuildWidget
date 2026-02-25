import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getPipelineConfig } from '$lib/utils';
import { determineOverallDayQuality } from '$lib/utils/getOverallDayQuality';
import { getOrSetDailyTestCache } from '$lib/utils/dailyTestCache';

// Returns per-pipeline context for a given date, including today's run IDs.
// Used by PTAChat to inject context and generate suggestion chips.

function errorJson(error: string, status = 500) {
  return json({ error }, { status });
}

// Helper to fetch release pipeline data with run ID and name
async function fetchReleasePipeline(baseUrl: string, pipelineId: string, date: string): Promise<{
  status: string;
  todayRunId: number | null;
  todayRunName: string | null;
}> {
  try {
    const response = await fetch(`${baseUrl}/api/constructRelease?date=${date}&releaseDefinitionId=${pipelineId}`);
    if (!response.ok) {
      return { status: 'unknown', todayRunId: null, todayRunName: null };
    }

    const releaseData = await response.json();

    if (releaseData === null) {
      return { status: 'unknown', todayRunId: null, todayRunName: null };
    }

    return {
      status: releaseData.status || 'unknown',
      todayRunId: releaseData.id ?? null,
      todayRunName: releaseData.name ?? null,
    };
  } catch (error) {
    console.error(`[getTodayContext] Error fetching release pipeline ${pipelineId}:`, error);
    return { status: 'unknown', todayRunId: null, todayRunName: null };
  }
}

// Helper to fetch build pipeline data with run ID and name (uses first/latest build)
async function fetchBuildPipeline(baseUrl: string, pipelineId: string, date: string): Promise<{
  status: string;
  todayRunId: number | null;
  todayRunName: string | null;
}> {
  try {
    const response = await fetch(`${baseUrl}/api/constructBuild?date=${date}&buildDefinitionId=${pipelineId}`);
    if (!response.ok) {
      return { status: 'unknown', todayRunId: null, todayRunName: null };
    }

    const buildDataArray = await response.json();

    if (!Array.isArray(buildDataArray) || buildDataArray.length === 0) {
      return { status: 'unknown', todayRunId: null, todayRunName: null };
    }

    const first = buildDataArray[0];
    return {
      status: first.status || 'unknown',
      todayRunId: first.id ?? null,
      todayRunName: first.name ?? null,
    };
  } catch (error) {
    console.error(`[getTodayContext] Error fetching build pipeline ${pipelineId}:`, error);
    return { status: 'unknown', todayRunId: null, todayRunName: null };
  }
}

// --- Main Handler ---
export async function GET({ url, request }: { url: URL; request: Request }) {
  try {
    const date = url.searchParams.get('date');

    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorJson('Invalid date format. Expected YYYY-MM-DD', 400);
    }

    const pipelineConfig = getPipelineConfig(env.PUBLIC_AZURE_PIPELINE_CONFIG);
    const baseUrl = `http://${request.headers.get('host')}`;

    const response = await getOrSetDailyTestCache(`todaycontext:${date}`, async () => {
      const settled = await Promise.allSettled(
        pipelineConfig.pipelines.map(pipeline =>
          pipeline.type === 'build'
            ? fetchBuildPipeline(baseUrl, pipeline.id, date)
                .then(result => ({ pipeline, result }))
            : fetchReleasePipeline(baseUrl, pipeline.id, date)
                .then(result => ({ pipeline, result }))
        )
      );

      const pipelines = settled
        .filter(o => o.status === 'fulfilled')
        .map(o => {
          const { pipeline, result } = (o as PromiseFulfilledResult<{
            pipeline: { id: string; displayName: string; type: string };
            result: { status: string; todayRunId: number | null; todayRunName: string | null };
          }>).value;

          const quality = determineOverallDayQuality([result.status]);

          return {
            id: pipeline.id,
            displayName: pipeline.displayName,
            type: pipeline.type,
            quality,
            todayRunId: result.todayRunId,
            todayRunName: result.todayRunName,
          };
        });

      return { date, pipelines };
    }, 2 * 60);

    return json(response);
  } catch (e: any) {
    console.error(`[getTodayContext] Error:`, e);
    if (e && typeof e === 'object' && 'error' in e && 'status' in e) {
      return errorJson(e.error, e.status);
    }
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching today context', details: err.message }, { status: 500 });
  }
}
