import { describe, expect, it } from "vitest";
import { scoreLead } from "../src/scoring/scoreLead";

describe("scoreLead", () => {
  it("gives a plain bio the base score", () => {
    expect(scoreLead("We are a company that does things.")).toBe(30);
  });

  it("rewards positive ICP signals", () => {
    const score = scoreLead("Non-technical founder looking for a developer to build our MVP, no CTO yet.");
    expect(score).toBeGreaterThan(30);
  });

  it("caps positive contribution instead of scaling unboundedly", () => {
    const manySignals = "mvp no engineer non-technical founder looking for a developer need help building need a developer technical co-founder no cto outsource contractor freelance developer freelancer agency build our product build my product ship faster solo founder";
    expect(scoreLead(manySignals)).toBe(80); // 30 base + 50 max positive contribution
  });

  it("heavily penalizes explicit agency-exclusion language", () => {
    const score = scoreLead("Hiring a senior engineer, full-time only. No agencies or recruiters please.");
    expect(score).toBe(0);
  });

  it("clamps to 0 minimum", () => {
    const score = scoreLead("no agencies no recruiters no contractors agencies please do not contact");
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("is case-insensitive", () => {
    expect(scoreLead("LOOKING FOR A DEVELOPER")).toBe(scoreLead("looking for a developer"));
  });
});
