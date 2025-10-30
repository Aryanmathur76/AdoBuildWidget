import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pipelineDataService } from '../lib/stores/pipelineDataService';
import * as pipelineCache from '../lib/stores/pipelineCache';

const mockReleaseData = { id: 'r1', name: 'Release 1', passedTestCount: 5, failedTestCount: 0 };
const mockBuildData = [{ id: 'b1', name: 'Build 1', passedTestCount: 10, failedTestCount: 2 }];
const mockTestCases = [{ id: 'tc1', name: 'Test 1', outcome: 'Failed' }];

const date = '2025-10-30';
const pipelineId = '123';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('pipelineDataService', () => {
  describe('fetchReleaseDataSilent', () => {
    it('returns cached release data if present', async () => {
  vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue({ releaseData: mockReleaseData, timestamp: Date.now() });
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue({ releaseData: mockReleaseData, timestamp: Date.now() });
    const result = await pipelineDataService.fetchReleaseDataSilent(date, pipelineId);
      expect(result).toEqual(mockReleaseData);
    });

    it('returns null if API returns null', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
      const result = await pipelineDataService.fetchReleaseDataSilent(date, pipelineId);
      expect(result).toBeNull();
    });

    it('caches and returns release data from API', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      const setCache = vi.spyOn(pipelineCache, 'setCachedPipelineData');
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockReleaseData) });
      const result = await pipelineDataService.fetchReleaseDataSilent(date, pipelineId);
      expect(result).toEqual(mockReleaseData);
      expect(setCache).toHaveBeenCalled();
    });

    it('returns null on API error', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await pipelineDataService.fetchReleaseDataSilent(date, pipelineId);
      expect(result).toBeNull();
    });

    it('returns null on non-OK response', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const result = await pipelineDataService.fetchReleaseDataSilent(date, pipelineId);
      expect(result).toBeNull();
    });
  });

  describe('fetchBuildDataSilent', () => {
    it('returns cached build data if present', async () => {
  vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue({ buildData: mockBuildData, timestamp: Date.now() });
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue({ buildData: mockBuildData, timestamp: Date.now() });
    const result = await pipelineDataService.fetchBuildDataSilent(date, pipelineId);
      expect(result).toEqual(mockBuildData);
    });

    it('caches and returns build data from API', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      const setCache = vi.spyOn(pipelineCache, 'setCachedPipelineData');
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockBuildData) });
      const result = await pipelineDataService.fetchBuildDataSilent(date, pipelineId);
      expect(result).toEqual(mockBuildData);
      expect(setCache).toHaveBeenCalled();
    });

    it('returns null on 404 response', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      const result = await pipelineDataService.fetchBuildDataSilent(date, pipelineId);
      expect(result).toBeNull();
    });

    it('returns null on API error', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await pipelineDataService.fetchBuildDataSilent(date, pipelineId);
      expect(result).toBeNull();
    });
  });

  describe('fetchReleaseData', () => {
    it('returns cached release data if present', async () => {
  vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue({ releaseData: mockReleaseData, timestamp: Date.now() });
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue({ releaseData: mockReleaseData, timestamp: Date.now() });
    const result = await pipelineDataService.fetchReleaseData(date, pipelineId);
      expect(result).toEqual(mockReleaseData);
    });

    it('throws error if API returns null', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
      await expect(pipelineDataService.fetchReleaseData(date, pipelineId)).rejects.toThrow('No release data found');
    });

    it('caches and returns release data from API', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      const setCache = vi.spyOn(pipelineCache, 'setCachedPipelineData');
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockReleaseData) });
      const result = await pipelineDataService.fetchReleaseData(date, pipelineId);
      expect(result).toEqual(mockReleaseData);
      expect(setCache).toHaveBeenCalled();
    });

    it('throws error on non-OK response', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      await expect(pipelineDataService.fetchReleaseData(date, pipelineId)).rejects.toThrow('Failed to fetch release data');
    });

    it('throws error on API error', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      await expect(pipelineDataService.fetchReleaseData(date, pipelineId)).rejects.toThrow('Network error');
    });
  });

  describe('fetchBuildData', () => {
    it('returns cached build data if present', async () => {
  vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue({ buildData: mockBuildData, timestamp: Date.now() });
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue({ buildData: mockBuildData, timestamp: Date.now() });
      const result = await pipelineDataService.fetchBuildData(date, pipelineId);
      expect(result).toEqual(mockBuildData);
    });

    it('caches and returns build data from API', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      const setCache = vi.spyOn(pipelineCache, 'setCachedPipelineData');
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockBuildData) });
      const result = await pipelineDataService.fetchBuildData(date, pipelineId);
      expect(result).toEqual(mockBuildData);
      expect(setCache).toHaveBeenCalled();
    });

    it('throws error on 404 response', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      await expect(pipelineDataService.fetchBuildData(date, pipelineId)).rejects.toThrow('No build data found');
    });

    it('throws error on non-OK response', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      await expect(pipelineDataService.fetchBuildData(date, pipelineId)).rejects.toThrow('Failed to fetch build data');
    });

    it('throws error on API error', async () => {
        vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      await expect(pipelineDataService.fetchBuildData(date, pipelineId)).rejects.toThrow('Network error');
    });
  });

  describe('fetchTestCases', () => {
    it('returns cached test cases if present', async () => {
      vi.spyOn(pipelineCache, 'getCachedTestCases').mockReturnValue({ testCases: mockTestCases, timestamp: Date.now() });
      const result = await pipelineDataService.fetchTestCases('releaseId');
      expect(result).toEqual(mockTestCases);
    });

    it('caches and returns test cases from API', async () => {
        vi.spyOn(pipelineCache, 'getCachedTestCases').mockReturnValue(null);
      const setCache = vi.spyOn(pipelineCache, 'setCachedTestCases');
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ testCases: mockTestCases }) });
      const result = await pipelineDataService.fetchTestCases('releaseId');
      expect(result).toEqual(mockTestCases);
      expect(setCache).toHaveBeenCalled();
    });

    it('returns empty array on API error', async () => {
        vi.spyOn(pipelineCache, 'getCachedTestCases').mockReturnValue(null);
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await pipelineDataService.fetchTestCases('releaseId');
      expect(result).toEqual([]);
    });

    it('returns empty array on non-OK response', async () => {
        vi.spyOn(pipelineCache, 'getCachedTestCases').mockReturnValue(null);
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const result = await pipelineDataService.fetchTestCases('releaseId');
      expect(result).toEqual([]);
    });
  });

  describe('prefetchPipelineData', () => {
    it('prefetches build and release data for all pipeline types', async () => {
      const buildSpy = vi.spyOn(pipelineDataService, 'fetchBuildDataSilent').mockResolvedValue(mockBuildData);
      const releaseSpy = vi.spyOn(pipelineDataService, 'fetchReleaseDataSilent').mockResolvedValue(mockReleaseData);
      vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      const buildId = 'build-1';
      const releaseId = 'release-1';
      const bothId = 'both-1';
      const pipelineConfig = { pipelines: [
        { id: buildId, type: 'build' },
        { id: releaseId, type: 'release' },
        { id: bothId, type: 'build/release' }
      ]};
      await pipelineDataService.prefetchPipelineData(date, [buildId, releaseId, bothId], pipelineConfig);
      expect(buildSpy).toHaveBeenCalled();
      expect(releaseSpy).toHaveBeenCalled();
    });

    it('prefetches both types if pipeline not found in config', async () => {
      const buildSpy = vi.spyOn(pipelineDataService, 'fetchBuildDataSilent').mockResolvedValue(mockBuildData);
      const releaseSpy = vi.spyOn(pipelineDataService, 'fetchReleaseDataSilent').mockResolvedValue(mockReleaseData);
      vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      await pipelineDataService.prefetchPipelineData(date, [pipelineId], { pipelines: [] });
      expect(buildSpy).toHaveBeenCalled();
      expect(releaseSpy).toHaveBeenCalled();
    });

    it('prefetches both types if no config provided', async () => {
      const buildSpy = vi.spyOn(pipelineDataService, 'fetchBuildDataSilent').mockResolvedValue(mockBuildData);
      const releaseSpy = vi.spyOn(pipelineDataService, 'fetchReleaseDataSilent').mockResolvedValue(mockReleaseData);
      vi.spyOn(pipelineCache, 'getCachedPipelineData').mockReturnValue(null);
      await pipelineDataService.prefetchPipelineData(date, [pipelineId]);
      expect(buildSpy).toHaveBeenCalled();
      expect(releaseSpy).toHaveBeenCalled();
    });
  });

  describe('prefetchAllPipelineDataForMonth', () => {
    it('prefetches all pipeline data for all days and types', async () => {
      const buildSpy = vi.spyOn(pipelineDataService, 'fetchBuildDataSilent').mockResolvedValue(mockBuildData);
      const releaseSpy = vi.spyOn(pipelineDataService, 'fetchReleaseDataSilent').mockResolvedValue(mockReleaseData);
      const pipelineConfig = { pipelines: [
        { id: pipelineId, type: 'build' },
        { id: pipelineId, type: 'release' },
        { id: pipelineId, type: 'build/release' }
      ]};
      const dates = ['2025-10-01', '2025-10-02'];
      await pipelineDataService.prefetchAllPipelineDataForMonth(dates, pipelineConfig);
      expect(buildSpy).toHaveBeenCalled();
      expect(releaseSpy).toHaveBeenCalled();
    });

    it('does nothing if pipelineConfig.pipelines is missing', async () => {
      const buildSpy = vi.spyOn(pipelineDataService, 'fetchBuildDataSilent');
      const releaseSpy = vi.spyOn(pipelineDataService, 'fetchReleaseDataSilent');
      await pipelineDataService.prefetchAllPipelineDataForMonth(['2025-10-01'], {});
      expect(buildSpy).not.toHaveBeenCalled();
      expect(releaseSpy).not.toHaveBeenCalled();
    });
  });
});
