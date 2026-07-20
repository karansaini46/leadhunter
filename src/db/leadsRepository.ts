import { getSupabase } from "./supabaseClient";
import { EnrichmentResult, Lead, LeadChannel, LeadStatus, RawLead } from "../types";

/** Raw shape of a `leads` row as Postgres returns it (snake_case). */
interface LeadRow {
  id: string;
  source: Lead["source"];
  source_url: string;
  name: string | null;
  company: string | null;
  company_domain: string | null;
  email: string | null;
  email_verified: boolean;
  x_handle: string | null;
  raw_text: string;
  score: number;
  status: LeadStatus;
  channel: LeadChannel | null;
  created_at: string;
  last_contacted_at: string | null;
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    source: row.source,
    sourceUrl: row.source_url,
    name: row.name,
    company: row.company,
    companyDomain: row.company_domain,
    email: row.email,
    emailVerified: row.email_verified,
    xHandle: row.x_handle,
    rawText: row.raw_text,
    score: row.score,
    status: row.status,
    channel: row.channel,
    createdAt: row.created_at,
    lastContactedAt: row.last_contacted_at,
  };
}

/**
 * Inserts newly-scraped leads, skipping any whose source_url we've already
 * seen. Returns how many were actually new. Safe to call repeatedly with
 * overlapping scrape results — that's the expected usage pattern.
 */
export async function insertRawLeads(leads: RawLead[]): Promise<number> {
  if (leads.length === 0) return 0;

  const rows = leads.map((lead) => ({
    source: lead.source,
    source_url: lead.sourceUrl,
    name: lead.name,
    company: lead.company,
    company_domain: lead.companyDomain,
    x_handle: lead.xHandle,
    raw_text: lead.rawText,
    score: lead.score ?? 0,
  }));

  const { data, error } = await getSupabase()
    .from("leads")
    .upsert(rows, { onConflict: "source_url", ignoreDuplicates: true })
    .select("id");

  if (error) throw new Error(`insertRawLeads failed: ${error.message}`);
  return data?.length ?? 0;
}

export async function getLeadsByStatus(status: LeadStatus, limit = 50): Promise<Lead[]> {
  const { data, error } = await getSupabase()
    .from("leads")
    .select("*")
    .eq("status", status)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getLeadsByStatus failed: ${error.message}`);
  return (data as LeadRow[]).map(toLead);
}

/**
 * Leads that are enriched and have the contact info a given channel needs,
 * and haven't been queued/sent yet.
 */
export async function getLeadsReadyForChannel(channel: LeadChannel, limit = 50): Promise<Lead[]> {
  const contactColumn = channel === "email" ? "email" : "x_handle";
  const { data, error } = await getSupabase()
    .from("leads")
    .select("*")
    .eq("status", "enriched")
    .not(contactColumn, "is", null)
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getLeadsReadyForChannel failed: ${error.message}`);
  return (data as LeadRow[]).map(toLead);
}

export async function markEnrichmentResult(id: string, result: EnrichmentResult): Promise<void> {
  const patch = result.email
    ? { email: result.email, email_verified: result.verified, status: "enriched" as const }
    : { status: "enrichment_failed" as const };

  const { error } = await getSupabase().from("leads").update(patch).eq("id", id);
  if (error) throw new Error(`markEnrichmentResult failed: ${error.message}`);
}

export async function markStatus(id: string, status: LeadStatus, channel?: LeadChannel): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (channel) patch.channel = channel;
  if (status === "sent") patch.last_contacted_at = new Date().toISOString();

  const { error } = await getSupabase().from("leads").update(patch).eq("id", id);
  if (error) throw new Error(`markStatus failed: ${error.message}`);
}

/**
 * Called by the reply poller. Matches on email address and flips the lead to
 * 'replied', which excludes it from all future send queues. Returns true if
 * a lead was matched and updated.
 */
export async function markRepliedByEmail(email: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("leads")
    .update({ status: "replied" })
    .eq("email", email.toLowerCase())
    .in("status", ["queued", "sent", "enriched"])
    .select("id");

  if (error) throw new Error(`markRepliedByEmail failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function markOptedOutByEmail(email: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("leads")
    .update({ status: "opted_out" })
    .eq("email", email.toLowerCase())
    .select("id");

  if (error) throw new Error(`markOptedOutByEmail failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
