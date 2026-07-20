import { Browser, BrowserContext, chromium } from "playwright";
import { env } from "../config/env";
import { SendResult } from "../types";

/**
 * Sends X DMs through your own logged-in session, the same way a human
 * using x.com would. Selectors use data-testid hooks that have been
 * consistent in X's web app for a while, but — same caveat as
 * scrapers/xSearch.ts — X's markup does change, so treat a sudden run of
 * "compose button not found" errors as a signal to re-check these before
 * assuming something else is wrong.
 *
 * This class holds one browser session open across a whole send batch
 * (see workers/sendXDmWorker.ts) instead of relaunching per message —
 * both faster and less conspicuous than a fresh browser per DM.
 */
export class XDmClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async open(): Promise<void> {
    if (!env.X_AUTH_TOKEN || !env.X_CT0) {
      throw new Error("X_AUTH_TOKEN and X_CT0 are not set — X sending is disabled.");
    }
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    await this.context.addCookies([
      { name: "auth_token", value: env.X_AUTH_TOKEN, domain: ".x.com", path: "/" },
      { name: "ct0", value: env.X_CT0, domain: ".x.com", path: "/" },
    ]);
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.context = null;
  }

  async send(handle: string, message: string): Promise<SendResult> {
    if (!this.context) {
      return { ok: false, error: "XDmClient.open() was not called before send()" };
    }

    const page = await this.context.newPage();
    try {
      await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded" });

      const messageButton = page.getByTestId("sendDMFromProfile");
      const isVisible = await messageButton.isVisible().catch(() => false);
      if (!isVisible) {
        return { ok: false, error: `No message button found for @${handle} — DMs may be closed or account suspended` };
      }
      await messageButton.click();

      const textbox = page.getByTestId("dmComposerTextInput");
      await textbox.waitFor({ state: "visible", timeout: 10_000 });
      await textbox.click();
      await textbox.fill(message);

      const sendButton = page.getByTestId("dmComposerSendButton");
      await sendButton.click();

      // Give the app a moment to either confirm the send or surface an error toast.
      await page.waitForTimeout(2000);
      const errorToast = await page.getByTestId("toast").isVisible().catch(() => false);
      if (errorToast) {
        return { ok: false, error: "X returned an error toast after send — likely rate limited or blocked" };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await page.close();
    }
  }
}
