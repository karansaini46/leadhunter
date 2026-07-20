import { EnrichmentResult } from "../types";
import { env } from "../config/env";

const BASE_URL = "https://api.hunter.io/v2";
// Hunter's `score` is a 0-100 confidence estimate, not a binary verified
// flag — we treat high-confidence hits as verified rather than spending an
// extra credit on a separate email-verifier call for every result.
const VERIFIED_SCORE_THRESHOLD = 90;

interface HunterEmailFinderResponse {
  data: { email: string | null; score: number } | null;
}

interface HunterDomainSearchResponse {
  data: {
    emails: { value: string; type: "generic" | "personal"; confidence: number }[];
  } | null;
}

function splitName(fullName: string): { firstName: string; lastName: string } | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Name + domain lookup — use when the lead has an actual person's name. */
export async function findEmailWithHunter(fullName: string, companyDomain: string): Promise<EnrichmentResult | null> {
  if (!env.HUNTER_API_KEY) return null;
  const name = splitName(fullName);
  if (!name) return null;

  const url = new URL(`${BASE_URL}/email-finder`);
  url.searchParams.set("domain", companyDomain);
  url.searchParams.set("first_name", name.firstName);
  url.searchParams.set("last_name", name.lastName);
  url.searchParams.set("api_key", env.HUNTER_API_KEY);

  const res = await fetch(url);
  if (!res.ok) return null;

  const body = (await res.json()) as HunterEmailFinderResponse;
  if (!body.data?.email) return null;

  return {
    email: body.data.email,
    verified: body.data.score >= VERIFIED_SCORE_THRESHOLD,
    provider: "hunter",
  };
}

/** Domain-only lookup — use for company-level leads with no known person (e.g. YC-sourced). */
export async function findGenericEmailWithHunter(companyDomain: string): Promise<EnrichmentResult | null> {
  if (!env.HUNTER_API_KEY) return null;

  const url = new URL(`${BASE_URL}/domain-search`);
  url.searchParams.set("domain", companyDomain);
  url.searchParams.set("api_key", env.HUNTER_API_KEY);

  const res = await fetch(url);
  if (!res.ok) return null;

  const body = (await res.json()) as HunterDomainSearchResponse;
  const emails = body.data?.emails ?? [];
  if (emails.length === 0) return null;

  // Prefer a named person over a role inbox; fall back to the generic one.
  const best = [...emails].sort((a, b) => b.confidence - a.confidence)[0];
  return {
    email: best.value,
    verified: best.confidence >= VERIFIED_SCORE_THRESHOLD,
    provider: "hunter",
  };
}
