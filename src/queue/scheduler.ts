import { enrichQueue, repliesQueue, scrapeQueue, sendEmailQueue, sendXDmQueue } from "./queues";
import { env } from "../config/env";

// Enrich/send run a little after scrape/enrich respectively so each stage
// has leads to work with by the time it runs. Adjust freely — these are
// just sane defaults for a once-a-day cadence.
const SCHEDULE = {
  scrape: env.SCRAPE_CRON, // default 08:00
  enrich: "15 8 * * *", // 08:15
  sendEmail: "30 8 * * *", // 08:30
  sendXDm: "0 9 * * *", // 09:00 — spaced from email so both aren't hitting external services at once
  replies: "*/30 * * * *", // every 30 minutes
} as const;

/**
 * Registers all repeatable jobs. Safe to call on every process start —
 * BullMQ upserts a repeatable job by its (name, pattern, jobId) combination
 * rather than creating a duplicate each time, as long as the jobId here
 * stays stable across restarts.
 */
export async function registerSchedules(): Promise<void> {
  await scrapeQueue.add("scrape", {}, { repeat: { pattern: SCHEDULE.scrape }, jobId: "scheduled-scrape" });
  await enrichQueue.add("enrich", {}, { repeat: { pattern: SCHEDULE.enrich }, jobId: "scheduled-enrich" });
  await sendEmailQueue.add("send-email", {}, { repeat: { pattern: SCHEDULE.sendEmail }, jobId: "scheduled-send-email" });
  await sendXDmQueue.add("send-x-dm", {}, { repeat: { pattern: SCHEDULE.sendXDm }, jobId: "scheduled-send-x-dm" });
  await repliesQueue.add("replies", {}, { repeat: { pattern: SCHEDULE.replies }, jobId: "scheduled-replies" });
}
