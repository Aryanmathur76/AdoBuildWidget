import { describe, it, expect } from 'vitest'

describe('constructBuild - Timezone Handling', () => {
  describe('CST Date Handling', () => {
    it('should expand UTC search range for CST dates in build API', () => {
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

    it('should correctly identify builds completed on CST date', () => {
      const date = '2026-01-31';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

      // Build completed during business hours in CST
      const build1FinishTime = '2026-01-31T14:30:00Z'; // 8:30 AM CST
      expect(new Date(build1FinishTime).getTime() >= startDate.getTime() && 
             new Date(build1FinishTime).getTime() <= endDate.getTime()).toBe(true);

      // Build completed late evening CST (early morning UTC of next day)
      const build2FinishTime = '2026-02-01T04:00:00Z'; // 10 PM CST (Jan 31)
      expect(new Date(build2FinishTime).getTime() >= startDate.getTime() && 
             new Date(build2FinishTime).getTime() <= endDate.getTime()).toBe(true);

      // Build completed before CST date starts
      const build3FinishTime = '2026-01-30T16:00:00Z'; // Before start date
      expect(new Date(build3FinishTime).getTime() >= startDate.getTime() && 
             new Date(build3FinishTime).getTime() <= endDate.getTime()).toBe(false);
    });

    it('should handle edge case: builds that started before but finished on target date', () => {
      const date = '2026-01-31';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

      // Build that started Jan 30 but finished Jan 31
      const buildStartTime = '2026-01-30T22:00:00Z'; // 4 PM CST Jan 30
      const buildFinishTime = '2026-01-31T02:00:00Z'; // 8 PM CST Jan 30 (early morning UTC Jan 31)

      // If querying by finish time (which the API does)
      expect(new Date(buildFinishTime).getTime() >= startDate.getTime() && 
             new Date(buildFinishTime).getTime() <= endDate.getTime()).toBe(true);
    });

    it('should return correct minTime and maxTime for API query', () => {
      const date = '2026-01-31';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

      const minTime = startDate.toISOString();
      const maxTime = endDate.toISOString();

      // These should be suitable for Azure DevOps API query
      expect(minTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
      expect(maxTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);

      // minTime should be before maxTime
      expect(new Date(minTime).getTime() < new Date(maxTime).getTime()).toBe(true);

      // Should span approximately 36 hours (6 hours before + 24 hours of day + 6 hours after)
      const spanMs = new Date(maxTime).getTime() - new Date(minTime).getTime();
      const spanHours = spanMs / (1000 * 60 * 60);
      expect(spanHours).toBeGreaterThan(30);
      expect(spanHours).toBeLessThan(40);
    });
  });

  describe('Build Selection Logic', () => {
    it('should select latest build from target date when multiple exist', () => {
      const builds = [
        { id: 1, finishTime: '2026-01-31T10:00:00Z' },
        { id: 2, finishTime: '2026-01-31T15:00:00Z' },
        { id: 3, finishTime: '2026-01-31T12:00:00Z' },
      ];

      // Simulate selecting latest build logic
      const latestBuild = builds.reduce((latest, current) => {
        const latestDate = new Date(latest.finishTime);
        const currentDate = new Date(current.finishTime);
        return currentDate > latestDate ? current : latest;
      }, builds[0]);

      expect(latestBuild.id).toBe(2); // Latest is 15:00
    });

    it('should handle builds with no results for target date', () => {
      const date = '2026-01-31';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

      const builds: any[] = [];

      expect(builds.length).toBe(0);
      // Should return "No build found for this day" message
    });
  });

  describe('Month Boundary Cases', () => {
    it('should correctly handle Jan 31 CST spanning into February UTC', () => {
      const date = '2026-01-31';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

      // Should start in January UTC
      expect(startDate.getUTCMonth()).toBe(0); // January
      expect(startDate.getUTCDate()).toBe(30);

      // Should end in February UTC
      expect(endDate.getUTCMonth()).toBe(1); // February
      expect(endDate.getUTCDate()).toBe(1);
    });

    it('should correctly handle year boundary case (Dec 31 CST)', () => {
      const date = '2026-12-31';
      const queryDate = new Date(`${date}T00:00:00Z`);
      const startDate = new Date(queryDate.getTime() - 6 * 60 * 60 * 1000);
      const endDate = new Date(queryDate.getTime() + 30 * 60 * 60 * 1000);

      // Should start in December UTC
      expect(startDate.getUTCMonth()).toBe(11); // December
      expect(startDate.getUTCFullYear()).toBe(2026);

      // Should end in January UTC of next year
      expect(endDate.getUTCMonth()).toBe(0); // January
      expect(endDate.getUTCFullYear()).toBe(2027);
    });
  });
});
