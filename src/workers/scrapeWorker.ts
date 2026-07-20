import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queue/connection";
import { QUEUE_NAMES } from "../queue/queues";
import { fetchYcHiringLeads } from "../scrapers/yc";
import { DEFAULT_X_QUERIES, searchXForLeads } from "../scrapers/xSearch";
import { dedupeLeads } from "../dedupe/dedupeKey";
import { insertRawLeads } from "../db/leadsRepository";
import { checkFeatureAvailability } from "../config/env";
import { RawLead } from "../types";

async function runScrape(): Promise<{ found: number; inserted: number }> {
  const features = checkFeatureAvailability();
  const results: RawLead[] = [];

  const yc = await fetchYcHiringLeads({ minScore: 40 });
  results.push(...yc);

  if (features.xScraping) {
    const x = await searchXForLeads(DEFAULT_X_QUERIES, { minScore: 40 });
    results.push(...x);
  } else {
    // eslint-disable-next-line no-console
    console.log("Skipping X sourcing — X_AUTH_TOKEN/X_CT0 not set.");
  }

  const deduped = dedupeLeads(results);
  const inserted = await insertRawLeads(deduped);

  return { found: deduped.length, inserted };
}

export function startScrapeWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.scrape,
    async (_job: Job) => {
      const result = await runScrape();
      // eslint-disable-next-line no-console
      console.log(`Scrape complete: ${result.found} candidate leads, ${result.inserted} newly inserted.`);
      return result;
    },
    { connection: getRedisConnection() }
  );
}
