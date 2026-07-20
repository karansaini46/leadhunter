# Lead Hunter

Multi-channel lead generation for a dev agency — sources leads from Y
Combinator's company directory and X/Twitter search, finds verified emails,
and sends paced, compliance-aware cold outreach by email and X DM. Built to
run on well under $10/month.

**Read this whole file before turning on sending.** The email and X pieces
have real-world consequences (spam complaints, account suspension) that are
cheap to avoid and annoying to recover from.

## What's actually in this build

Built and tested in this repo: YC sourcing, X/Twitter search sourcing, a
3-provider email-finding waterfall, SES email sending, X DM sending, IMAP
reply polling, the job scheduler, and a CLI status command. All pure logic
(scoring, dedup, pacing, the circuit breaker, template rendering) has unit
tests — `npm test` to run them, 37 tests across 6 files.

**Not included**, scoped out to keep this build correct rather than broad —
noted here so you know what's a real gap vs. what to expect:

- **Wellfound / Product Hunt sourcing.** Unlike YC (see below), neither has
  a clean public API — it'd mean Playwright-scraping their pages, which is
  the most brittle part of any lead-gen stack and I didn't want to ship
  something I couldn't verify actually works. `src/scrapers/yc.ts` is the
  template to follow if you want to add one; budget time for selector
  maintenance.
- **A web dashboard.** `npm run status` gives you funnel counts from the
  terminal. A real dashboard is a natural v2, not a v1 necessity.
- **Live end-to-end testing of the paid integrations.** I can't test-send a
  real email or a real X DM without your credentials. Everything is built
  against each provider's actual current API (verified via their docs while
  building this — see "What was actually verified" below), and all the
  logic around those calls is unit tested, but the first real send is the
  first time the full path runs with real keys. Test with one lead before
  trusting it with a full batch.

## Architecture

```
[SOURCING] → [ENRICH + VERIFY] → [DEDUPE] → [QUEUE] → [SEND] → [TRACK REPLIES]
  yc.ts          waterfall.ts    (DB unique   BullMQ    SES /    imapPoller.ts
  xSearch.ts     (Prospeo →       index)               X DM
                  Hunter → Snov)
```

Everything runs as one Node process (`src/index.ts`) with BullMQ workers
listening on five queues, plus repeatable cron jobs that add a job to each
queue on a schedule (`src/queue/scheduler.ts`):

| Stage | File | Default schedule |
|---|---|---|
| Scrape | `workers/scrapeWorker.ts` | 08:00 daily |
| Enrich | `workers/enrichWorker.ts` | 08:15 daily |
| Send email | `workers/sendEmailWorker.ts` | 08:30 daily |
| Send X DM | `workers/sendXDmWorker.ts` | 09:00 daily |
| Poll replies | `workers/repliesWorker.ts` | every 30 min |

Data lives in two Supabase tables (`supabase/schema.sql`): `leads` (one row
per contact, with a `status` that moves `new → enriched → queued → sent →
replied/opted_out`) and `send_events` (one row per send attempt, which is
what the circuit breaker reads).

## Setup

### 1. Supabase

Create a project, then run `supabase/schema.sql` in the SQL editor. Copy
your project URL and **service_role** key (Settings → API) into `.env`.

### 2. Redis

Local dev: `docker run -p 6379:6379 redis`. Production: Render's managed
Redis add-on (you already have Render in your stack) — copy its connection
string into `REDIS_URL`.

### 3. Email — Amazon SES

1. In SES, verify a domain (not just a single address) — use a subdomain
   like `outreach.yourdomain.com` so a cold-email sender reputation problem
   never touches your main domain's deliverability.
2. Add the SPF, DKIM, and DMARC records SES gives you to your DNS. This is
   what actually determines inbox placement — do it before your first real
   send, not after.
3. Request production access (SES starts new accounts in a sandbox that can
   only send to verified addresses).
4. Create an IAM user with `ses:SendEmail` and `ses:SendRawEmail` permission,
   put its keys in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
5. Set `SES_FROM_EMAIL` to an address on your verified domain,
   `COMPANY_PHYSICAL_ADDRESS` and `REPLY_TO_EMAIL` — both required, see
   "Compliance" below.

At this project's volume (roughly 1,000 emails/month), SES costs about
$0.10/month after the 3,000/month free tier.

### 4. Email finding (enrichment)

