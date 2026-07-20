import { EnrichmentResult } from "../types";
import { findEmailWithProspeo } from "./prospeoClient";
import { findEmailWithHunter, findGenericEmailWithHunter } from "./hunterClient";
import { findEmailWithSnov, findGenericEmailWithSnov } from "./snovClient";

const EMPTY_RESULT: EnrichmentResult = { email: null, verified: false, provider: null };

async function tryProvider(
  label: string,
  fn: () => Promise<EnrichmentResult | null>
): Promise<EnrichmentResult | null> {
  try {
    return await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`Enrichment provider ${label} threw, continuing waterfall:`, err);
    return null;
  }
}

export interface EnrichLeadInput {
  name: string | null;
  companyDomain: string | null;
}

/**
 * Tries providers in accuracy order, falling through to the next on a miss.
 * Name+domain lookups (Prospeo, then Hunter, then Snov) are tried first
 * when we have an actual person's name — Prospeo's 98%-accuracy claim and
 * built-in catch-all handling make it the best first guess. Company-only
 * leads (no scraped name, e.g. from YC) skip straight to domain-level
 * generic-inbox lookups, since the name-based endpoints need a name to
 * query against.
 */
export async function enrichLead(input: EnrichLeadInput): Promise<EnrichmentResult> {
  const { name, companyDomain } = input;
  if (!companyDomain) return EMPTY_RESULT;

  if (name) {
    const prospeoResult = await tryProvider("prospeo", () => findEmailWithProspeo(name, companyDomain));
    if (prospeoResult?.email) return prospeoResult;

    const hunterResult = await tryProvider("hunter (named)", () => findEmailWithHunter(name, companyDomain));
    if (hunterResult?.email) return hunterResult;

    const snovResult = await tryProvider("snov (named)", () => findEmailWithSnov(name, companyDomain));
    if (snovResult?.email) return snovResult;
  }

  // Either no name was available, or none of the named lookups found
  // anything — fall back to a domain-level generic inbox (info@, hello@,
  // or whichever named person Hunter/Snov already has indexed for the domain).
  const hunterGeneric = await tryProvider("hunter (domain)", () => findGenericEmailWithHunter(companyDomain));
  if (hunterGeneric?.email) return hunterGeneric;

  const snovGeneric = await tryProvider("snov (domain)", () => findGenericEmailWithSnov(companyDomain));
  if (snovGeneric?.email) return snovGeneric;

  return EMPTY_RESULT;
}
