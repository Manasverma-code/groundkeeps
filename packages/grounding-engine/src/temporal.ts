export class TemporalChecker {
  private defaultThresholdDays: number;

  constructor(thresholdDays: number = 90) {
    this.defaultThresholdDays = thresholdDays;
  }

  checkTimestamps(timestamps: (string | undefined)[]): TemporalCheckResult {
    const results = timestamps.map((ts) => ({
      timestamp: ts,
      ageDays: ts ? this.ageInDays(ts) : null,
      isStale: ts ? this.isStale(ts, this.defaultThresholdDays) : false,
      isParseable: ts ? this.isValidDate(ts) : false,
    }));

    const staleCount = results.filter((r) => r.isStale).length;
    const unparseableCount = results.filter((r) => !r.isParseable && r.timestamp !== undefined).length;

    return {
      results,
      staleCount,
      unparseableCount,
      totalCount: timestamps.length,
      allFresh: staleCount === 0,
    };
  }

  private isStale(timestamp: string, thresholdDays: number): boolean {
    const days = this.ageInDays(timestamp);
    if (days === null) return false;
    return days > thresholdDays;
  }

  private ageInDays(timestamp: string): number | null {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return null;
    return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  }

  private isValidDate(timestamp: string): boolean {
    return !isNaN(new Date(timestamp).getTime());
  }
}

export interface TemporalCheckResult {
  results: {
    timestamp: string | undefined;
    ageDays: number | null;
    isStale: boolean;
    isParseable: boolean;
  }[];
  staleCount: number;
  unparseableCount: number;
  totalCount: number;
  allFresh: boolean;
}
