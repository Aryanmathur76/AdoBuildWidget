import { describe, it, expect } from 'vitest';
import { determineOverallDayQuality } from '$lib/utils/getOverallDayQuality';

describe('determineOverallDayQuality', () => {
  describe('Priority Order - "in progress" status', () => {
    it('should return "in progress" when any status is "inProgress"', () => {
      const testCases = [
        ['inProgress'],
        ['good', 'inProgress'],
        ['bad', 'inProgress', 'ok'],
        ['failed', 'interrupted', 'inProgress', 'good'],
        ['inProgress', 'unknown']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('in progress');
      });
    });

    it('should prioritize "inProgress" over all other statuses', () => {
      const statuses = ['bad', 'failed', 'interrupted', 'ok', 'partially succeeded', 'good', 'succeeded', 'inProgress', 'unknown'];
      expect(determineOverallDayQuality(statuses)).toBe('in progress');
    });
  });

  describe('Priority Order - "interrupted" status', () => {
    it('should return "interrupted" when any status is "interrupted" and no "in progress"', () => {
      const testCases = [
        ['interrupted'],
        ['good', 'interrupted'],
        ['bad', 'interrupted', 'ok'],
        ['failed', 'interrupted', 'good'],
        ['interrupted', 'unknown']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('interrupted');
      });
    });

    it('should not return "interrupted" when "inProgress" is present', () => {
      const statuses = ['interrupted', 'inProgress', 'good'];
      expect(determineOverallDayQuality(statuses)).toBe('in progress');
    });
  });

  describe('Priority Order - "bad" status', () => {
    it('should return "bad" when any status is "bad" and no higher priority statuses', () => {
      const testCases = [
        ['bad'],
        ['good', 'bad'],
        ['bad', 'ok'],
        ['bad', 'good', 'succeeded'],
        ['bad', 'unknown']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('bad');
      });
    });

    it('should return "bad" when any status is "failed" and no higher priority statuses', () => {
      const testCases = [
        ['failed'],
        ['good', 'failed'],
        ['failed', 'ok'],
        ['failed', 'good', 'succeeded'],
        ['failed', 'unknown']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('bad');
      });
    });

    it('should return "bad" when both "bad" and "failed" are present', () => {
      const statuses = ['bad', 'failed', 'good'];
      expect(determineOverallDayQuality(statuses)).toBe('bad');
    });

    it('should not return "bad" when higher priority statuses are present', () => {
      expect(determineOverallDayQuality(['bad', 'inProgress'])).toBe('in progress');
      expect(determineOverallDayQuality(['failed', 'interrupted'])).toBe('interrupted');
    });
  });

  describe('Priority Order - "ok" status', () => {
    it('should return "ok" when any status is "ok" and no higher priority statuses', () => {
      const testCases = [
        ['ok'],
        ['good', 'ok'],
        ['ok', 'succeeded'],
        ['ok', 'unknown']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('ok');
      });
    });

    it('should return "ok" when any status is "partially succeeded" and no higher priority statuses', () => {
      const testCases = [
        ['partially succeeded'],
        ['good', 'partially succeeded'],
        ['partially succeeded', 'succeeded'],
        ['partially succeeded', 'unknown']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('ok');
      });
    });

    it('should return "ok" when both "ok" and "partially succeeded" are present', () => {
      const statuses = ['ok', 'partially succeeded', 'good'];
      expect(determineOverallDayQuality(statuses)).toBe('ok');
    });

    it('should not return "ok" when higher priority statuses are present', () => {
      expect(determineOverallDayQuality(['ok', 'inProgress'])).toBe('in progress');
      expect(determineOverallDayQuality(['partially succeeded', 'interrupted'])).toBe('interrupted');
      expect(determineOverallDayQuality(['ok', 'bad'])).toBe('bad');
      expect(determineOverallDayQuality(['partially succeeded', 'failed'])).toBe('bad');
    });
  });

  describe('Priority Order - "good" status', () => {
    it('should return "good" when all statuses are good/succeeded', () => {
      const testCases = [
        ['good'],
        ['succeeded'],
        ['good', 'succeeded'],
        ['good', 'good', 'good'],
        ['succeeded', 'succeeded'],
        ['good', 'succeeded', 'good']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('good');
      });
    });

    it('should return "good" for only succeeded statuses', () => {
      const testCases = [
        ['succeeded'],
        ['succeeded', 'succeeded']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('good');
      });
    });

    it('should not return "good" when any non-good/succeeded status is present', () => {
      const testCases = [
        ['good', 'bad'],
        ['succeeded', 'failed'],
        ['good', 'ok'],
        ['succeeded', 'partially succeeded'],
        ['good', 'interrupted'],
        ['succeeded', 'inProgress'],
        ['good', 'unknown']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).not.toBe('good');
      });
    });

    it('should not require "good" status for good determination', () => {
      // 'succeeded' without 'good' should now return 'good'
      expect(determineOverallDayQuality(['succeeded'])).toBe('good');
      expect(determineOverallDayQuality(['succeeded', 'succeeded'])).toBe('good');
    });
  });

  describe('Default - "unknown" status', () => {
    it('should return "good" for empty array', () => {
      // Empty array passes the "every" check (vacuous truth), so returns 'good'
      expect(determineOverallDayQuality([])).toBe('good');
    });

    it('should return "unknown" when only unknown statuses are present', () => {
      const testCases = [
        ['unknown'],
        ['pending'],
        ['unknown', 'pending'],
        ['unknown', 'unknown']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('unknown');
      });
    });

    it('should return "good" when only "succeeded" statuses', () => {
      const testCases = [
        ['succeeded'],
        ['succeeded', 'succeeded'],
        ['succeeded', 'good'],
        ['succeeded', 'good', 'succeeded']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('good');
      });
    });

    it('should return "unknown" for unrecognized statuses', () => {
      const testCases = [
        ['invalid'],
        ['random-status'],
        [''],
        ['null'],
        ['undefined']
      ];

      testCases.forEach(statuses => {
        expect(determineOverallDayQuality(statuses)).toBe('unknown');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle mixed case scenarios correctly', () => {
      // Complex scenarios with multiple status types
      expect(determineOverallDayQuality(['good', 'ok', 'bad'])).toBe('bad');
      expect(determineOverallDayQuality(['succeeded', 'partially succeeded', 'failed'])).toBe('bad');
      expect(determineOverallDayQuality(['good', 'ok', 'interrupted'])).toBe('interrupted');
      expect(determineOverallDayQuality(['succeeded', 'partially succeeded', 'inProgress'])).toBe('in progress');
    });

    it('should handle duplicate statuses', () => {
      expect(determineOverallDayQuality(['good', 'good', 'good'])).toBe('good');
      expect(determineOverallDayQuality(['bad', 'bad', 'ok'])).toBe('bad');
      expect(determineOverallDayQuality(['inProgress', 'inProgress'])).toBe('in progress');
    });

    it('should handle single status scenarios', () => {
      expect(determineOverallDayQuality(['inProgress'])).toBe('in progress');
      expect(determineOverallDayQuality(['interrupted'])).toBe('interrupted');
      expect(determineOverallDayQuality(['bad'])).toBe('bad');
      expect(determineOverallDayQuality(['failed'])).toBe('bad');
      expect(determineOverallDayQuality(['ok'])).toBe('ok');
      expect(determineOverallDayQuality(['partially succeeded'])).toBe('ok');
      expect(determineOverallDayQuality(['good'])).toBe('good');
      expect(determineOverallDayQuality(['succeeded'])).toBe('good');
      expect(determineOverallDayQuality(['unknown'])).toBe('unknown');
    });

    it('should handle large arrays efficiently', () => {
      const largeArray = new Array(1000).fill('good');
      largeArray.push('bad'); // One bad status should make it bad
      expect(determineOverallDayQuality(largeArray)).toBe('bad');

      const allGoodArray = new Array(1000).fill('good');
      expect(determineOverallDayQuality(allGoodArray)).toBe('good');
    });

    it('should be case sensitive', () => {
      // Assuming the function is case sensitive based on the implementation
      expect(determineOverallDayQuality(['Good'])).toBe('unknown'); // Capital G
      expect(determineOverallDayQuality(['INPROGRESS'])).toBe('unknown'); // All caps
      expect(determineOverallDayQuality(['Bad'])).toBe('unknown'); // Capital B
    });
  });

  describe('Comprehensive Priority Testing', () => {
    it('should follow exact priority order: inProgress > interrupted > bad/failed > ok/partially succeeded > good > unknown', () => {
      const allStatuses = [
        'unknown', 'pending', 'succeeded', 'good', 
        'partially succeeded', 'ok', 'failed', 'bad', 
        'interrupted', 'inProgress'
      ];

      // Test each priority level
      expect(determineOverallDayQuality(allStatuses)).toBe('in progress');
      
      const withoutInProgress = allStatuses.filter(s => s !== 'inProgress');
      expect(determineOverallDayQuality(withoutInProgress)).toBe('interrupted');
      
      const withoutInterrupted = withoutInProgress.filter(s => s !== 'interrupted');
      expect(determineOverallDayQuality(withoutInterrupted)).toBe('bad');
      
      const withoutBadFailed = withoutInterrupted.filter(s => !['bad', 'failed'].includes(s));
      expect(determineOverallDayQuality(withoutBadFailed)).toBe('ok');
      
      const withoutOkPartial = withoutBadFailed.filter(s => !['ok', 'partially succeeded'].includes(s));
      // withoutOkPartial contains ['unknown', 'pending', 'succeeded', 'good']
      // Since 'unknown' and 'pending' are not in ['good', 'succeeded'], this should return 'unknown'
      expect(determineOverallDayQuality(withoutOkPartial)).toBe('unknown');
      
      // Test with only good/succeeded statuses
      const onlyGoodSucceeded = ['good', 'succeeded'];
      expect(determineOverallDayQuality(onlyGoodSucceeded)).toBe('good');
      
      // Test with only succeeded statuses (should now return 'good')
      const onlySucceeded = ['succeeded', 'succeeded'];
      expect(determineOverallDayQuality(onlySucceeded)).toBe('good');
    });
  });
});

