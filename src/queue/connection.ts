import IORedis from "ioredis";
import { env } from "../config/env";

let connection: IORedis | null = null;

/**
 * BullMQ requires maxRetriesPerRequest: null on worker connections so they
 * keep retrying through Redis blips instead of dying mid-job. BullMQ's own
 * docs recommend a separate, tighter-retry connection for producers behind
 * a live HTTP request — but this project has no such request path (jobs
 * are only ever added by the cron scheduler or the CLI), so one shared
 * connection is simpler and there's no user-facing request left waiting on
 * a slow retry.
 */
export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}
