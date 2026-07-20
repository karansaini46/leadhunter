import { chromium, Page } from "playwright";
import { RawLead } from "../types";
import { scoreLead } from "../scoring/scoreLead";
import { env } from "../config/env";

/**
 * Scrapes X/Twitter search results using your own logged-in session
 * (auth_token + ct0 cookies from a browser you're signed into) instead of
 * the official API, which starts at $200/mo. This reads the same public
 * search UI a human would see — it does not use any private/internal
 * endpoint.
 *
 * Selectors use X's `data-testid` attributes, which are the most stable
 * hooks available (React testids survive most visual redesigns) but X does
 * change its markup periodically. If a search starts returning zero
 * results consistently, check these selectors first before assuming your
 * cookies expired.
 *
 * This is a ToS gray area (see README) — kept deliberately read-only and
 * low-volume. Sending (xDmSender.ts) is where the real account risk is.
 */

interface ScrapedTweet {
  handle: string;
  displayName: string;
  text: string;
  permalink: string;
}

async function extractTweetsFromPage(page: Page): Promise<ScrapedTweet[]> {
  return page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    const results: { handle: string; displayName: string; text: string; permalink: string }[] = [];

    for (const article of articles) {
      const userNameBlock = article.querySelector('[data-testid="User-Name"]');
      const textBlock = article.querySelector('[data-testid="tweetText"]');
      const permalinkEl = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;

      if (!userNameBlock || !textBlock || !permalinkEl) continue;

      // The handle is the second line in User-Name, formatted like "@handle"
      const handleMatch = userNameBlock.textContent?.match(/@(\w+)/);
      if (!handleMatch) continue;

      results.push({
        handle: handleMatch[1],
        displayName: userNameBlock.textContent?.split("@")[0]?.trim() ?? "",
        text: textBlock.textContent ?? "",
        permalink: new URL(permalinkEl.getAttribute("href") ?? "", "https://x.com").toString(),
      });
    }

    return results;
  });
}

export interface SearchXOptions {
  /** How many times to scroll for more results. Each scroll ~= 5-15 more tweets. */
  scrollPasses?: number;
  minScore?: number;
}

export async function searchXForLeads(queries: string[], options: SearchXOptions = {}): Promise<RawLead[]> {
  if (!env.X_AUTH_TOKEN || !env.X_CT0) {
    throw new Error(
      "X_AUTH_TOKEN and X_CT0 are not set — X sourcing is disabled. See README for how to get these from your browser's cookies."
    );
  }
  const { scrollPasses = 4, minScore = 0 } = options;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  await context.addCookies([
    { name: "auth_token", value: env.X_AUTH_TOKEN, domain: ".x.com", path: "/" },
    { name: "ct0", value: env.X_CT0, domain: ".x.com", path: "/" },
  ]);

  const allTweets = new Map<string, ScrapedTweet>(); // keyed by permalink, dedupes across queries

  try {
    const page = await context.newPage();

    for (const query of queries) {
      const url = `https://x.com/search?q=${encodeURIComponent(query)}&f=live`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500); // let the timeline hydrate

      for (let pass = 0; pass < scrollPasses; pass++) {
        const tweets = await extractTweetsFromPage(page);
        for (const tweet of tweets) allTweets.set(tweet.permalink, tweet);

        await page.mouse.wheel(0, 2500);
        await page.waitForTimeout(1500 + Math.random() * 1000); // human-ish pacing, not a fixed interval
      }
    }
  } finally {
    await browser.close();
  }

  return Array.from(allTweets.values())
    .map((tweet): RawLead => {
      const rawText = tweet.text;
      return {
        source: "x_search",
        sourceUrl: tweet.permalink,
        name: tweet.displayName || null,
        company: null,
        companyDomain: null,
        xHandle: tweet.handle,
        rawText,
        score: scoreLead(rawText),
      };
    })
    .filter((lead) => (lead.score ?? 0) >= minScore);
}

/** Default search queries targeting founders who need dev work built, not in-house hires. */
export const DEFAULT_X_QUERIES = [
  '"looking for a developer" -hiring -job',
  '"need help building" MVP',
  '"technical co-founder" -hiring',
  '"no cto" startup',
];
