import { getSupabase } from "../db/supabaseClient";
import { LeadStatus } from "../types";

const STATUSES: LeadStatus[] = [
  "new",
  "enriched",
  "enrichment_failed",
  "queued",
  "sent",
  "replied",
  "opted_out",
  "dead",
];

async function main(): Promise<void> {
  const supabase = getSupabase();
  const counts: Record<string, number> = {};

  for (const status of STATUSES) {
    const { count, error } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", status);
    if (error) throw new Error(`Status count failed for ${status}: ${error.message}`);
    counts[status] = count ?? 0;
  }

  const { count: emailSentCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("status", "sent");

  const { count: xSentCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("channel", "x_dm")
    .eq("status", "sent");

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  // eslint-disable-next-line no-console
  console.log("\nLead Hunter — funnel status\n" + "=".repeat(32));
  for (const status of STATUSES) {
    // eslint-disable-next-line no-console
    console.log(`  ${status.padEnd(20)} ${counts[status]}`);
  }
  // eslint-disable-next-line no-console
  console.log("=".repeat(32));
  // eslint-disable-next-line no-console
  console.log(`  ${"total".padEnd(20)} ${total}`);
  // eslint-disable-next-line no-console
  console.log(`\n  sent via email: ${emailSentCount ?? 0}   sent via x_dm: ${xSentCount ?? 0}\n`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Status check failed:", err);
  process.exit(1);
});
