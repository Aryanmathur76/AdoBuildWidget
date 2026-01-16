import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTestRunsForPlan, filterAndMapTestRuns, groupTestRuns } from '$lib/utils/testPlanRuns';
import type { AzureEnv } from '$lib/utils/testPlanRuns';

// Helper to create a fake fetch Response
function makeResponse(body: any, headers: Record<string,string> = {}, ok = true) {
  return {
    ok,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null
    },
    json: async () => body,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  } as any;
}

describe('fetchTestRunsForPlan pagination and error handling', () => {
  const azureEnv: AzureEnv = { organization: 'org', project: 'proj', pat: 'pat' };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('follows continuation token from header', async () => {
    const page1 = { value: [{ id: 1 }], continuationToken: null };
    const page2 = { value: [{ id: 2 }], continuationToken: null };

    const f = vi.fn()
      .mockResolvedValueOnce(makeResponse(page1, { 'x-ms-continuationtoken': 'token' }))
      .mockResolvedValueOnce(makeResponse(page2, {}));

    // @ts-ignore
    vi.stubGlobal('fetch', f);

    const from = new Date('2024-01-01');
    const to = new Date('2024-01-08');

    const runs = await fetchTestRunsForPlan(azureEnv, '123', from, to);
    expect(runs).toHaveLength(2);
    expect(runs.find((r:any)=>r.id===1)).toBeTruthy();
    expect(runs.find((r:any)=>r.id===2)).toBeTruthy();
  });

  it('follows continuation token from body', async () => {
    const page1 = { value: [{ id: 3 }], continuationToken: 'token2' };
    const page2 = { value: [{ id: 4 }], continuationToken: null };

    const f = vi.fn()
      .mockResolvedValueOnce(makeResponse(page1, {}))
      .mockResolvedValueOnce(makeResponse(page2, {}));

    // @ts-ignore
    vi.stubGlobal('fetch', f);

    const runs = await fetchTestRunsForPlan(azureEnv, '123', new Date('2024-02-01'), new Date('2024-02-08'));
    expect(runs).toHaveLength(2);
  });

  it('throws on non-ok response', async () => {
    const f = vi.fn().mockResolvedValue(makeResponse('error body', {}, false));
    // @ts-ignore
    vi.stubGlobal('fetch', f);

    await expect(fetchTestRunsForPlan(azureEnv, '123', new Date('2024-03-01'), new Date('2024-03-08'))).rejects.toThrow();
  });
});


describe('grouping and edge behaviors', () => {
  it('groups runs that are exactly sessionDays apart (inclusive)', () => {
    const runs = [
      { id: 100, name: '16.0.0 a', state: 'Completed', startedDate: '2025-01-01T00:00:00Z', totalTests: 1, passedTests:1, failedTests:0, notExecutedTests:0 },
      // exactly 14 days later
      { id: 101, name: '16.0.0 b', state: 'Completed', startedDate: '2025-01-15T00:00:00Z', totalTests: 2, passedTests:2, failedTests:0, notExecutedTests:0 }
    ];

    const groups = groupTestRuns(runs as any, 14);
    expect(groups).toHaveLength(1);
    expect(groups[0].runs).toHaveLength(2);
  });

  it('works with unsorted input when grouped after sorting', () => {
    const runs = [
      { id: 200, name: '16.0.0 later', state: 'Completed', startedDate: '2025-05-10T00:00:00Z', totalTests: 2, passedTests:2, failedTests:0, notExecutedTests:0 },
      { id: 201, name: '16.0.0 earlier', state: 'Completed', startedDate: '2025-05-01T00:00:00Z', totalTests: 1, passedTests:1, failedTests:0, notExecutedTests:0 }
    ];

    // intentionally unsorted; filterAndMapTestRuns sorts by startedDate
    const mapped = filterAndMapTestRuns(runs as any);
    const groups = groupTestRuns(mapped);
    expect(groups.some(g => g.totalTests === 3)).toBe(true);
  });

  it('coerces numeric-like strings to numbers', () => {
    const raw = [
      { id: 300, name: '16.0.0 s', state: 'Completed', startedDate: '2025-07-01T00:00:00Z', totalTests: '4', passedTests: '3', failedTests: '1', notExecutedTests: '0' }
    ];

    const mapped = filterAndMapTestRuns(raw as any);
    expect(mapped[0].totalTests).toBe(4);
    expect(mapped[0].passedTests).toBe(3);
    expect(mapped[0].failedTests).toBe(1);
  });
});
