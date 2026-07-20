import { RawLead } from "../types";

/**
 * The database's unique index (see supabase/schema.sql) is the source of
 * truth for cross-run dedup, but collapsing duplicates before insert saves
 * a round trip and makes single-scrape-run counts meaningful. Two leads are
 * the same contact if they share an email or an X handle once normalized.
 */
export function contactKey(lead: Pick<RawLead, "xHandle"> & { email?: string | null }): string | null {
  if (lead.email) return `email:${lead.email.trim().toLowerCase()}`;
  if (lead.xHandle) return `x:${lead.xHandle.trim().toLowerCase().replace(/^@/, "")}`;
  return null;
}

/**
 * Removes leads with a duplicate contact key, keeping the first occurrence.
 * Leads with no resolvable key yet (e.g. a fresh YC lead pre-enrichment)
 * pass through unchanged — they're deduped later by source_url instead.
 */
export function dedupeLeads(leads: RawLead[]): RawLead[] {
  const seen = new Set<string>();
  const result: RawLead[] = [];

  for (const lead of leads) {
    const key = contactKey(lead);
    if (key === null) {
      result.push(lead);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(lead);
  }

  return result;
}
