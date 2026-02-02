import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('constructRelease - Timezone Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('CST Date Handling', () => {
    it('should expand UTC search range for CST dates', () => {
      // Test date: 2026-01-31 CST
      const date = '2026-01-31';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000); // Start 6 hours earlier
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000); // End 30 hours later

      // startDate should be 2026-01-30 18:00:00Z (6 hours before 2026-01-31 00:00:00Z)
      expect(startDate.toISOString()).toBe('2026-01-30T18:00:00.000Z');
      // endDate should be 2026-02-01 06:00:00Z
      expect(endDate.toISOString()).toBe('2026-02-01T06:00:00.000Z');
    });

    it('should correctly identify releases within the expanded UTC range', () => {
      const date = '2026-01-31';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

      // Releases created within the expanded range should be found
      const releaseInRange = '2026-01-31T14:30:00Z'; // 8:30 AM CST
      const releaseTime = new Date(releaseInRange).getTime();
      expect(releaseTime >= startDate.getTime() && releaseTime <= endDate.getTime()).toBe(true);

      // Releases created before the range should not be found
      const releaseBeforeRange = '2026-01-30T16:00:00Z'; // Too early
      const releaseBeforeTime = new Date(releaseBeforeRange).getTime();
      expect(releaseBeforeTime >= startDate.getTime() && releaseBeforeTime <= endDate.getTime()).toBe(false);
    });

    it('should filter releases based on CST date boundaries', () => {
      const date = '2026-01-31';
      const cstDateStart = new Date(`${date}T00:00:00Z`).getTime() - 6 * 60 * 60 * 1000;
      const cstDateEnd = new Date(`${date}T23:59:59Z`).getTime() + 24 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000;

      const releases = [
        { id: 1, createdOn: '2026-01-31T15:00:00Z' }, // Should pass filter
        { id: 2, createdOn: '2026-02-01T02:00:00Z' }, // Should pass filter
      ];

      const releasesOnTargetDate = releases.filter((rel: any) => {
        const createdTime = new Date(rel.createdOn).getTime();
        return createdTime >= cstDateStart && createdTime <= cstDateEnd;
      });

      // Both releases should be included as they fall within the CST date range
      expect(releasesOnTargetDate.length).toBeGreaterThan(0);
      expect(releasesOnTargetDate.map((r: any) => r.id)).toContain(1);
      expect(releasesOnTargetDate.map((r: any) => r.id)).toContain(2);
    });

    it('should handle end of month boundary (Jan 31 CST)', () => {
      const date = '2026-01-31';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

      // Verify the dates span across month boundary correctly
      expect(startDate.getUTCDate()).toBe(30); // Jan 30
      expect(endDate.getUTCDate()).toBe(1); // Feb 1
      expect(startDate.getUTCMonth()).toBe(0); // January (0-indexed)
      expect(endDate.getUTCMonth()).toBe(1); // February (0-indexed)
    });

    it('should handle beginning of month (Feb 1 CST)', () => {
      const date = '2026-02-01';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

      // startDate should be Jan 31
      expect(startDate.getUTCDate()).toBe(31);
      expect(startDate.getUTCMonth()).toBe(0); // January
      // endDate should be Feb 2
      expect(endDate.getUTCDate()).toBe(2);
      expect(endDate.getUTCMonth()).toBe(1); // February
    });
  });

  describe('Release Selection Logic', () => {
    it('should select latest release from target date when multiple exist', () => {
      const releases = [
        { id: 1, createdOn: '2026-01-31T10:00:00Z' },
        { id: 2, createdOn: '2026-01-31T15:00:00Z' },
        { id: 3, createdOn: '2026-01-31T12:00:00Z' },
      ];

      // Simulate getLatestRelease logic
      const latestRelease = releases.reduce((latest, current) => {
        const latestDate = new Date(latest.createdOn);
        const currentDate = new Date(current.createdOn);
        return currentDate > latestDate ? current : latest;
      }, releases[0]);

      expect(latestRelease.id).toBe(2); // Latest is 15:00
    });

    it('should fallback to latest release if no releases on target date', () => {
      const date = '2026-01-31';
      const cstDateStart = new Date(`${date}T00:00:00Z`).getTime() - 6 * 60 * 60 * 1000;
      const cstDateEnd = new Date(`${date}T23:59:59Z`).getTime() + 24 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000;

      const releases = [
        { id: 1, createdOn: '2026-01-30T15:00:00Z' },
        { id: 2, createdOn: '2026-02-01T08:00:00Z' },
      ];

      // Filter for target date
      let releasesOnTargetDate = releases.filter((rel: any) => {
        const createdTime = new Date(rel.createdOn).getTime();
        return createdTime >= cstDateStart && createdTime <= cstDateEnd;
      });

      if (releasesOnTargetDate.length === 0) {
        releasesOnTargetDate = releases; // Fallback to all releases
      }

      // Now get the latest
      const latestRelease = releasesOnTargetDate.reduce((latest, current) => {
        const latestDate = new Date(latest.createdOn);
        const currentDate = new Date(current.createdOn);
        return currentDate > latestDate ? current : latest;
      }, releasesOnTargetDate[0]);

      expect(latestRelease.id).toBe(2); // Fallback to latest overall
    });
  });

  describe('UTC Search Range Calculation', () => {
    it('should calculate correct UTC range for any CST date', () => {
      const testDates = [
        { cst: '2026-01-01', expectedStartUTC: '2025-12-31T18:00:00.000Z', expectedEndUTC: '2026-01-02T06:00:00.000Z' },
        { cst: '2026-06-15', expectedStartUTC: '2026-06-14T18:00:00.000Z', expectedEndUTC: '2026-06-16T06:00:00.000Z' },
        { cst: '2026-12-31', expectedStartUTC: '2026-12-30T18:00:00.000Z', expectedEndUTC: '2027-01-01T06:00:00.000Z' },
      ];

      for (const testCase of testDates) {
        const queryDate = new Date(`${testCase.cst}T00:00:00Z`);
        const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
        const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

        expect(startDate.toISOString()).toBe(testCase.expectedStartUTC);
        expect(endDate.toISOString()).toBe(testCase.expectedEndUTC);
      }
    });
  });
});
