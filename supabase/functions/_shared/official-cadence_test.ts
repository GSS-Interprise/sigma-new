import {
  DEFAULT_OFFICIAL_MIN_GAP_MS,
  classifyOfficialThrottle,
  canRetrySenderCooldownWithinRun,
  resolveOfficialIntervalMs,
} from "./official-cadence.ts";
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("official cadence defaults to a faster but gradual 2–3 minute window", () => {
  assertEquals(resolveOfficialIntervalMs({}), { min: 120_000, max: 180_000 });
});

Deno.test("official cadence honors configured range but never permits a burst under two minutes", () => {
  assertEquals(resolveOfficialIntervalMs({
    delay_between_batches_min: 60,
    delay_between_batches_max: 90,
  }), { min: 120_000, max: 150_000 });
  assertEquals(resolveOfficialIntervalMs({
    delay_between_batches_min: 180,
    delay_between_batches_max: 240,
  }), { min: 180_000, max: 240_000 });
});

Deno.test("official cadence repairs inverted and out-of-range configuration", () => {
  assertEquals(resolveOfficialIntervalMs({
    delay_between_batches_min: 1_500,
    delay_between_batches_max: 1,
  }), { min: 900_000, max: 930_000 });
});

Deno.test("global gap is deliberately conservative and below the observed provider burst", () => {
  assertEquals(DEFAULT_OFFICIAL_MIN_GAP_MS, 3_500);
});

Deno.test("429 and internal sender contention defer without classifying a recipient failure", () => {
  assertEquals(classifyOfficialThrottle(429, { error: "chakra_rate_limited", retry_after_ms: 27_160 }), {
    deferred: true,
    retryAfterMs: 27_160,
    reason: "provider_rate_limit",
  });
  assertEquals(classifyOfficialThrottle(429, { error: "official_sender_rate_limited", retry_after_ms: 4_500 }), {
    deferred: true,
    retryAfterMs: 4_500,
    reason: "sender_cooldown",
  });
  assertEquals(classifyOfficialThrottle(400, { error: "invalid_recipient" }), null);
});

Deno.test("local sender cooldown retries only when there is room for the wait and next request", () => {
  assertEquals(canRetrySenderCooldownWithinRun(3_500, 25_000, 20_000), true);
  assertEquals(canRetrySenderCooldownWithinRun(3_500, 23_499, 20_000), false);
  assertEquals(canRetrySenderCooldownWithinRun(30_000, 25_000, 20_000), false);
  assertEquals(canRetrySenderCooldownWithinRun(-1, 25_000, 20_000), false);
});
