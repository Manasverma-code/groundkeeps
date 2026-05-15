import { describe, it, expect } from 'vitest';
import { TemporalChecker } from '../temporal.js';

describe('TemporalChecker', () => {
  it('marks recent dates as fresh', () => {
    const checker = new TemporalChecker(90);
    const recent = new Date(Date.now() - 10 * 86400000).toISOString();
    const result = checker.checkTimestamps([recent]);
    expect(result.allFresh).toBe(true);
    expect(result.staleCount).toBe(0);
  });

  it('marks old dates as stale', () => {
    const checker = new TemporalChecker(90);
    const old = new Date(Date.now() - 200 * 86400000).toISOString();
    const result = checker.checkTimestamps([old]);
    expect(result.allFresh).toBe(false);
    expect(result.staleCount).toBe(1);
  });

  it('handles undefined timestamps', () => {
    const checker = new TemporalChecker(90);
    const result = checker.checkTimestamps([undefined]);
    expect(result.results[0].isStale).toBe(false);
    expect(result.results[0].isParseable).toBe(false);
  });

  it('respects custom threshold', () => {
    const checker = new TemporalChecker(30);
    const slightlyOld = new Date(Date.now() - 60 * 86400000).toISOString();
    const result = checker.checkTimestamps([slightlyOld]);
    expect(result.allFresh).toBe(false);
    expect(result.staleCount).toBe(1);
  });

  it('handles invalid date strings', () => {
    const checker = new TemporalChecker(90);
    const result = checker.checkTimestamps(['not-a-date']);
    expect(result.results[0].isParseable).toBe(false);
    expect(result.results[0].ageDays).toBeNull();
  });
});
