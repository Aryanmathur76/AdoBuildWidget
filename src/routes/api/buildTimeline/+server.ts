import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';
import { getOrSetDailyTestCache } from '$lib/utils/dailyTestCache';

function mapTimelineState(state: string, result: string | null): string {
    if (state === 'inProgress') return 'inProgress';
    if (state === 'pending') return 'notStarted';
    if (state === 'completed') {
        if (result === 'succeeded') return 'succeeded';
        if (result === 'failed') return 'failed';
        if (result === 'canceled') return 'canceled';
        if (result === 'skipped') return 'notStarted';
        if (result === 'partiallySucceeded') return 'partiallySucceeded';
    }
    return 'notStarted';
}

export async function GET({ url }: { url: URL }) {
    const buildId = url.searchParams.get('buildId');
    if (!buildId || !/^\d+$/.test(buildId)) {
        return json({ error: 'Invalid or missing buildId (numeric string required)' }, { status: 400 });
    }

    const cacheKey = `buildTimeline:${buildId}`;
    const data = await getOrSetDailyTestCache(cacheKey, async () => {
        let organization: string, project: string, pat: string;
        try {
            const envVars = getAzureDevOpsEnvVars(env);
            organization = envVars.AZURE_DEVOPS_ORGANIZATION;
            project = envVars.AZURE_DEVOPS_PROJECT;
            pat = envVars.AZURE_DEVOPS_PAT;
        } catch {
            return { stages: [] };
        }

        const res = await fetch(
            `https://dev.azure.com/${organization}/${project}/_apis/build/builds/${buildId}/timeline?api-version=7.1`,
            { headers: { Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}` } }
        );
        if (!res.ok) return { stages: [] };

        const timeline = await res.json();
        const stages = (timeline.records ?? [])
            .filter((r: any) => r.type === 'Stage' || r.type === 'Phase')
            .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999))
            .map((r: any) => ({
                name: r.name,
                status: mapTimelineState(r.state, r.result ?? null),
                startTime: r.startTime ?? null,
                finishTime: r.finishTime ?? null,
            }));

        return { stages };
    }, 30);

    return json(data);
}
