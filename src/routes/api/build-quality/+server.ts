import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

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
    const statuses: string[] = [];
    for (const pipeline of pipelineConfig.pipelines) {
      const res = await fetch(`${baseUrl}/api/pipeline-status?definitionId=${pipeline.id}&date=${date}`);
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

    // Determine overall quality
    let result: string = 'unknown';
    if (statuses.length > 0) {
      if (statuses.every(s => s === 'good')) {
        result = 'good';
      } else if (statuses.some(s => s === 'bad')) {
        result = 'bad';
      } else if (statuses.some(s => s === 'ok')) {
        result = 'ok';
      } else if (statuses.some(s => s === 'in progress')) {
        result = 'in progress';
      } else if (statuses.every(s => s === 'unknown')) {
        result = 'unknown';
      }
    }
    return json({ date, quality: result });
  } catch (e: any) {
    if (e && typeof e === 'object' && 'error' in e && 'status' in e) {
      return errorJson(e.error, e.status);
    }
    const err = e instanceof Error ? e : { message: String(e) };
    return json({ error: 'Error fetching build quality', details: err.message }, { status: 500 });
  }
}
