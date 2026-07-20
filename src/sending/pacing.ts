export interface PacingConfig {
  dailyLimit: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
}

/**
 * Returns a randomized delay in milliseconds between minDelaySeconds and
 * maxDelaySeconds. Identical, evenly-spaced delays are themselves a
 * detectable automation signal — jitter matters as much as the average.
 */
export function nextDelayMs(config: PacingConfig, rand: () => number = Math.random): number {
  if (config.minDelaySeconds > config.maxDelaySeconds) {
    throw new Error("minDelaySeconds cannot exceed maxDelaySeconds");
  }
  const spreadSeconds = config.maxDelaySeconds - config.minDelaySeconds;
  const delaySeconds = config.minDelaySeconds + rand() * spreadSeconds;
  return Math.round(delaySeconds * 1000);
}

/** Whether another send is allowed today given how many have already gone out. */
export function isUnderDailyLimit(sentToday: number, config: PacingConfig): boolean {
  return sentToday < config.dailyLimit;
}

/**
 * Picks one of several template variants for a given index so the same
 * wording isn't sent to every recipient in a row — identical repeated text
 * is one of the more common automation tells.
 */
export function pickVariant<T>(variants: T[], index: number): T {
  if (variants.length === 0) throw new Error("pickVariant requires at least one variant");
  return variants[index % variants.length];
}
