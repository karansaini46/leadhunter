import { describe, expect, it } from "vitest";
import { evaluateCircuitBreaker } from "../src/sending/circuitBreaker";
import { SendEvent } from "../src/db/sendEventsRepository";

const OPTIONS = { negativeRateThreshold: 0.15, minSample: 5 };

function events(outcomes: SendEvent["outcome"][]): SendEvent[] {
  return outcomes.map((outcome) => ({ outcome, createdAt: new Date().toISOString() }));
}

describe("evaluateCircuitBreaker", () => {
  it("does not trip below the minimum sample size, even with all failures", () => {
    const result = evaluateCircuitBreaker(events(["failed", "failed", "failed"]), OPTIONS);
    expect(result.paused).toBe(false);
  });

  it("stays closed when the negative rate is under threshold", () => {
    // 1 negative out of 10 = 10%, threshold is 15%
    const result = evaluateCircuitBreaker(events(["sent", "sent", "sent", "sent", "sent", "sent", "sent", "sent", "sent", "failed"]), OPTIONS);
    expect(result.paused).toBe(false);
    expect(result.negativeRate).toBeCloseTo(0.1);
  });

  it("trips when the negative rate meets the threshold", () => {
    // 2 negative out of 10 = 20%, threshold is 15%
    const outcomes: SendEvent["outcome"][] = ["sent", "sent", "sent", "sent", "sent", "sent", "sent", "sent", "failed", "negative_reply"];
    const result = evaluateCircuitBreaker(events(outcomes), OPTIONS);
    expect(result.paused).toBe(true);
    expect(result.reason).toContain("Negative rate");
  });

  it("counts both failed and negative_reply as negative outcomes", () => {
    const outcomes: SendEvent["outcome"][] = new Array(5).fill("negative_reply");
    const result = evaluateCircuitBreaker(events(outcomes), OPTIONS);
    expect(result.paused).toBe(true);
    expect(result.negativeRate).toBe(1);
  });

  it("reports sample size and negative rate even when not tripped", () => {
    const result = evaluateCircuitBreaker(events(["sent", "sent", "sent", "sent", "sent"]), OPTIONS);
    expect(result.sampleSize).toBe(5);
    expect(result.negativeRate).toBe(0);
  });
});
