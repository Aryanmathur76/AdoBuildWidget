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

// If the build status is "failed" then return "failed"
describe('getBuildPipelineStatus - failed', () => {
  it('should return "failed" if build status is failed', async () => {
    const result = await getBuildPipelineStatus({ status: 'none', result: 'failed' } as any);
    expect(result).toBe('failed');
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
