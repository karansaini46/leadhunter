import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queue/connection";
import { QUEUE_NAMES } from "../queue/queues";
import { getLeadsByStatus, markEnrichmentResult } from "../db/leadsRepository";
import { enrichLead } from "../enrichment/waterfall";

const BATCH_SIZE = 50;

async function runEnrichment(): Promise<{ processed: number; resolved: number }> {
  const leads = await getLeadsByStatus("new", BATCH_SIZE);
  let resolved = 0;

  for (const lead of leads) {
    const result = await enrichLead({ name: lead.name, companyDomain: lead.companyDomain });
    await markEnrichmentResult(lead.id, result);
    if (result.email) resolved += 1;
  }

  return { processed: leads.length, resolved };
}

export function startEnrichWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.enrich,
    async (_job: Job) => {
      const result = await runEnrichment();
      // eslint-disable-next-line no-console
      console.log(`Enrichment complete: ${result.processed} processed, ${result.resolved} resolved to an email.`);
      return result;
    },
    { connection: getRedisConnection() }
  );
}
