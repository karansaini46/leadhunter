import { describe, expect, it } from "vitest";
import { EMAIL_VARIANT_COUNT, renderEmail } from "../src/sending/emailTemplates";

describe("renderEmail", () => {
  it("fills in the company name in the subject", () => {
    const { subject } = renderEmail(0, { name: "Sam", company: "Acme" });
    expect(subject.toLowerCase()).toContain("acme");
  });

  it("falls back gracefully when name/company are missing", () => {
    const { subject, text } = renderEmail(0, { name: null, company: null });
    expect(subject).not.toContain("undefined");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });

  it("always includes a physical address and an unsubscribe mechanism (CAN-SPAM)", () => {
    const { text } = renderEmail(0, { name: "Sam", company: "Acme" });
    expect(text).toContain("123 Test St"); // from tests/setup.ts
    expect(text.toLowerCase()).toContain("unsubscribe");
    expect(text).toContain("mailto:");
  });

  it("wraps around when the variant index exceeds the variant count", () => {
    const a = renderEmail(0, { name: "Sam", company: "Acme" });
    const wrapped = renderEmail(EMAIL_VARIANT_COUNT, { name: "Sam", company: "Acme" });
    expect(wrapped.subject).toBe(a.subject);
  });

  it("produces different wording across variants", () => {
    const subjects = new Set(
      Array.from({ length: EMAIL_VARIANT_COUNT }, (_, i) => renderEmail(i, { name: "Sam", company: "Acme" }).subject)
    );
    expect(subjects.size).toBe(EMAIL_VARIANT_COUNT);
  });
});
