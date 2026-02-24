import { describe, it, expect } from 'vitest';
import {
  BUILD_STATUS_COLORS,
  HEADER_STATUS_COLORS,
  PIPELINE_BADGE_COLORS,
  getBuildStatusColor,
  getHeaderStatusColor,
  getPipelineBadgeColor,
  getPipelineBadgeText
} from '../lib/constants/colors';

describe('Color Constants', () => {
  describe('BUILD_STATUS_COLORS', () => {
    it('should have all required status colors defined', () => {
      expect(BUILD_STATUS_COLORS.good).toBe('bg-[var(--success)] text-white');
      expect(BUILD_STATUS_COLORS.ok).toBe('bg-[var(--partially-succeeded)] text-black');
      expect(BUILD_STATUS_COLORS.bad).toBe('bg-[var(--failure)] text-white');
      expect(BUILD_STATUS_COLORS.inProgress).toBe('bg-[var(--in-progress)] text-white');
      expect(BUILD_STATUS_COLORS.interrupted).toBe('bg-[var(--interrupted)] text-white');
      expect(BUILD_STATUS_COLORS.unknown).toBe('bg-zinc-700 text-white');
      expect(BUILD_STATUS_COLORS.default).toBe('bg-zinc-700 text-white');
    });
  });

  describe('HEADER_STATUS_COLORS', () => {
    it('should have all required header status colors defined', () => {
      expect(HEADER_STATUS_COLORS.good).toBe('bg-[var(--success)] text-white');
      expect(HEADER_STATUS_COLORS.ok).toBe('bg-[var(--partially-succeeded)] text-black');
      expect(HEADER_STATUS_COLORS.bad).toBe('bg-[var(--failure)] text-white');
      expect(HEADER_STATUS_COLORS.inProgress).toBe('bg-[var(--in-progress)] text-white');
      expect(HEADER_STATUS_COLORS.interrupted).toBe('bg-[var(--interrupted)] text-white');
      expect(HEADER_STATUS_COLORS.unknown).toBe('bg-zinc-700 text-white');
      expect(HEADER_STATUS_COLORS.default).toBe('bg-zinc-700 text-white');
    });
  });

  describe('PIPELINE_BADGE_COLORS', () => {
    it('should have all required pipeline badge colors defined', () => {
      expect(PIPELINE_BADGE_COLORS.good).toBe('bg-[var(--success)] text-white');
      expect(PIPELINE_BADGE_COLORS.succeeded).toBe('bg-[var(--success)] text-white');
      expect(PIPELINE_BADGE_COLORS.bad).toBe('bg-[var(--failure)] text-white');
      expect(PIPELINE_BADGE_COLORS.failed).toBe('bg-[var(--failure)] text-white');
      expect(PIPELINE_BADGE_COLORS.ok).toBe('bg-[var(--partially-succeeded)] text-black');
      expect(PIPELINE_BADGE_COLORS['partially-succeeded']).toBe('bg-[var(--partially-succeeded)] text-black');
      expect(PIPELINE_BADGE_COLORS.inProgress).toBe('bg-[var(--in-progress)] text-white');
      expect(PIPELINE_BADGE_COLORS['in progress']).toBe('bg-[var(--in-progress)] text-white');
      expect(PIPELINE_BADGE_COLORS.interrupted).toBe('bg-[var(--interrupted)] text-white');
      expect(PIPELINE_BADGE_COLORS.unknown).toBe('bg-zinc-700 text-white');
      expect(PIPELINE_BADGE_COLORS.default).toBe('bg-zinc-700 text-white');
    });

    it('should have matching colors for status aliases', () => {
      expect(PIPELINE_BADGE_COLORS.good).toBe(PIPELINE_BADGE_COLORS.succeeded);
      expect(PIPELINE_BADGE_COLORS.bad).toBe(PIPELINE_BADGE_COLORS.failed);
      expect(PIPELINE_BADGE_COLORS.ok).toBe(PIPELINE_BADGE_COLORS['partially-succeeded']);
      expect(PIPELINE_BADGE_COLORS.inProgress).toBe(PIPELINE_BADGE_COLORS['in progress']);
    });
  });
});