Sign up for free tiers at [Prospeo](https://prospeo.io) (75/mo),
[Hunter.io](https://hunter.io) (50/mo), and/or [Snov.io](https://snov.io)
(50/mo). You don't need all three — the waterfall skips whichever keys are
blank — but more providers means fewer leads with no email found. All three
free tiers together comfortably cover this project's volume at $0.

### 5. Reply polling (IMAP)

Whatever inbox `REPLY_TO_EMAIL` points to, generate an **app password** for
it (Gmail: Google Account → Security → 2-Step Verification → App
Passwords) — this avoids setting up a full OAuth consent screen for a
solo project. Put the address in `REPLY_IMAP_USER` and the app password in
`REPLY_IMAP_PASSWORD`.

### 6. X / Twitter

There's no paid API involved — X's API starts at $200/month, which is
outside your budget, so this uses cookie auth from a real logged-in
session instead (the same thing your browser sends on every request).

1. **Use a secondary X account, not your main one.** If anything gets
   flagged, you lose that account's standing, not your primary presence.
2. Log into that account in a normal browser.
3. Open DevTools → Application (Chrome) or Storage (Firefox) → Cookies →
   `https://x.com`.
4. Copy the values of the `auth_token` and `ct0` cookies into
   `X_AUTH_TOKEN` and `X_CT0`.
5. These cookies expire/rotate periodically (faster if you log out
   anywhere) — if scraping or sending suddenly stops working, refresh them
   before assuming something else broke.

**Read "X/Twitter risk" below before setting `X_DM_DAILY_LIMIT` above the
default.**

### 7. Install and run

```bash
npm install
npx playwright install chromium   # one-time, downloads the browser binary
cp .env.example .env              # fill in the values above
npm run typecheck                 # should be clean
npm test                          # should be 37 passing
npm run build
npm start                         # or `npm run dev` for auto-reload
```

`npm run status` any time for a funnel snapshot (new / enriched / queued /
sent / replied / opted_out counts, plus sent-by-channel).

## Compliance

**Email (CAN-SPAM):** every email sent through `sesSender.ts` automatically
gets a footer with your `COMPANY_PHYSICAL_ADDRESS` and a working opt-out —
a `mailto:` reply link, which satisfies the law's opt-out requirement just
as well as a web unsubscribe page (and needs no server to host). The
`imapPoller.ts` reply watcher recognizes "unsubscribe" (and similar
phrases) in replies and marks that lead `opted_out`, permanently excluded
from future sends. If you're emailing people in the EU/UK, note that
GDPR's rules on unsolicited commercial email are stricter than CAN-SPAM —
this project doesn't try to adjudicate that for you.

**X/Twitter risk:** X's terms explicitly prohibit automated bulk/cold DMs,
and enforcement got noticeably more aggressive through 2026. This isn't a
legal risk to you, it's an *account* risk — the account gets suspended and
that channel is dead. That's why:

- `X_DM_DAILY_LIMIT` defaults to 20/day with 200-420 second randomized
  delays between sends, not a fixed interval.
- Message text rotates across variants (`xDmTemplates.ts`) rather than
  reusing one script.
- The **circuit breaker** (`sending/circuitBreaker.ts`) auto-pauses X DM
  sending if the failed+negative-reply rate over the trailing 24 hours
  exceeds 15% (once at least 5 sends have happened) — check
  `printConfigSummary()` output / logs for a pause notice before assuming
  the worker is just idle.
- A brand-new/cold account should start well under the 20/day default and
  ramp up over 2-3 weeks, not jump straight to the configured limit.

If you want zero X account risk, set `X_DM_DAILY_LIMIT=0` and just use the
email channel — everything else in the pipeline works the same either way.

## How the enrichment waterfall actually decides

`enrichment/waterfall.ts` splits on whether a lead has a scraped person's
name (X-search leads do; YC leads generally don't, since YC's directory is
company-level):

- **Has a name:** tries Prospeo → Hunter's name+domain finder → Snov's
  name+domain finder, in that order (Prospeo's claimed accuracy is highest,
  so it goes first), then falls through to the domain-only methods below if
  none resolve.
- **No name:** goes straight to Hunter's domain-search and Snov's
  domain-emails endpoints, which return whatever emails they have indexed
  for that domain without needing a person to search for.

## What was actually verified vs. what to sanity-check

Built while actively researching each integration rather than from memory,
which caught real issues before they shipped:

- **YC sourcing is genuinely verified, not just plausible.** It uses
  [`yc-oss/api`](https://github.com/yc-oss/api), a community-maintained
  mirror of YC's own company-directory data, refreshed daily, no key
  required. I fetched the real `hiring.json` endpoint while building this —
  confirmed 1,499 real companies with the exact schema
  `src/scrapers/yc.ts` expects.
- **Prospeo's endpoint was about to be wrong.** Their `/email-finder`
  endpoint was deprecated with a migration deadline that had already passed
  by the time this was built — `prospeoClient.ts` uses their current
  `/enrich-person` endpoint instead. Prospeo's exact response shape for
  that newer endpoint wasn't fully documented publicly at the time of
  writing, so the parsing code fails soft (returns "no email found" rather
  than throwing) on anything unexpected — if Prospeo results seem
  suspiciously empty, check a raw response against what
  `prospeoClient.ts` expects.
- **Snov's API is async**, not request-response — you start a search task
  and poll a result endpoint until it completes. `snovClient.ts` handles
  that polling; if Snov calls are timing out, `maxAttempts`/`delayMs` in
  that file are the knobs to adjust.
- **X selectors will drift eventually.** `xSearch.ts` and `xDmSender.ts`
  use X's `data-testid` attributes, the most stable hooks available, but
  X does change its markup. A sudden run of zero-results or "button not
  found" errors is the signal to go check these selectors before assuming
  your cookies expired.

## Extending this

- **New source:** follow `scrapers/yc.ts`'s shape — return `RawLead[]`,
  call `scoreLead()` on the text, feed it into `dedupeLeads()` before
  insert.
- **New enrichment provider:** add a client matching the
  `Promise<EnrichmentResult | null>` shape the others use, slot it into
  `waterfall.ts`.
- **Tune lead scoring:** `scoring/scoreLead.ts` is a plain keyword list —
  there's nothing clever to preserve, just edit `POSITIVE_SIGNALS` and
  `DISQUALIFYING_SIGNALS` as you learn what actually converts.
- **A dashboard:** `db/leadsRepository.ts` and `db/sendEventsRepository.ts`
  are the full data-access layer already — a small Vercel app reading from
  the same Supabase project is the natural next step, no changes needed
  here.
