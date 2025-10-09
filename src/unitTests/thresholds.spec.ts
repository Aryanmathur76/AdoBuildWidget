import { describe, it, expect } from 'vitest';
import { getTestQuality, PIPELINE_TEST_THRESHOLDS } from '$lib/constants/thresholds';

describe('PIPELINE_TEST_THRESHOLDS', () => {
  it('should have good threshold at 98%', () => {
    expect(PIPELINE_TEST_THRESHOLDS.good).toBe(98);
  });

  it('should have ok threshold at 70%', () => {
    expect(PIPELINE_TEST_THRESHOLDS.ok).toBe(70);
  });
});

describe('getTestQuality', () => {
  describe('good quality (98% and above)', () => {
    it('should return "good" for 100% pass rate', () => {
      expect(getTestQuality(100)).toBe('good');
    });

    it('should return "good" for exactly 98% pass rate', () => {
      expect(getTestQuality(98)).toBe('good');
    });

    it('should return "good" for 99% pass rate', () => {
      expect(getTestQuality(99)).toBe('good');
    });

    it('should return "good" for 98.5% pass rate', () => {
      expect(getTestQuality(98.5)).toBe('good');
    });
  });

  describe('ok quality (70% to 97.99%)', () => {
    it('should return "ok" for exactly 70% pass rate', () => {
      expect(getTestQuality(70)).toBe('ok');
    });

    it('should return "ok" for 97% pass rate', () => {
      expect(getTestQuality(97)).toBe('ok');
    });

    it('should return "ok" for 97.99% pass rate (just below good threshold)', () => {
      expect(getTestQuality(97.99)).toBe('ok');
    });

    it('should return "ok" for 85% pass rate', () => {
      expect(getTestQuality(85)).toBe('ok');
    });

    it('should return "ok" for 70.01% pass rate', () => {
      expect(getTestQuality(70.01)).toBe('ok');
    });
  });

  describe('bad quality (below 70%)', () => {
    it('should return "bad" for 69.99% pass rate (just below ok threshold)', () => {
      expect(getTestQuality(69.99)).toBe('bad');
    });

    it('should return "bad" for 50% pass rate', () => {
      expect(getTestQuality(50)).toBe('bad');
    });

    it('should return "bad" for 0% pass rate', () => {
      expect(getTestQuality(0)).toBe('bad');
    });

    it('should return "bad" for 1% pass rate', () => {
      expect(getTestQuality(1)).toBe('bad');
    });

    it('should return "bad" for 69% pass rate', () => {
      expect(getTestQuality(69)).toBe('bad');
    });
  });

  describe('edge cases', () => {
    it('should handle decimal precision near good threshold', () => {
      expect(getTestQuality(97.999999)).toBe('ok');
      expect(getTestQuality(98.000001)).toBe('good');
    });

    it('should handle decimal precision near ok threshold', () => {
      expect(getTestQuality(69.999999)).toBe('bad');
      expect(getTestQuality(70.000001)).toBe('ok');
    });

    it('should handle very high decimal values', () => {
      expect(getTestQuality(99.99999)).toBe('good');
    });

    it('should handle negative values (edge case - should return bad)', () => {
      expect(getTestQuality(-1)).toBe('bad');
      expect(getTestQuality(-50)).toBe('bad');
    });

    it('should handle values over 100% (edge case - should return good)', () => {
      expect(getTestQuality(101)).toBe('good');
      expect(getTestQuality(150)).toBe('good');
    });
  });

  describe('boundary testing', () => {
    it('should correctly categorize values at exact boundaries', () => {
      // Just below good threshold
      expect(getTestQuality(97.9)).toBe('ok');
      // At good threshold
      expect(getTestQuality(98.0)).toBe('good');
      // Just above good threshold
      expect(getTestQuality(98.1)).toBe('good');

      // Just below ok threshold
      expect(getTestQuality(69.9)).toBe('bad');
      // At ok threshold
      expect(getTestQuality(70.0)).toBe('ok');
      // Just above ok threshold
      expect(getTestQuality(70.1)).toBe('ok');
    });
  });

  describe('real-world scenarios', () => {
    it('should return "good" for 100 passed, 0 failed (100%)', () => {
      const passRate = (100 / (100 + 0)) * 100;
      expect(getTestQuality(passRate)).toBe('good');
    });

    it('should return "good" for 98 passed, 2 failed (98%)', () => {
      const passRate = (98 / (98 + 2)) * 100;
      expect(getTestQuality(passRate)).toBe('good');
    });

    it('should return "ok" for 97 passed, 3 failed (97%)', () => {
      const passRate = (97 / (97 + 3)) * 100;
      expect(getTestQuality(passRate)).toBe('ok');
    });

    it('should return "ok" for 70 passed, 30 failed (70%)', () => {
      const passRate = (70 / (70 + 30)) * 100;
      expect(getTestQuality(passRate)).toBe('ok');
    });

    it('should return "bad" for 69 passed, 31 failed (69%)', () => {
      const passRate = (69 / (69 + 31)) * 100;
      expect(getTestQuality(passRate)).toBe('bad');
    });

    it('should return "bad" for 50 passed, 50 failed (50%)', () => {
      const passRate = (50 / (50 + 50)) * 100;
      expect(getTestQuality(passRate)).toBe('bad');
    });

    it('should return "bad" for 0 passed, 100 failed (0%)', () => {
      const passRate = (0 / (0 + 100)) * 100;
      expect(getTestQuality(passRate)).toBe('bad');
    });
  });
});
