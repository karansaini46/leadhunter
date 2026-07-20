import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

export const QUEUE_NAMES = {
  scrape: "scrape:daily",
  enrich: "enrich:queue",
  sendEmail: "send:email",
  sendXDm: "send:x-dm",
  replies: "replies:poll",
} as const;

function makeQueue(name: string): Queue {
  return new Queue(name, { connection: getRedisConnection() });
}

export const scrapeQueue = makeQueue(QUEUE_NAMES.scrape);
export const enrichQueue = makeQueue(QUEUE_NAMES.enrich);
export const sendEmailQueue = makeQueue(QUEUE_NAMES.sendEmail);
export const sendXDmQueue = makeQueue(QUEUE_NAMES.sendXDm);
export const repliesQueue = makeQueue(QUEUE_NAMES.replies);

export const allQueues = [scrapeQueue, enrichQueue, sendEmailQueue, sendXDmQueue, repliesQueue];
