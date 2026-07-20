import { RawLead } from "../types";
import { scoreLead } from "../scoring/scoreLead";

/**
 * yc-oss/api (https://github.com/yc-oss/api) republishes YC's own Algolia
 * company-directory index as static JSON, refreshed daily. It's unofficial
 * but stable and requires no key or login — verified working at build time
 * of this file. If it ever goes down, the same data is also fetchable by
 * extracting YC's live Algolia search key from ycombinator.com/companies
 * (see the several "yc scraper" tools on GitHub/Apify that do this), but
 * that key rotates and is more maintenance than this endpoint is worth.
 */
const YC_HIRING_ENDPOINT = "https://yc-oss.github.io/api/companies/hiring.json";

interface YcCompany {
  name: string;
  website: string;
  one_liner: string;
  long_description: string;
  team_size: number;
  batch: string;
  url: string;
  tags: string[];
}

export function extractDomain(websiteUrl: string): string | null {
  try {
    const { hostname } = new URL(websiteUrl);
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function toRawLead(company: YcCompany): RawLead {
  const rawText = `${company.one_liner}\n\n${company.long_description}`;
  return {
    source: "yc",
    sourceUrl: company.url,
    name: null, // YC's directory is company-level; enrichment falls back to domain search for these
    company: company.name,
    companyDomain: extractDomain(company.website),
    xHandle: null,
    rawText,
    score: scoreLead(rawText),
  };
}

export interface FetchYcLeadsOptions {
  /** Skip companies past this team size — very large teams usually have their own eng org. */
  maxTeamSize?: number;
  /** Minimum score (see scoreLead.ts) to keep. */
  minScore?: number;
}

export async function fetchYcHiringLeads(options: FetchYcLeadsOptions = {}): Promise<RawLead[]> {
  const { maxTeamSize = 30, minScore = 0 } = options;

  const res = await fetch(YC_HIRING_ENDPOINT);
  if (!res.ok) {
    throw new Error(`YC feed fetch failed: ${res.status} ${res.statusText}`);
  }
  const companies = (await res.json()) as YcCompany[];

  return companies
    .filter((c) => c.website && c.team_size <= maxTeamSize)
    .map(toRawLead)
    .filter((lead) => (lead.score ?? 0) >= minScore);
}
