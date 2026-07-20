import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queue/connection";
import { QUEUE_NAMES } from "../queue/queues";
import { getLeadsReadyForChannel, markStatus } from "../db/leadsRepository";
import { getRecentSendEvents, recordSendEvent } from "../db/sendEventsRepository";
import { evaluateCircuitBreaker } from "../sending/circuitBreaker";
import { XDmClient } from "../sending/xDmSender";
import { DM_VARIANT_COUNT, renderDm } from "../sending/xDmTemplates";
import { isUnderDailyLimit, nextDelayMs, pickVariant } from "../sending/pacing";
import { env } from "../config/env";

const CIRCUIT_BREAKER_WINDOW_HOURS = 24;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface XDmSendSummary {
  attempted: number;
  sent: number;
  circuitBreakerTripped: boolean;
  reason?: string;
}

async function runXDmSend(): Promise<XDmSendSummary> {
  const recentEvents = await getRecentSendEvents("x_dm", CIRCUIT_BREAKER_WINDOW_HOURS);
  const breaker = evaluateCircuitBreaker(recentEvents, {
    negativeRateThreshold: env.CIRCUIT_BREAKER_NEGATIVE_RATE_THRESHOLD,
    minSample: env.CIRCUIT_BREAKER_MIN_SAMPLE,
  });

  if (breaker.paused) {
    return { attempted: 0, sent: 0, circuitBreakerTripped: true, reason: breaker.reason };
  }

  const sentToday = recentEvents.filter((e) => e.outcome === "sent").length;
  const pacingConfig = {
    dailyLimit: env.X_DM_DAILY_LIMIT,
    minDelaySeconds: env.X_DM_MIN_DELAY_SECONDS,
    maxDelaySeconds: env.X_DM_MAX_DELAY_SECONDS,
  };

  if (!isUnderDailyLimit(sentToday, pacingConfig)) {
    return { attempted: 0, sent: 0, circuitBreakerTripped: false, reason: "Daily X DM limit already reached" };
  }

  const remainingBudget = pacingConfig.dailyLimit - sentToday;
  const leads = await getLeadsReadyForChannel("x_dm", remainingBudget);

  const client = new XDmClient();
  await client.open();

  let sent = 0;
  try {
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      if (!lead.xHandle) continue;

      const variantIndex = pickVariant(
        Array.from({ length: DM_VARIANT_COUNT }, (_, idx) => idx),
        i
      );
      const message = renderDm(variantIndex, { name: lead.name });
      const result = await client.send(lead.xHandle, message);

      await recordSendEvent("x_dm", result.ok ? "sent" : "failed", lead.id, result.error);
      await markStatus(lead.id, result.ok ? "sent" : "enrichment_failed", "x_dm");
      if (result.ok) sent += 1;

      if (i < leads.length - 1) {
        await sleep(nextDelayMs(pacingConfig));
      }
    }
  } finally {
    await client.close();
  }

  return { attempted: leads.length, sent, circuitBreakerTripped: false };
}

export function startSendXDmWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.sendXDm,
    async (_job: Job) => {
      const result = await runXDmSend();
      if (result.circuitBreakerTripped) {
        // eslint-disable-next-line no-console
        console.warn(`X DM sending paused by circuit breaker: ${result.reason}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`X DM send complete: ${result.sent}/${result.attempted} sent.`);
      }
      return result;
    },
    { connection: getRedisConnection() }
  );
}
