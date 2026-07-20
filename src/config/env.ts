import "dotenv/config";
import { z } from "zod";

/**
 * Every var is optional at the schema level so the app can boot with a
 * partial setup (e.g. email only, no X yet). Each module checks its own
 * required keys at call time and throws a clear, specific error instead.
 * See printConfigSummary() below for what that looks like at startup.
 */
const schema = z.object({
  // Core infra — needed for anything to run at all
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Email sending (Amazon SES)
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SES_FROM_EMAIL: z.string().email().optional(),
  SES_FROM_NAME: z.string().default("Karan"),
  REPLY_TO_EMAIL: z.string().email().optional(),
  COMPANY_PHYSICAL_ADDRESS: z.string().optional(),

  // Email finding waterfall — each is independently optional
  PROSPEO_API_KEY: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),
  SNOV_CLIENT_ID: z.string().optional(),
  SNOV_CLIENT_SECRET: z.string().optional(),

  // Reply polling (IMAP — works with a Gmail App Password, no OAuth needed)
  REPLY_IMAP_HOST: z.string().optional(),
  REPLY_IMAP_PORT: z.coerce.number().default(993),
  REPLY_IMAP_USER: z.string().optional(),
  REPLY_IMAP_PASSWORD: z.string().optional(),

  // X/Twitter — cookie auth from a logged-in browser session, not the paid API
  X_AUTH_TOKEN: z.string().optional(),
  X_CT0: z.string().optional(),
  X_ACCOUNT_LABEL: z.string().default("secondary-account"),
  X_DM_DAILY_LIMIT: z.coerce.number().default(20),
  X_DM_MIN_DELAY_SECONDS: z.coerce.number().default(200),
  X_DM_MAX_DELAY_SECONDS: z.coerce.number().default(420),

  // Safety guardrails
  CIRCUIT_BREAKER_NEGATIVE_RATE_THRESHOLD: z.coerce.number().default(0.15),
  CIRCUIT_BREAKER_MIN_SAMPLE: z.coerce.number().default(5),

  // Scheduling
  SCRAPE_CRON: z.string().default("0 8 * * *"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the required values.`
    );
  }
  return parsed.data;
}

export const env = loadEnv();

export interface FeatureAvailability {
  email: boolean;
  xScraping: boolean;
  xSending: boolean;
  prospeo: boolean;
  hunter: boolean;
  snov: boolean;
  replyPolling: boolean;
}

export function checkFeatureAvailability(e: Env = env): FeatureAvailability {
  return {
    email: Boolean(e.AWS_ACCESS_KEY_ID && e.AWS_SECRET_ACCESS_KEY && e.SES_FROM_EMAIL),
    xScraping: Boolean(e.X_AUTH_TOKEN && e.X_CT0),
    xSending: Boolean(e.X_AUTH_TOKEN && e.X_CT0),
    prospeo: Boolean(e.PROSPEO_API_KEY),
    hunter: Boolean(e.HUNTER_API_KEY),
    snov: Boolean(e.SNOV_CLIENT_ID && e.SNOV_CLIENT_SECRET),
    replyPolling: Boolean(e.REPLY_IMAP_HOST && e.REPLY_IMAP_USER && e.REPLY_IMAP_PASSWORD),
  };
}

/** Prints a one-screen summary of what's configured and what's disabled. Call this once at startup. */
export function printConfigSummary(e: Env = env): void {
  const f = checkFeatureAvailability(e);
  const line = (label: string, on: boolean) => `  [${on ? "on " : "off"}] ${label}`;
  // eslint-disable-next-line no-console
  console.log(
    [
      "Lead Hunter — feature availability:",
      line("Email sending (SES)", f.email),
      line("X sourcing/scraping", f.xScraping),
      line("X DM sending", f.xSending),
      line("Prospeo enrichment", f.prospeo),
      line("Hunter enrichment", f.hunter),
      line("Snov enrichment", f.snov),
      line("Reply polling (IMAP)", f.replyPolling),
      !f.prospeo && !f.hunter && !f.snov
        ? "  WARNING: no enrichment provider configured — leads will have no verified emails."
        : null,
    ]
      .filter(Boolean)
      .join("\n")
  );
}
