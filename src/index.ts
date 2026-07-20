import { printConfigSummary } from "./config/env";
import { registerSchedules } from "./queue/scheduler";
import { startScrapeWorker } from "./workers/scrapeWorker";
import { startEnrichWorker } from "./workers/enrichWorker";
import { startSendEmailWorker } from "./workers/sendEmailWorker";
import { startSendXDmWorker } from "./workers/sendXDmWorker";
import { startRepliesWorker } from "./workers/repliesWorker";

async function main(): Promise<void> {
  printConfigSummary();

  const workers = [
    startScrapeWorker(),
    startEnrichWorker(),
    startSendEmailWorker(),
    startSendXDmWorker(),
    startRepliesWorker(),
  ];

  await registerSchedules();
  // eslint-disable-next-line no-console
  console.log("Lead Hunter running. Workers are listening on their queues; schedules are registered.");

  const shutdown = async () => {
    // eslint-disable-next-line no-console
    console.log("Shutting down...");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
