import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAzureDevOpsEnvVars } from '$lib/utils';

function encodePat(pat: string) {
  try {
    return btoa(':' + pat);
  } catch (e) {
    return Buffer.from(':' + pat).toString('base64');
  }
}

export async function GET({ url }: { url: URL }) {
  try {
    let AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT;
    try {
      ({ AZURE_DEVOPS_ORGANIZATION, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT } = getAzureDevOpsEnvVars(env));
    } catch (e: any) {
      return json({ error: e.message || 'Missing Azure DevOps environment variables' }, { status: 500 });
    }

    const runId = url.searchParams.get('runId');
    if (!runId) {
      return json({ error: 'Missing runId parameter' }, { status: 400 });
    }

    const allTestCases: any[] = [];
    let skip = 0;
    const top = 1000;
    let hasMore = true;

    while (hasMore) {
      const endpoint = `https://dev.azure.com/${AZURE_DEVOPS_ORGANIZATION}/${AZURE_DEVOPS_PROJECT}/_apis/test/Runs/${runId}/results?$top=${top}&$skip=${skip}&api-version=7.1`;
      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Basic ${encodePat(AZURE_DEVOPS_PAT)}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        return json({ error: 'Failed to fetch test run results', details: await res.text() }, { status: res.status });
      }

      const data = await res.json();
      if (Array.isArray(data.value)) {
        allTestCases.push(...data.value.map((tc: any) => ({
          id: tc.id,
          name: tc.testCase?.name || tc.testCaseTitle || '',
          outcome: tc.outcome,
          associatedBugs: tc.associatedBugs || [],
          startedDate: tc.startedDate,
          completedDate: tc.completedDate,
        })));
        if (data.value.length < top) {
          hasMore = false;
        } else {
          skip += top;
        }
      } else {
        hasMore = false;
      }
    }

    return json({ runId: Number(runId), testCases: allTestCases });
  } catch (e: any) {
    console.error('[test-run-cases] Error:', e);
    return json({ error: 'Error fetching test run cases', details: e.message }, { status: 500 });
  }
}
