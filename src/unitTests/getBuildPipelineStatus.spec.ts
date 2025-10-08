import { describe, it, expect } from 'vitest'
import { getBuildPipelineStatus } from '$lib/utils/getBuildPipelineStatus';

//If the build is null or undefined, throw an error
describe('getBuildPipelineStatus', () => {
  it('should throw an error for null build', async () => {
    await expect(getBuildPipelineStatus(null as any)).rejects.toThrow('Provided build is null or undefined');
  });
});

// If the build has no status, throw an error
describe('getBuildPipelineStatus', () => {
  it('should throw an error for a build with no status', async () => {
    await expect(getBuildPipelineStatus({} as any)).rejects.toThrow('Build has no status');
  });
});

// If the build status is "inProgress" or "cancelling" then return "inProgress"
describe('getBuildPipelineStatus - inProgress', () => {
  it('should return "inProgress" if build status is inProgress', async () => {
    const result = await getBuildPipelineStatus({ status: 'inProgress' } as any);
    expect(result).toBe('inProgress');
  });
});

// If the build result is "canceled" or "aborted" then return "interrupted"
describe('getBuildPipelineStatus - interrupted', () => {
  it('should return "interrupted" if build result is canceled', async () => {
    const result = await getBuildPipelineStatus({ status: 'none', result: 'canceled' } as any);
    expect(result).toBe('interrupted');
  });
});

// If the build status is "failed" then return "bad"
describe('getBuildPipelineStatus - failed', () => {
  it('should return "bad" if build result is failed', async () => {
    const result = await getBuildPipelineStatus({ status: 'none', result: 'failed' } as any);
    expect(result).toBe('bad');
  });
});

// If the build has no test counts, return "unknown"
describe('getBuildPipelineStatus - unknown', () => {
  it('should return "unknown" if build has no test counts', async () => {
    const result = await getBuildPipelineStatus({ status: 'none', result: 'succeeded' } as any);
    expect(result).toBe('unknown');
  });
});

// If the build has 100% pass rate, return "good"
describe('getBuildPipelineStatus - good', () => {
  it('should return "good" if build has 100% pass rate', async () => {
    const result = await getBuildPipelineStatus({ status: 'none', result: 'succeeded', passedTestCount: 10, failedTestCount: 0 } as any);
    expect(result).toBe('good');
  });
});

// If the build has >= 70% pass rate, return "ok"
describe('getBuildPipelineStatus - ok', () => {
  it('should return "ok" if build has >= 70% pass rate', async () => {
    const result = await getBuildPipelineStatus({ status: 'none', result: 'succeeded', passedTestCount: 7, failedTestCount: 3 } as any);
    expect(result).toBe('ok');
  });
});

// If the build has < 70% pass rate, return "bad"
describe('getBuildPipelineStatus - bad', () => {
  it('should return "bad" if build has < 70% pass rate', async () => {
    const result = await getBuildPipelineStatus({ status: 'none', result: 'succeeded', passedTestCount: 3, failedTestCount: 7 } as any);
    expect(result).toBe('bad');
  });
});

