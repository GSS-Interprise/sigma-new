/**
 * Cadence defaults and response classification for WhatsApp official senders.
 * Provider Retry-After is always authoritative; these defaults only coordinate
 * otherwise-independent Sigma workers sharing the same sender.
 */
export const DEFAULT_OFFICIAL_INTERVAL_MS = {
  min: 120_000,
  max: 180_000,
} as const;

// Observations showed the provider begins throttling well below the advertised
// account-level daily ceiling. A shared gap prevents parallel campaigns from
// turning that ceiling into a burst against the same phone number.
export const DEFAULT_OFFICIAL_MIN_GAP_MS = 3_500;
export const DEFAULT_PROVIDER_RETRY_MS = 60_000;

type CampaignCadence = {
  delay_between_batches_min?: unknown;
  delay_between_batches_max?: unknown;
};

export function resolveOfficialIntervalMs(campaign: CampaignCadence) {
  const configuredMin = Number(campaign.delay_between_batches_min) * 1000;
  const configuredMax = Number(campaign.delay_between_batches_max) * 1000;
  const min = Number.isFinite(configuredMin) && configuredMin > 0
    ? Math.max(120_000, Math.min(configuredMin, 15 * 60_000))
    : DEFAULT_OFFICIAL_INTERVAL_MS.min;
  const maxCandidate = Number.isFinite(configuredMax) && configuredMax > 0
    ? configuredMax
    : DEFAULT_OFFICIAL_INTERVAL_MS.max;
  const max = Math.max(min + 30_000, Math.min(maxCandidate, 20 * 60_000));
  return { min, max };
}

export function classifyOfficialThrottle(
  status: number,
  payload: Record<string, unknown> | null | undefined,
) {
  const error = String(payload?.error || "");
  const retryAfterMs = Number(payload?.retry_after_ms);
  if (error === "official_sender_rate_limited") {
    return {
      deferred: true as const,
      retryAfterMs: Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : DEFAULT_OFFICIAL_MIN_GAP_MS,
      reason: "sender_cooldown" as const,
    };
  }
  if (status === 429 || error === "chakra_rate_limited") {
    return {
      deferred: true as const,
      retryAfterMs: Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : DEFAULT_PROVIDER_RETRY_MS,
      reason: "provider_rate_limit" as const,
    };
  }
  return null;
}
