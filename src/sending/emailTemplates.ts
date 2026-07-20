import { env } from "../config/env";

export interface EmailContext {
  name: string | null;
  company: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
}

interface Variant {
  subject: string;
  body: (ctx: EmailContext) => string;
}

// Rotate across these so identical bulk text doesn't become a spam-filter
// or pattern-detection signal. Adjust freely — these are starting points,
// not a fixed script.
const VARIANTS: Variant[] = [
  {
    subject: "quick one about {company}",
    body: (ctx) =>
      `Hey ${ctx.name ?? "there"},\n\n` +
      `Came across ${ctx.company ?? "your team"} and it looks like you're moving fast on the product side. ` +
      `I run a small dev shop — we plug in and ship features/MVPs without the usual agency overhead or ramp-up time.\n\n` +
      `If there's anything on the roadmap you're blocked on shipping, happy to take a quick look and tell you honestly if we're a fit.\n\n` +
      `Worth a 10 minute call?`,
  },
  {
    subject: "helping teams like {company} ship faster",
    body: (ctx) =>
      `Hi ${ctx.name ?? "there"},\n\n` +
      `Noticed ${ctx.company ?? "your company"} is building fast right now. We help teams in that spot get features shipped ` +
      `without hiring a full-time engineer first — in, build, out.\n\n` +
      `No pitch deck, just: is there something specific you're trying to ship in the next few weeks?`,
  },
  {
    subject: "{company} — dev capacity",
    body: (ctx) =>
      `Hey ${ctx.name ?? "there"},\n\n` +
      `I help early-stage teams like ${ctx.company ?? "yours"} get extra dev capacity on demand — no long-term contract, ` +
      `just scoped work shipped fast.\n\n` +
      `If you're weighing whether to hire or outsource the next chunk of work, I'm happy to give you a straight read on which makes more sense for where you're at.`,
  },
];

function fillSubject(subject: string, ctx: EmailContext): string {
  return subject.replace("{company}", ctx.company ?? "your product");
}

function buildFooter(): string {
  const address = env.COMPANY_PHYSICAL_ADDRESS ?? "[Set COMPANY_PHYSICAL_ADDRESS in .env — required by CAN-SPAM]";
  const unsubscribeTarget = env.REPLY_TO_EMAIL ?? env.SES_FROM_EMAIL ?? "[Set REPLY_TO_EMAIL in .env]";
  return (
    `\n\n---\n` +
    `${address}\n` +
    `Don't want emails like this? Reply "unsubscribe" and you won't hear from me again: mailto:${unsubscribeTarget}?subject=unsubscribe`
  );
}

/**
 * Renders a variant by index (use pacing.pickVariant to rotate) with the
 * CAN-SPAM required footer appended. A working reply-based opt-out
 * mechanism plus your physical address is what the law requires here — it
 * doesn't have to be a web unsubscribe link.
 */
export function renderEmail(variantIndex: number, ctx: EmailContext): RenderedEmail {
  const variant = VARIANTS[variantIndex % VARIANTS.length];
  return {
    subject: fillSubject(variant.subject, ctx),
    text: variant.body(ctx) + buildFooter(),
  };
}

export const EMAIL_VARIANT_COUNT = VARIANTS.length;
