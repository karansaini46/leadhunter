import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queue/connection";
import { QUEUE_NAMES } from "../queue/queues";
import { pollReplies } from "../replies/imapPoller";

export function startRepliesWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.replies,
    async (_job: Job) => {
      const result = await pollReplies();
      // eslint-disable-next-line no-console
      console.log(
        `Reply poll complete: checked ${result.checked}, ${result.matchedReplies} replies, ${result.matchedOptOuts} opt-outs.`
      );
      return result;
    },
    { connection: getRedisConnection() }
  );
}
