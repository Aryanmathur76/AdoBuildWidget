import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pipelineCache from '../lib/stores/pipelineCache';

const mockDayQuality = {
  quality: 'good',
  releaseIds: ['r1', 'r2'],
  totalPassCount: 10,
  totalFailCount: 2,
  timestamp: Date.now()
};
const mockPipelineData = {
  releaseData: { id: 'r1' },
  buildData: [{ id: 'b1' }],
  testRunData: { passCount: 5, failCount: 1 },
  pipelineStatus: 'success',
  timestamp: Date.now()
};
const mockTestCases = {
  testCases: [{ id: 'tc1', name: 'Test 1' }],
  timestamp: Date.now()
};

const date = '2025-10-30';
const pipelineId = 'p1';
const releaseId = 'r1';

beforeEach(() => {
  // Clear all caches before each test
  pipelineCache.dayQualityCache.set({});
  pipelineCache.pipelineDataCache.set({});
  pipelineCache.testCasesCache.set({});
});

describe('pipelineCache', () => {
  it('setCachedDayQuality and getCachedDayQuality should store and retrieve valid cache', () => {
    pipelineCache.setCachedDayQuality(date, {
      quality: mockDayQuality.quality,
      releaseIds: mockDayQuality.releaseIds,
      totalPassCount: mockDayQuality.totalPassCount,
      totalFailCount: mockDayQuality.totalFailCount
    });
    const cached = pipelineCache.getCachedDayQuality(date);
    expect(cached?.quality).toBe('good');
    expect(cached?.releaseIds).toEqual(['r1', 'r2']);
    expect(cached?.totalPassCount).toBe(10);
    expect(cached?.totalFailCount).toBe(2);
    expect(typeof cached?.timestamp).toBe('number');
  });

  it('getCachedDayQuality returns null for expired cache', () => {
    pipelineCache.dayQualityCache.set({
      [date]: { ...mockDayQuality, timestamp: Date.now() - 10 * 60 * 1000 }
    });
    const cached = pipelineCache.getCachedDayQuality(date);
    expect(cached).toBeNull();
  });

  it('setCachedPipelineData and getCachedPipelineData should store and retrieve valid cache', () => {
    pipelineCache.setCachedPipelineData(date, pipelineId, {
      releaseData: mockPipelineData.releaseData,
      buildData: mockPipelineData.buildData,
      testRunData: mockPipelineData.testRunData,
      pipelineStatus: mockPipelineData.pipelineStatus
    });
    const cached = pipelineCache.getCachedPipelineData(date, pipelineId);
    expect(cached?.releaseData).toEqual({ id: 'r1' });
    expect(cached?.buildData).toEqual([{ id: 'b1' }]);
    expect(cached?.testRunData).toEqual({ passCount: 5, failCount: 1 });
    expect(cached?.pipelineStatus).toBe('success');
    expect(typeof cached?.timestamp).toBe('number');
  });

  it('getCachedPipelineData returns null for expired cache', () => {
    pipelineCache.pipelineDataCache.set({
      [`${date}-${pipelineId}`]: { ...mockPipelineData, timestamp: Date.now() - 10 * 60 * 1000 }
    });
    const cached = pipelineCache.getCachedPipelineData(date, pipelineId);
    expect(cached).toBeNull();
  });

  it('setCachedTestCases and getCachedTestCases should store and retrieve valid cache', () => {
    pipelineCache.setCachedTestCases(releaseId, mockTestCases.testCases);
    const cached = pipelineCache.getCachedTestCases(releaseId);
    expect(cached?.testCases).toEqual([{ id: 'tc1', name: 'Test 1' }]);
    expect(typeof cached?.timestamp).toBe('number');
  });

  it('getCachedTestCases returns null for expired cache', () => {
    pipelineCache.testCasesCache.set({
      [releaseId]: { ...mockTestCases, timestamp: Date.now() - 10 * 60 * 1000 }
    });
    const cached = pipelineCache.getCachedTestCases(releaseId);
    expect(cached).toBeNull();
  });

  it('clearExpiredCache removes expired entries from all caches', () => {
    pipelineCache.dayQualityCache.set({
      [date]: { ...mockDayQuality, timestamp: Date.now() - 10 * 60 * 1000 }
    });
    pipelineCache.pipelineDataCache.set({
      [`${date}-${pipelineId}`]: { ...mockPipelineData, timestamp: Date.now() - 10 * 60 * 1000 }
    });
    pipelineCache.testCasesCache.set({
      [releaseId]: { ...mockTestCases, timestamp: Date.now() - 10 * 60 * 1000 }
    });
    pipelineCache.clearExpiredCache();
    expect(pipelineCache.getCachedDayQuality(date)).toBeNull();
    expect(pipelineCache.getCachedPipelineData(date, pipelineId)).toBeNull();
    expect(pipelineCache.getCachedTestCases(releaseId)).toBeNull();
  });

  it('isCacheValid returns true for fresh timestamp and false for expired', () => {
    expect(pipelineCache.isCacheValid(Date.now())).toBe(true);
    expect(pipelineCache.isCacheValid(Date.now() - 10 * 60 * 1000)).toBe(false);
  });

  it('createCacheKey generates correct keys', () => {
    expect(pipelineCache.createCacheKey(date, pipelineId)).toBe(`${date}-${pipelineId}`);
    expect(pipelineCache.createCacheKey(date, undefined, releaseId)).toBe(`${date}-${releaseId}`);
    expect(pipelineCache.createCacheKey(date)).toBe(date);
  });
});
