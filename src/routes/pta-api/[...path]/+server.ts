/**
 * PTA API proxy — forwards all /pta-api/* requests to the PTA container
 * over the private VNet. The browser never touches the internal HTTP endpoint.
 *
 * Runtime env var (set in Azure App Settings, NOT a VITE_ variable):
 *   PTA_API_BASE   e.g. http://10.12.118.103:8000
 */
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const PTA_BASE = env.PTA_API_BASE ?? 'http://localhost:8000';

export const fallback: RequestHandler = async ({ request, params }) => {
    const targetUrl = `${PTA_BASE}/${params.path}`;

    // Forward only safe headers — don't leak Host or internal headers
    const upstream = new Headers();
    const ct = request.headers.get('content-type');
    if (ct) upstream.set('content-type', ct);
    const key = request.headers.get('x-api-key');
    if (key) upstream.set('x-api-key', key);

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

    const res = await fetch(targetUrl, {
        method: request.method,
        headers: upstream,
        body: hasBody ? request.body : undefined,
        // @ts-ignore — required for streaming request bodies in Node 18+
        duplex: 'half',
    });

    // Pass content-type through so SSE (text/event-stream) works correctly
    const resHeaders = new Headers();
    const resContentType = res.headers.get('content-type');
    if (resContentType) resHeaders.set('content-type', resContentType);
    resHeaders.set('cache-control', 'no-cache');

    return new Response(res.body, {
        status: res.status,
        headers: resHeaders,
    });
};
