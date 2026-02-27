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
        const allRecords = (timeline.records ?? [])
            .filter((r: any) => r.type === 'Stage' || r.type === 'Phase');

        // Group by order+name to collapse retries into a single stage entry
        const groups = new Map<string, any[]>();
        for (const r of allRecords) {
            const key = `${String(r.order ?? 999).padStart(4, '0')}:${r.name}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(r);
        }

        const stages = [...groups.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([_, recs]) => {
                const latest = recs.reduce((a: any, b: any) =>
                    (a.attempt ?? 1) >= (b.attempt ?? 1) ? a : b);
                const totalAttempts = Math.max(...recs.map((r: any) => r.attempt ?? 1));
                return {
                    name: latest.name,
                    status: mapTimelineState(latest.state, latest.result ?? null),
                    startTime: latest.startTime ?? null,
                    finishTime: latest.finishTime ?? null,
                    attempts: totalAttempts > 1 ? totalAttempts : null,
                };
            });

        return { stages };
    }, 30);

    return json(data);
}
