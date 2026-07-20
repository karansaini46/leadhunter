import { describe, expect, it } from "vitest";
import { isUnderDailyLimit, nextDelayMs, pickVariant } from "../src/sending/pacing";

describe("nextDelayMs", () => {
  const config = { dailyLimit: 20, minDelaySeconds: 100, maxDelaySeconds: 200 };

  it("stays within the configured bounds", () => {
    for (let i = 0; i < 200; i++) {
      const ms = nextDelayMs(config);
      expect(ms).toBeGreaterThanOrEqual(100_000);
      expect(ms).toBeLessThanOrEqual(200_000);
    }
  });

  it("is deterministic given a fixed random source", () => {
    expect(nextDelayMs(config, () => 0)).toBe(100_000);
    expect(nextDelayMs(config, () => 1)).toBe(200_000);
    expect(nextDelayMs(config, () => 0.5)).toBe(150_000);
  });

  it("throws if min exceeds max", () => {
    expect(() => nextDelayMs({ dailyLimit: 1, minDelaySeconds: 300, maxDelaySeconds: 100 })).toThrow();
  });
});

describe("isUnderDailyLimit", () => {
  const config = { dailyLimit: 20, minDelaySeconds: 1, maxDelaySeconds: 2 };

  it("allows sending below the limit", () => {
    expect(isUnderDailyLimit(19, config)).toBe(true);
  });

  it("blocks sending at or above the limit", () => {
    expect(isUnderDailyLimit(20, config)).toBe(false);
    expect(isUnderDailyLimit(25, config)).toBe(false);
  });
});

describe("pickVariant", () => {
  it("cycles through variants by index", () => {
    const variants = ["a", "b", "c"];
    expect(pickVariant(variants, 0)).toBe("a");
    expect(pickVariant(variants, 1)).toBe("b");
    expect(pickVariant(variants, 3)).toBe("a"); // wraps around
  });

  it("throws on an empty variant list", () => {
    expect(() => pickVariant([], 0)).toThrow();
  });
});
