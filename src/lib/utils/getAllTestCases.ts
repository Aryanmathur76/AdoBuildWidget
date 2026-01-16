import type { TestSuite, TestCase } from '$lib/types/getAllTestCases';

type AzureEnv = {
  organization: string;
  project: string;
  pat: string;
};

function encodePat(pat: string) {
  try {
    return btoa(':' + pat);
  } catch (e) {
    return Buffer.from(':' + pat).toString('base64');
  }
}

export async function fetchAllSuites(env: AzureEnv, testPlanId: string): Promise<TestSuite[]> {
  const { organization, project, pat } = env;
  const allSuites: TestSuite[] = [];
  let continuationToken: string | null = null;

  do {
    let allSuitesUrl = `https://dev.azure.com/${organization}/${project}/_apis/testplan/Plans/${testPlanId}/suites?api-version=7.1`;
    if (continuationToken) {
      allSuitesUrl += `&continuationToken=${encodeURIComponent(continuationToken)}`;
    }

    const res = await fetch(allSuitesUrl, {
      headers: {
        'Authorization': `Basic ${encodePat(pat)}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch test suites: ${res.status}`);
    }

    const data = await res.json();
    if (Array.isArray(data.value)) {
      allSuites.push(...data.value);
    }

    continuationToken = res.headers.get('x-ms-continuationtoken');
  } while (continuationToken);

  return allSuites;
}

export async function fetchTestCasesForSuite(env: AzureEnv, testPlanId: string, suiteId: string): Promise<TestCase[]> {
  const { organization, project, pat } = env;
  const allTestCases: TestCase[] = [];
  let continuationToken: string | null = null;

  do {
    let url = `https://dev.azure.com/${organization}/${project}/_apis/testplan/Plans/${testPlanId}/Suites/${suiteId}/TestCase?api-version=7.1`;
    if (continuationToken) {
      url += `&continuationToken=${encodeURIComponent(continuationToken)}`;
    }

    const res = await fetch(url, {
      headers: {
        'Authorization': `Basic ${encodePat(pat)}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch test cases for suite ${suiteId}: ${res.status}`);
    }

    const data = await res.json();
    if (Array.isArray(data.value)) {
      allTestCases.push(...data.value);
    }

    continuationToken = res.headers.get('x-ms-continuationtoken');
  } while (continuationToken);

  return allTestCases;
}

export async function fetchSuiteWithChildrenAndTestCases(env: AzureEnv, testPlanId: string, suiteId: string, allSuites: TestSuite[]): Promise<TestSuite | null> {
  const suite = allSuites.find(s => s.id.toString() === suiteId);
  if (!suite) return null;

  suite.testCases = await fetchTestCasesForSuite(env, testPlanId, suiteId);

  const directChildren = allSuites.filter(s => s.parentSuite?.id === suite.id);
  if (directChildren.length > 0) {
    const children = await Promise.all(directChildren.map(child =>
      fetchSuiteWithChildrenAndTestCases(env, testPlanId, child.id.toString(), allSuites)
    ));
    suite.childSuites = children.filter((c): c is TestSuite => c !== null);
  } else {
    suite.childSuites = [];
  }

  return suite;
}
