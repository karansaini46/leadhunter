import { afterEach, describe, expect, it, vi } from "vitest";
import { extractDomain, fetchYcHiringLeads } from "../src/scrapers/yc";

function mockCompany(overrides: Record<string, unknown> = {}) {
  return {
    name: "TestCo",
    website: "https://testco.com",
    one_liner: "We help non-technical founders build their MVP without a CTO.",
    long_description: "Looking for a developer to help ship faster.",
    team_size: 5,
    batch: "W25",
    url: "https://www.ycombinator.com/companies/testco",
    tags: [],
    ...overrides,
  };
}

describe("extractDomain", () => {
  it("strips protocol and www", () => {
    expect(extractDomain("https://www.example.com")).toBe("example.com");
  });

  it("strips paths and query strings", () => {
    expect(extractDomain("https://example.com/path?query=1")).toBe("example.com");
  });

  it("returns null for an unparseable URL", () => {
    expect(extractDomain("not a url")).toBeNull();
  });
});

describe("fetchYcHiringLeads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps companies to raw leads with a computed score", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mockCompany()],
    });
    vi.stubGlobal("fetch", fetchMock);

    const leads = await fetchYcHiringLeads({ minScore: 0 });
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      source: "yc",
      company: "TestCo",
      companyDomain: "testco.com",
      name: null, // YC data is company-level, not person-level
      sourceUrl: "https://www.ycombinator.com/companies/testco",
    });
    expect(leads[0].score).toBeGreaterThan(30); // has positive ICP signals
  });

  it("filters out companies above maxTeamSize", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [mockCompany({ team_size: 500 })] })
    );

    const leads = await fetchYcHiringLeads({ maxTeamSize: 30, minScore: 0 });
    expect(leads).toHaveLength(0);
  });

  it("filters out leads below minScore", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [mockCompany({ one_liner: "A company.", long_description: "We do enterprise software." })],
      })
    );

    const leads = await fetchYcHiringLeads({ minScore: 90 });
    expect(leads).toHaveLength(0);
  });

  it("throws a clear error on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" }));
    await expect(fetchYcHiringLeads()).rejects.toThrow(/YC feed fetch failed/);
  });
});