describe('getBuildStatusColor', () => {
  it('should return correct colors for valid statuses', () => {
    expect(getBuildStatusColor('good')).toBe('bg-[var(--success)] text-white');
    expect(getBuildStatusColor('ok')).toBe('bg-[var(--partially-succeeded)] text-black');
    expect(getBuildStatusColor('bad')).toBe('bg-[var(--failure)] text-white');
    expect(getBuildStatusColor('inProgress')).toBe('bg-[var(--in-progress)] text-white');
    expect(getBuildStatusColor('interrupted')).toBe('bg-[var(--interrupted)] text-white');
    expect(getBuildStatusColor('unknown')).toBe('bg-zinc-700 text-white');
  });

  it('should return default color for invalid statuses', () => {
    expect(getBuildStatusColor('invalid')).toBe('bg-zinc-700 text-white');
    expect(getBuildStatusColor('')).toBe('bg-zinc-700 text-white');
    expect(getBuildStatusColor('randomStatus')).toBe('bg-zinc-700 text-white');
  });

  it('should handle edge cases', () => {
    expect(getBuildStatusColor(null as any)).toBe('bg-zinc-700 text-white');
    expect(getBuildStatusColor(undefined as any)).toBe('bg-zinc-700 text-white');
    expect(getBuildStatusColor(123 as any)).toBe('bg-zinc-700 text-white');
  });
});

describe('getHeaderStatusColor', () => {
  it('should return correct colors for valid statuses', () => {
    expect(getHeaderStatusColor('good')).toBe('bg-[var(--success)] text-white');
    expect(getHeaderStatusColor('ok')).toBe('bg-[var(--partially-succeeded)] text-black');
    expect(getHeaderStatusColor('bad')).toBe('bg-[var(--failure)] text-white');
    expect(getHeaderStatusColor('inProgress')).toBe('bg-[var(--in-progress)] text-white');
    expect(getHeaderStatusColor('interrupted')).toBe('bg-[var(--interrupted)] text-white');
    expect(getHeaderStatusColor('unknown')).toBe('bg-zinc-700 text-white');
  });

  it('should return default color for invalid statuses', () => {
    expect(getHeaderStatusColor('invalid')).toBe('bg-zinc-700 text-white');
    expect(getHeaderStatusColor('')).toBe('bg-zinc-700 text-white');
    expect(getHeaderStatusColor('randomStatus')).toBe('bg-zinc-700 text-white');
  });

  it('should handle edge cases', () => {
    expect(getHeaderStatusColor(null as any)).toBe('bg-zinc-700 text-white');
    expect(getHeaderStatusColor(undefined as any)).toBe('bg-zinc-700 text-white');
    expect(getHeaderStatusColor(123 as any)).toBe('bg-zinc-700 text-white');
  });
});

describe('getPipelineBadgeColor', () => {
  it('should return correct colors for valid statuses', () => {
    expect(getPipelineBadgeColor('good')).toBe('bg-[var(--success)] text-white');
    expect(getPipelineBadgeColor('succeeded')).toBe('bg-[var(--success)] text-white');
    expect(getPipelineBadgeColor('bad')).toBe('bg-[var(--failure)] text-white');
    expect(getPipelineBadgeColor('failed')).toBe('bg-[var(--failure)] text-white');
    expect(getPipelineBadgeColor('ok')).toBe('bg-[var(--partially-succeeded)] text-black');
    expect(getPipelineBadgeColor('partially-succeeded')).toBe('bg-[var(--partially-succeeded)] text-black');
    expect(getPipelineBadgeColor('inProgress')).toBe('bg-[var(--in-progress)] text-white');
    expect(getPipelineBadgeColor('in progress')).toBe('bg-[var(--in-progress)] text-white');
    expect(getPipelineBadgeColor('interrupted')).toBe('bg-[var(--interrupted)] text-white');
    expect(getPipelineBadgeColor('unknown')).toBe('bg-zinc-700 text-white');
  });

  it('should return default color for invalid statuses', () => {
    expect(getPipelineBadgeColor('invalid')).toBe('bg-zinc-700 text-white');
    expect(getPipelineBadgeColor('')).toBe('bg-zinc-700 text-white');
    expect(getPipelineBadgeColor('randomStatus')).toBe('bg-zinc-700 text-white');
  });

  it('should handle edge cases', () => {
    expect(getPipelineBadgeColor(null as any)).toBe('bg-zinc-700 text-white');
    expect(getPipelineBadgeColor(undefined as any)).toBe('bg-zinc-700 text-white');
    expect(getPipelineBadgeColor(123 as any)).toBe('bg-zinc-700 text-white');
  });
});

