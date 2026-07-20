import { EnrichmentResult } from "../types";
import { env } from "../config/env";

const BASE_URL = "https://api.snov.io";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!env.SNOV_CLIENT_ID || !env.SNOV_CLIENT_SECRET) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const res = await fetch(`${BASE_URL}/v1/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.SNOV_CLIENT_ID,
      client_secret: env.SNOV_CLIENT_SECRET,
    }),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a little early to avoid racing expiry mid-batch.
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return cachedToken.value;
}

/**
 * Snov's search endpoints are async: you POST to /start to kick off a task
 * and get a task_hash back, then poll /result until status flips from
 * in_progress to completed. This polls with a short fixed backoff and gives
 * up after maxAttempts rather than hanging indefinitely.
 */
async function pollUntilComplete<T extends { status: string }>(
  fetchResult: () => Promise<T>,
  maxAttempts = 8,
  delayMs = 1500
): Promise<T | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fetchResult();
    if (result.status === "completed") return result;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

interface EmailsByNameResult {
  status: string;
  data: { people: string; result: { email: string; smtp_status: string }[] }[];
}

/** Name + domain lookup — use when the lead has an actual person's name. */
export async function findEmailWithSnov(fullName: string, companyDomain: string): Promise<EnrichmentResult | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(" ");
  if (!firstName || !lastName) return null;

  const startRes = await fetch(`${BASE_URL}/v2/emails-by-domain-by-name/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ rows: [{ first_name: firstName, last_name: lastName, domain: companyDomain }] }),
  });
  if (!startRes.ok) return null;
  const { data } = (await startRes.json()) as { data: { task_hash: string } };

  const result = await pollUntilComplete<EmailsByNameResult>(async () => {
    const r = await fetch(`${BASE_URL}/v2/emails-by-domain-by-name/result?task_hash=${data.task_hash}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await r.json()) as EmailsByNameResult;
  });

  const hit = result?.data?.[0]?.result?.[0];
  if (!hit) return null;

  return { email: hit.email, verified: hit.smtp_status === "valid", provider: "snov" };
}

interface DomainEmailsResult {
  status: string;
  data: { email: string }[];
}

/** Domain-only lookup — use for company-level leads with no known person (e.g. YC-sourced). */
export async function findGenericEmailWithSnov(companyDomain: string): Promise<EnrichmentResult | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const startRes = await fetch(`${BASE_URL}/v2/domain-search/domain-emails/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ domain: companyDomain }),
  });
  if (!startRes.ok) return null;
  const { meta } = (await startRes.json()) as { meta: { task_hash: string } };

  const result = await pollUntilComplete<DomainEmailsResult>(async () => {
    const r = await fetch(`${BASE_URL}/v2/domain-search/domain-emails/result/${meta.task_hash}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await r.json()) as DomainEmailsResult;
  });

  const email = result?.data?.[0]?.email;
  if (!email) return null;

  // Domain-emails results are unverified per Snov's own docs — a separate
  // verification call would cost an extra credit, so we surface these as
  // unverified and let sending decide whether that's good enough.
  return { email, verified: false, provider: "snov" };
}
