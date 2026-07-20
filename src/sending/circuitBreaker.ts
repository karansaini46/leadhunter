import { SendEvent } from "../db/sendEventsRepository";

export interface CircuitBreakerOptions {
  /** Fraction (0-1) of failed+negative_reply outcomes that trips the breaker. */
  negativeRateThreshold: number;
  /** Don't trip on tiny sample sizes — wait for at least this many events. */
  minSample: number;
}

export interface CircuitBreakerResult {
  paused: boolean;
  reason?: string;
  sampleSize: number;
  negativeRate: number;
}

/**
 * Pure decision function: given a window of recent send events, should the
 * channel pause itself? This is intentionally IO-free so it can be unit
 * tested with fixture data — the worker is responsible for fetching events
 * and acting on the result.
 */
export function evaluateCircuitBreaker(events: SendEvent[], options: CircuitBreakerOptions): CircuitBreakerResult {
  const sampleSize = events.length;

  if (sampleSize < options.minSample) {
    return { paused: false, sampleSize, negativeRate: 0 };
  }

  const negativeCount = events.filter((e) => e.outcome === "failed" || e.outcome === "negative_reply").length;
  const negativeRate = negativeCount / sampleSize;

  if (negativeRate >= options.negativeRateThreshold) {
    return {
      paused: true,
      reason: `Negative rate ${(negativeRate * 100).toFixed(1)}% over last ${sampleSize} sends exceeds threshold ${(
        options.negativeRateThreshold * 100
      ).toFixed(1)}%`,
      sampleSize,
      negativeRate,
    };
  }

  return { paused: false, sampleSize, negativeRate };
}