describe('getPipelineBadgeText', () => {
  it('should return correct text for valid statuses', () => {
    expect(getPipelineBadgeText('good')).toBe('Good');
    expect(getPipelineBadgeText('succeeded')).toBe('Good');
    expect(getPipelineBadgeText('bad')).toBe('Bad');
    expect(getPipelineBadgeText('failed')).toBe('Bad');
    expect(getPipelineBadgeText('ok')).toBe('Partially Succeeded');
    expect(getPipelineBadgeText('partially-succeeded')).toBe('Partially Succeeded');
    expect(getPipelineBadgeText('inProgress')).toBe('In Progress');
    expect(getPipelineBadgeText('in progress')).toBe('In Progress');
    expect(getPipelineBadgeText('interrupted')).toBe('Interrupted');
    expect(getPipelineBadgeText('unknown')).toBe('Unknown');
  });

  it('should return "Unknown" for invalid statuses', () => {
    expect(getPipelineBadgeText('invalid')).toBe('Unknown');
    expect(getPipelineBadgeText('')).toBe('Unknown');
    expect(getPipelineBadgeText('randomStatus')).toBe('Unknown');
  });

  it('should handle edge cases', () => {
    expect(getPipelineBadgeText(null as any)).toBe('Unknown');
    expect(getPipelineBadgeText(undefined as any)).toBe('Unknown');
    expect(getPipelineBadgeText(123 as any)).toBe('Unknown');
  });

  it('should handle case sensitivity', () => {
    expect(getPipelineBadgeText('GOOD')).toBe('Unknown');
    expect(getPipelineBadgeText('Good')).toBe('Unknown');
    expect(getPipelineBadgeText('BAD')).toBe('Unknown');
    expect(getPipelineBadgeText('Bad')).toBe('Unknown');
  });
});

describe('Color Consistency', () => {
  it('should have consistent color schemes between different constant objects', () => {
    // Build and pipeline badge colors should match for common statuses
    expect(BUILD_STATUS_COLORS.good).toBe(PIPELINE_BADGE_COLORS.good);
    expect(BUILD_STATUS_COLORS.ok).toBe(PIPELINE_BADGE_COLORS.ok);
    expect(BUILD_STATUS_COLORS.bad).toBe(PIPELINE_BADGE_COLORS.bad);
    expect(BUILD_STATUS_COLORS.inProgress).toBe(PIPELINE_BADGE_COLORS.inProgress);
    expect(BUILD_STATUS_COLORS.interrupted).toBe(PIPELINE_BADGE_COLORS.interrupted);
    expect(BUILD_STATUS_COLORS.unknown).toBe(PIPELINE_BADGE_COLORS.unknown);
    expect(BUILD_STATUS_COLORS.default).toBe(PIPELINE_BADGE_COLORS.default);
  });

  it('should have proper Tailwind CSS class format', () => {
    // Matches both bg-zinc-700 (static) and bg-[var(--some-var)] (CSS variable) forms
    const tailwindClassPattern = /^bg-(\w+-\d+|\[var\(--[\w-]+\)\])(\s+text-[\w-]+)?$/;

    Object.values(BUILD_STATUS_COLORS).forEach(color => {
      expect(color).toMatch(tailwindClassPattern);
    });

    Object.values(PIPELINE_BADGE_COLORS).forEach(color => {
      expect(color).toMatch(tailwindClassPattern);
    });

    Object.values(HEADER_STATUS_COLORS).forEach(color => {
      expect(color).toMatch(tailwindClassPattern);
    });
  });
});