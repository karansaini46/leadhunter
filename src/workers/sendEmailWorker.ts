import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queue/connection";
import { QUEUE_NAMES } from "../queue/queues";
import { getLeadsReadyForChannel, markStatus } from "../db/leadsRepository";
import { recordSendEvent } from "../db/sendEventsRepository";
import { sendColdEmail } from "../sending/sesSender";
import { EMAIL_VARIANT_COUNT } from "../sending/emailTemplates";
import { pickVariant } from "../sending/pacing";

const BATCH_SIZE = 30;
const MIN_DELAY_MS = 5_000;
const MAX_DELAY_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runEmailSend(): Promise<{ attempted: number; sent: number }> {
  const leads = await getLeadsReadyForChannel("email", BATCH_SIZE);
  let sent = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (!lead.email) continue;

    const variantIndex = pickVariant(
      Array.from({ length: EMAIL_VARIANT_COUNT }, (_, idx) => idx),
      i
    );
    const result = await sendColdEmail({
      toEmail: lead.email,
      variantIndex,
      context: { name: lead.name, company: lead.company },
    });

    await recordSendEvent("email", result.ok ? "sent" : "failed", lead.id, result.error);
    await markStatus(lead.id, result.ok ? "sent" : "enrichment_failed", "email");
    if (result.ok) sent += 1;

    if (i < leads.length - 1) {
      await sleep(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
    }
  }

  return { attempted: leads.length, sent };
}

export function startSendEmailWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.sendEmail,
    async (_job: Job) => {
      const result = await runEmailSend();
      // eslint-disable-next-line no-console
      console.log(`Email send complete: ${result.sent}/${result.attempted} sent.`);
      return result;
    },
    { connection: getRedisConnection() }
  );
}