// Additional test cases for comprehensive coverage
describe('getBuildPipelineStatus - Additional Edge Cases', () => {
  it('should handle undefined build parameter', async () => {
    await expect(getBuildPipelineStatus(undefined as any)).rejects.toThrow('Provided build is null or undefined');
  });

  it('should handle build with undefined status', async () => {
    await expect(getBuildPipelineStatus({ status: undefined } as any)).rejects.toThrow('Build has no status');
  });

  it('should handle build with null status', async () => {
    await expect(getBuildPipelineStatus({ status: null } as any)).rejects.toThrow('Build has no status');
  });

  it('should handle build with empty string status', async () => {
    await expect(getBuildPipelineStatus({ status: '' } as any)).rejects.toThrow('Build has no status');
  });

  it('should return "interrupted" for cancelling status', async () => {
    const result = await getBuildPipelineStatus({ status: 'cancelling' } as any);
    expect(result).toBe('interrupted');
  });

  it('should return "interrupted" for postponed status', async () => {
    const result = await getBuildPipelineStatus({ status: 'postponed' } as any);
    expect(result).toBe('interrupted');
  });

  it('should return "unknown" when passedTestCount is undefined', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: undefined, 
      failedTestCount: 5 
    } as any);
    expect(result).toBe('unknown');
  });

  it('should return "unknown" when failedTestCount is undefined', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 5, 
      failedTestCount: undefined 
    } as any);
    expect(result).toBe('unknown');
  });

  it('should return "unknown" when both test counts are undefined', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: undefined, 
      failedTestCount: undefined 
    } as any);
    expect(result).toBe('unknown');
  });

  it('should return "unknown" when both test counts are null', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: null, 
      failedTestCount: null 
    } as any);
    expect(result).toBe('unknown');
  });

  it('should return "unknown" when total tests is zero', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 0, 
      failedTestCount: 0 
    } as any);
    expect(result).toBe('unknown');
  });

  it('should handle exact 70% pass rate threshold (should return "ok")', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 70, 
      failedTestCount: 30 
    } as any);
    expect(result).toBe('ok');
  });

  it('should handle 69% pass rate (should return "bad")', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 69, 
      failedTestCount: 31 
    } as any);
    expect(result).toBe('bad');
  });

  it('should handle 71% pass rate (should return "ok")', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 71, 
      failedTestCount: 29 
    } as any);
    expect(result).toBe('ok');
  });

  it('should handle 99% pass rate (should return "ok")', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 99, 
      failedTestCount: 1 
    } as any);
    expect(result).toBe('good');
  });

  it('should handle single passing test (100% pass rate)', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 1, 
      failedTestCount: 0 
    } as any);
    expect(result).toBe('good');
  });

  it('should handle single failing test (0% pass rate)', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 0, 
      failedTestCount: 1 
    } as any);
    expect(result).toBe('bad');
  });

  it('should prioritize "failed" result over test counts', async () => {
    // Even with good test counts, failed result should return "bad"
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'failed', 
      passedTestCount: 100, 
      failedTestCount: 0 
    } as any);
    expect(result).toBe('bad');
  });

  it('should prioritize "canceled" result over test counts', async () => {
    // Even with good test counts, canceled result should return "interrupted"
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'canceled', 
      passedTestCount: 100, 
      failedTestCount: 0 
    } as any);
    expect(result).toBe('interrupted');
  });

  it('should prioritize "inProgress" status over everything', async () => {
    // Even with failed result, inProgress status should return "inProgress"
    const result = await getBuildPipelineStatus({ 
      status: 'inProgress', 
      result: 'failed', 
      passedTestCount: 0, 
      failedTestCount: 100 
    } as any);
    expect(result).toBe('inProgress');
  });

  it('should handle large test counts', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 10000, 
      failedTestCount: 0 
    } as any);
    expect(result).toBe('good');
  });

  it('should handle decimal-like pass rates correctly', async () => {
    // 7 out of 10 = 70% exactly
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 7, 
      failedTestCount: 3 
    } as any);
    expect(result).toBe('ok');
  });

  it('should handle floating point precision edge cases', async () => {
    // 2 out of 3 = 66.666...% (should be "bad")
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 2, 
      failedTestCount: 1 
    } as any);
    expect(result).toBe('bad');
  });
});

describe('getBuildPipelineStatus - Status Priority Tests', () => {
  it('should test priority: inProgress > interrupted > bad > unknown/test-based', async () => {
    // Priority 1: inProgress
    expect(await getBuildPipelineStatus({ status: 'inProgress' } as any)).toBe('inProgress');
    
    // Priority 2: interrupted (canceled result)
    expect(await getBuildPipelineStatus({ status: 'completed', result: 'canceled' } as any)).toBe('interrupted');
    
    // Priority 3: bad (failed result)
    expect(await getBuildPipelineStatus({ status: 'completed', result: 'failed' } as any)).toBe('bad');
    
    // Priority 4: unknown (no test counts)
    expect(await getBuildPipelineStatus({ status: 'completed', result: 'succeeded' } as any)).toBe('unknown');
  });
});

describe('getBuildPipelineStatus - Real-world Scenarios', () => {
  it('should handle typical successful build with all tests passing', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 150, 
      failedTestCount: 0 
    } as any);
    expect(result).toBe('good');
  });

  it('should handle build with mostly passing tests', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 142, 
      failedTestCount: 8 // 94.67% pass rate
    } as any);
    expect(result).toBe('ok');
  });

  it('should handle build with many failing tests', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'completed', 
      result: 'succeeded', 
      passedTestCount: 50, 
      failedTestCount: 100 // 33.33% pass rate
    } as any);
    expect(result).toBe('bad');
  });

  it('should handle build that was manually canceled', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'cancelling', 
      result: 'canceled',
      passedTestCount: 10, 
      failedTestCount: 0 
    } as any);
    expect(result).toBe('interrupted');
  });

  it('should handle build that is currently running', async () => {
    const result = await getBuildPipelineStatus({ 
      status: 'inProgress',
      // No result or test counts when inProgress
    } as any);
    expect(result).toBe('inProgress');
  });
});
