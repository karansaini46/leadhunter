import { getSupabase } from "./supabaseClient";
import { LeadChannel } from "../types";

export type SendOutcome = "sent" | "failed" | "negative_reply";

export interface SendEvent {
  outcome: SendOutcome;
  createdAt: string;
}

export async function recordSendEvent(
  channel: LeadChannel,
  outcome: SendOutcome,
  leadId?: string,
  detail?: string
): Promise<void> {
  const { error } = await getSupabase()
    .from("send_events")
    .insert({ channel, outcome, lead_id: leadId ?? null, detail: detail ?? null });

  if (error) throw new Error(`recordSendEvent failed: ${error.message}`);
}

export async function getRecentSendEvents(channel: LeadChannel, windowHours: number): Promise<SendEvent[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await getSupabase()
    .from("send_events")
    .select("outcome, created_at")
    .eq("channel", channel)
    .gte("created_at", since);

  if (error) throw new Error(`getRecentSendEvents failed: ${error.message}`);
  return (data ?? []).map((row) => ({ outcome: row.outcome as SendOutcome, createdAt: row.created_at as string }));
}
