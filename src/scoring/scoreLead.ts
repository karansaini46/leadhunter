/**
 * Heuristic 0-100 fit score for "does this look like a company that would
 * hire a dev agency" based on the scraped bio/description/post text. This
 * is deliberately simple and meant to be tuned — adjust the keyword lists
 * as you see what actually converts.
 */

const POSITIVE_SIGNALS = [
  "mvp",
  "no engineer",
  "non-technical founder",
  "non technical founder",
  "looking for a developer",
  "need help building",
  "need a developer",
  "technical co-founder",
  "technical cofounder",
  "no cto",
  "outsource",
  "contractor",
  "freelance developer",
  "freelancer",
  "agency",
  "build our product",
  "build my product",
  "ship faster",
  "solo founder",
];

// Job posts that explicitly exclude agencies are a bad fit no matter how
// many positive keywords also match — this phrase should dominate the score.
const DISQUALIFYING_SIGNALS = ["no agencies", "no recruiters", "no contractors", "agencies please do not"];

const POINTS_PER_POSITIVE_SIGNAL = 10;
const MAX_POSITIVE_CONTRIBUTION = 50;
const BASE_SCORE = 30;
const DISQUALIFIER_PENALTY = 60;

export function scoreLead(rawText: string): number {
  const text = rawText.toLowerCase();

  const positiveHits = POSITIVE_SIGNALS.filter((signal) => text.includes(signal)).length;
  const positiveContribution = Math.min(positiveHits * POINTS_PER_POSITIVE_SIGNAL, MAX_POSITIVE_CONTRIBUTION);

  const isDisqualified = DISQUALIFYING_SIGNALS.some((signal) => text.includes(signal));
  const penalty = isDisqualified ? DISQUALIFIER_PENALTY : 0;

  const raw = BASE_SCORE + positiveContribution - penalty;
  return Math.max(0, Math.min(100, raw));
}
