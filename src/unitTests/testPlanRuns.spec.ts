import { describe, it, expect } from 'vitest';
import { filterAndMapTestRuns, groupTestRuns } from '$lib/utils/testPlanRuns';
import type { TestRun } from '$lib/types/testRuns';

describe('filterAndMapTestRuns', () => {
  it('filters out non-completed runs and maps fields correctly', () => {
    const raw = [
      { id: 1, name: 'v16.0.0 run', state: 'Completed', startedDate: '2025-01-01T00:00:00Z', completedDate: '2025-01-01T01:00:00Z', totalTests: 10, passedTests: 8, failedTests: 2 },
      { id: 2, name: 'v15.0.0 old run', state: 'Completed', startedDate: '2025-01-02T00:00:00Z', totalTests: 5, passedTests: 5, failedTests: 0 },
      { id: 3, name: 'v17.0.0 run', state: 'InProgress', startedDate: '2025-01-03T00:00:00Z', totalTests: 3 },
      { id: 4, name: 'some 16.0.0 build', state: 'Completed', startedDate: 'invalid-date', totalTests: 4 }
    ];

    const mapped = filterAndMapTestRuns(raw as any);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].id).toBe(1);
    expect(mapped[0].totalTests).toBe(10);
    expect(mapped[0].notExecutedTests).toBe(0);
  });

  it('maps notExecutedTests from unanalyzedTests when present', () => {
    const raw = [
      { id: 5, name: '17.0.0 run', state: 'Completed', startedDate: '2025-02-01T00:00:00Z', unanalyzedTests: 7 }
    ];

    const mapped = filterAndMapTestRuns(raw as any);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].notExecutedTests).toBe(7);
  });
});

describe('groupTestRuns', () => {
  it('groups runs within session window and aggregates counts', () => {
    const runs: TestRun[] = [
      { id: 10, name: '16.0.0 a', state: 'Completed', startedDate: '2025-03-01T00:00:00Z', totalTests: 2, passedTests: 2, failedTests: 0, notExecutedTests: 0 },
      { id: 11, name: '16.0.0 b', state: 'Completed', startedDate: '2025-03-05T00:00:00Z', totalTests: 3, passedTests: 2, failedTests: 1, notExecutedTests: 0 },
      { id: 12, name: '16.0.0 c', state: 'Completed', startedDate: '2025-04-01T00:00:00Z', totalTests: 5, passedTests: 5, failedTests: 0, notExecutedTests: 0 }
    ];

    const groups = groupTestRuns(runs, 14);
    expect(groups).toHaveLength(2);

    const [mostRecent, older] = groups;
    // mostRecent is the later date (2025-04-01)
    expect(mostRecent.date).toBe('2025-04-01');
    expect(mostRecent.totalTests).toBe(5);

    // older session (2025-03-01) aggregates two runs
    expect(older.date).toBe('2025-03-01');
    expect(older.totalTests).toBe(5);
    expect(older.passedTests).toBe(4);
    expect(older.failedTests).toBe(1);
  });

  it('respects custom sessionDays parameter', () => {
    const runs: TestRun[] = [
      { id: 20, name: '16.0.0 a', state: 'Completed', startedDate: '2025-06-01T00:00:00Z', totalTests: 1, passedTests: 1, failedTests: 0, notExecutedTests: 0 },
      { id: 21, name: '16.0.0 b', state: 'Completed', startedDate: '2025-06-20T00:00:00Z', totalTests: 2, passedTests: 2, failedTests: 0, notExecutedTests: 0 }
    ];

    const groups = groupTestRuns(runs, 10);
    expect(groups).toHaveLength(2);
  });
});
