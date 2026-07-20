import { describe, expect, it } from "vitest";
import { contactKey, dedupeLeads } from "../src/dedupe/dedupeKey";
import { RawLead } from "../src/types";

function lead(overrides: Partial<RawLead>): RawLead {
  return {
    source: "x_search",
    sourceUrl: "https://x.com/foo/status/1",
    name: null,
    company: null,
    companyDomain: null,
    xHandle: null,
    rawText: "",
    ...overrides,
  };
}

describe("contactKey", () => {
  it("prefers email over x handle", () => {
    expect(contactKey({ email: "a@b.com", xHandle: "handle" })).toBe("email:a@b.com");
  });

  it("normalizes email case and whitespace", () => {
    expect(contactKey({ email: "  Foo@BAR.com ", xHandle: null })).toBe("email:foo@bar.com");
  });

  it("strips leading @ from x handles", () => {
    expect(contactKey({ email: null, xHandle: "@SomeUser" })).toBe("x:someuser");
  });

  it("returns null when neither is present", () => {
    expect(contactKey({ email: null, xHandle: null })).toBeNull();
  });
});

describe("dedupeLeads", () => {
  it("collapses leads with the same email", () => {
    const leads = [
      lead({ sourceUrl: "u1", rawText: "first" }),
      lead({ sourceUrl: "u2", rawText: "second" }),
    ].map((l, i) => ({ ...l, ...(i === 0 ? { xHandle: "sameuser" } : { xHandle: "sameuser" }) }));

    const result = dedupeLeads(leads);
    expect(result).toHaveLength(1);
    expect(result[0].sourceUrl).toBe("u1"); // first occurrence wins
  });

  it("keeps leads with no resolvable contact key (pre-enrichment company leads)", () => {
    const leads = [lead({ sourceUrl: "u1" }), lead({ sourceUrl: "u2" })];
    expect(dedupeLeads(leads)).toHaveLength(2);
  });

  it("treats different contacts as distinct", () => {
    const leads = [lead({ sourceUrl: "u1", xHandle: "alice" }), lead({ sourceUrl: "u2", xHandle: "bob" })];
    expect(dedupeLeads(leads)).toHaveLength(2);
  });
});
