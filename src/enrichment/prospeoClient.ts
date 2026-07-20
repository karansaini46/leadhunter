import { EnrichmentResult } from "../types";
import { env } from "../config/env";

/**
 * Prospeo retired /email-finder in favor of /enrich-person (migration
 * deadline was March 2026 — the old endpoint is gone as of this writing).
 * Requires a full name, so this is only useful for leads where we scraped
 * an actual person (X search), not company-only leads (YC) — see
 * enrichment/waterfall.ts for how that split is handled.
 *
 * The exact response shape for /enrich-person wasn't fully documented at
 * the time this was written, so parsing below checks a couple of plausible
 * field paths and fails soft (returns null) on anything unexpected rather
 * than throwing — verify against your own Prospeo dashboard response if
 * this starts returning nulls for leads you'd expect to resolve.
 */
const PROSPEO_ENDPOINT = "https://api.prospeo.io/enrich-person";

interface ProspeoResponse {
  error: boolean;
  response?: {
    email?: string;
    email_status?: string;
    [key: string]: unknown;
  };
  message?: string;
}

export async function findEmailWithProspeo(fullName: string, companyDomain: string): Promise<EnrichmentResult | null> {
  if (!env.PROSPEO_API_KEY) return null;

  const res = await fetch(PROSPEO_ENDPOINT, {
    method: "POST",
    headers: {
      "X-KEY": env.PROSPEO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      only_verified_email: true,
      data: { full_name: fullName, company_website: companyDomain },
    }),
  });

  if (!res.ok) {
    // 404/no-match responses are expected and common — only genuinely
    // unexpected statuses are worth surfacing.
    if (res.status !== 404) {
      // eslint-disable-next-line no-console
      console.warn(`Prospeo request failed: ${res.status} ${res.statusText}`);
    }
    return null;
  }

  const data = (await res.json()) as ProspeoResponse;
  if (data.error || !data.response) return null;

  const email = data.response.email;
  if (!email) return null;

  const verified = data.response.email_status?.toUpperCase() === "VALID";
  return { email, verified, provider: "prospeo" };
}
