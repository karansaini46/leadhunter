import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "../config/env";
import { markOptedOutByEmail, markRepliedByEmail } from "../db/leadsRepository";

export interface PollRepliesResult {
  checked: number;
  matchedReplies: number;
  matchedOptOuts: number;
}

const OPT_OUT_PATTERN = /\b(unsubscribe|remove me|stop emailing|opt out)\b/i;

/**
 * Polls the inbox for anything unseen and matches the sender's address
 * against our leads table. Anyone who replied gets excluded from all
 * future sends — continuing to message someone after they've replied
 * "not interested" is both bad practice and a fast way to accumulate spam
 * reports. Uses IMAP with an app password rather than full Gmail OAuth,
 * since that's a lot less setup for a solo project — see README.
 */
export async function pollReplies(): Promise<PollRepliesResult> {
  if (!env.REPLY_IMAP_HOST || !env.REPLY_IMAP_USER || !env.REPLY_IMAP_PASSWORD) {
    throw new Error("Reply polling is not configured — set REPLY_IMAP_HOST, REPLY_IMAP_USER, REPLY_IMAP_PASSWORD in .env");
  }

  const client = new ImapFlow({
    host: env.REPLY_IMAP_HOST,
    port: env.REPLY_IMAP_PORT,
    secure: true,
    auth: { user: env.REPLY_IMAP_USER, pass: env.REPLY_IMAP_PASSWORD },
    logger: false,
  });

  const result: PollRepliesResult = { checked: 0, matchedReplies: 0, matchedOptOuts: 0 };

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids) return result; // search() returns false if it couldn't run at all

      for (const uid of uids) {
        const message = await client.fetchOne(uid, { source: true, uid: true }, { uid: true });
        if (!message || !message.source) continue;

        result.checked += 1;
        const parsed = await simpleParser(message.source);
        const fromAddress = parsed.from?.value[0]?.address;
        if (!fromAddress) continue;

        const bodyText = `${parsed.subject ?? ""}\n${parsed.text ?? ""}`;
        if (OPT_OUT_PATTERN.test(bodyText)) {
          if (await markOptedOutByEmail(fromAddress)) result.matchedOptOuts += 1;
        } else {
          if (await markRepliedByEmail(fromAddress)) result.matchedReplies += 1;
        }

        await client.messageFlagsAdd({ uid: message.uid }, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return result;
}
