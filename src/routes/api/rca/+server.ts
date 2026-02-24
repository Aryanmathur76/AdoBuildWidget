import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function GET({ url }: { url: URL }) {
    const releaseId = url.searchParams.get('releaseId');

    if (!releaseId || !/^\d+$/.test(releaseId)) {
        return json({ error: 'Invalid or missing releaseId' }, { status: 400 });
    }

    const connectionString = env.AZURE_STORAGE_CONNECTION_STRING;
    const tableName = env.AZURE_STORAGE_TABLE_NAME ?? 'ptaanalyses';
    const containerName = env.AZURE_STORAGE_CONTAINER_NAME ?? 'pta-analyses';

    if (!connectionString) {
        return json({ rca: null });
    }

    try {
        const { TableClient } = await import('@azure/data-tables');
        const { BlobServiceClient } = await import('@azure/storage-blob');

        const tableClient = TableClient.fromConnectionString(connectionString, tableName);

        // Scan for entity with matching release_id property
        let entity: Record<string, unknown> | null = null;
        const iter = tableClient.listEntities<Record<string, unknown>>({
            queryOptions: { filter: `release_id eq '${releaseId}'` }
        });
        for await (const e of iter) {
            entity = e;
            break; // Take first match
        }

        if (!entity) {
            return json({ rca: null });
        }

        // Fetch full markdown content from blob storage
        let fullContent: string | null = null;
        const blobName = entity.blob_name as string | undefined;
        if (blobName) {
            try {
                const blobClient = BlobServiceClient
                    .fromConnectionString(connectionString)
                    .getContainerClient(containerName)
                    .getBlobClient(blobName);

                const download = await blobClient.download(0);
                const stream = download.readableStreamBody;
                if (stream) {
                    const chunks: Buffer[] = [];
                    for await (const chunk of stream as AsyncIterable<Buffer>) {
                        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                    }
                    fullContent = Buffer.concat(chunks).toString('utf-8');
                }
            } catch {
                // Blob unavailable — summary alone is sufficient
            }
        }

        return json({
            rca: {
                summary: entity.summary as string | undefined,
                environment: entity.environment as string | undefined,
                timestamp: entity.timestamp as string | undefined,
                pipeline_name: entity.pipeline_name as string | undefined,
                fullContent
            }
        });
    } catch (e: unknown) {
        console.error('RCA fetch error:', e instanceof Error ? e.message : e);
        return json({ rca: null });
    }
}
