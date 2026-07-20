export type LeadSource = "yc" | "x_search" | "wellfound";

export type LeadStatus =
  | "new"
  | "enriched"
  | "enrichment_failed"
  | "queued"
  | "sent"
  | "replied"
  | "opted_out"
  | "dead";

export type LeadChannel = "email" | "x_dm";

/** A lead as scraped, before enrichment. Not yet in the database. */
export interface RawLead {
  source: LeadSource;
  sourceUrl: string;
  name: string | null;
  company: string | null;
  companyDomain: string | null;
  xHandle: string | null;
  rawText: string;
  /** 0-100 heuristic ICP-fit score, computed by scoreLead() before insert. */
  score?: number;
}

/** A lead as stored in Supabase. Mirrors the `leads` table — see supabase/schema.sql. */
export interface Lead {
  id: string;
  source: LeadSource;
  sourceUrl: string;
  name: string | null;
  company: string | null;
  companyDomain: string | null;
  email: string | null;
  emailVerified: boolean;
  xHandle: string | null;
  rawText: string;
  score: number;
  status: LeadStatus;
  channel: LeadChannel | null;
  createdAt: string;
  lastContactedAt: string | null;
}

export interface EnrichmentResult {
  email: string | null;
  verified: boolean;
  provider: "prospeo" | "hunter" | "snov" | null;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}
