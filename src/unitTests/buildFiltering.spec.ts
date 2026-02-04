import { describe, it, expect } from 'vitest';

// Test the build filtering logic
describe('Build Filtering - Schedule Reason', () => {
    const filterScheduledBuilds = (builds: any[]) => {
        return builds.filter(build => {
            return build.reason === 'schedule';
        });
    };

    it('should only include builds with reason="schedule"', () => {
        const builds = [
            { id: 1, reason: 'schedule', name: 'Build 1' },
            { id: 2, reason: 'schedule', name: 'Build 2' },
            { id: 3, reason: 'manual', name: 'Build 3' },
            { id: 4, reason: 'pullRequest', name: 'Build 4' }
        ];

        const filtered = filterScheduledBuilds(builds);
        expect(filtered).toHaveLength(2);
        expect(filtered[0].id).toBe(1);
        expect(filtered[1].id).toBe(2);
    });

    it('should return empty array when no scheduled builds exist', () => {
        const builds = [
            { id: 1, reason: 'manual', name: 'Build 1' },
            { id: 2, reason: 'pullRequest', name: 'Build 2' }
        ];

        const filtered = filterScheduledBuilds(builds);
        expect(filtered).toHaveLength(0);
    });

    it('should return empty array for empty input', () => {
        const filtered = filterScheduledBuilds([]);
        expect(filtered).toHaveLength(0);
    });

    it('should exclude builds with undefined reason', () => {
        const builds = [
            { id: 1, reason: 'schedule', name: 'Build 1' },
            { id: 2, name: 'Build 2' }, // no reason property
            { id: 3, reason: undefined, name: 'Build 3' }
        ];

        const filtered = filterScheduledBuilds(builds);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe(1);
    });

    it('should handle case-sensitive reason comparison', () => {
        const builds = [
            { id: 1, reason: 'schedule', name: 'Build 1' },
            { id: 2, reason: 'Schedule', name: 'Build 2' }, // capital S
            { id: 3, reason: 'SCHEDULE', name: 'Build 3' } // all caps
        ];

        const filtered = filterScheduledBuilds(builds);
        expect(filtered).toHaveLength(1); // only lowercase 'schedule'
        expect(filtered[0].id).toBe(1);
    });

    it('should preserve all properties of scheduled builds', () => {
        const builds = [
            {
                id: 1,
                reason: 'schedule',
                name: 'Build 1',
                status: 'completed',
                result: 'succeeded',
                startTime: '2026-02-04T10:00:00Z',
                finishTime: '2026-02-04T10:30:00Z'
            }
        ];

        const filtered = filterScheduledBuilds(builds);
        expect(filtered[0]).toEqual(builds[0]);
    });

    it('should handle multiple scheduled builds in correct order', () => {
        const builds = [
            { id: 3, reason: 'manual', name: 'Build 3' },
            { id: 1, reason: 'schedule', name: 'Build 1' },
            { id: 4, reason: 'pullRequest', name: 'Build 4' },
            { id: 2, reason: 'schedule', name: 'Build 2' }
        ];

        const filtered = filterScheduledBuilds(builds);
        expect(filtered).toHaveLength(2);
        expect(filtered[0].id).toBe(1);
        expect(filtered[1].id).toBe(2);
    });

    it('should not mutate the original array', () => {
        const builds = [
            { id: 1, reason: 'schedule', name: 'Build 1' },
            { id: 2, reason: 'manual', name: 'Build 2' }
        ];
        const originalLength = builds.length;

        filterScheduledBuilds(builds);

        expect(builds).toHaveLength(originalLength);
        expect(builds.some(b => b.reason === 'manual')).toBe(true);
    });

    it('should work with large datasets', () => {
        const builds = Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            reason: i % 3 === 0 ? 'schedule' : i % 2 === 0 ? 'manual' : 'pullRequest',
            name: `Build ${i}`
        }));

        const filtered = filterScheduledBuilds(builds);
        // Roughly 1/3 should be scheduled (0 % 3 === 0)
        expect(filtered.length).toBeGreaterThan(300);
        expect(filtered.length).toBeLessThan(400);
        expect(filtered.every(b => b.reason === 'schedule')).toBe(true);
    });
});
