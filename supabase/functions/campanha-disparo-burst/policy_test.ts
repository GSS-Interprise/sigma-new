import {
  canClaimOneShot,
  effectiveTarget,
  isAuthorized,
  MAX_CONTROLLED_CONTACTS,
} from "./policy.ts";

Deno.test("does not accept an unsigned service-role-shaped token", () => {
  if (isAuthorized("Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.", "real-secret", "", "scheduler-secret")) {
    throw new Error("forged service-role token was accepted");
  }
  if (!isAuthorized("Bearer real-secret", "real-secret", "", "scheduler-secret")) {
    throw new Error("exact service-role credential was rejected");
  }
});

Deno.test("does not claim a one-shot scheduled for the future", () => {
  const now = new Date("2026-09-22T12:00:00.000Z");
  const future = {
    status: "scheduled",
    run_at: "2026-09-22T12:01:00.000Z",
  };

  if (canClaimOneShot(future, now)) {
    throw new Error("future one-shot was considered due");
  }
});

Deno.test("claims only a scheduled one-shot that is due", () => {
  const now = new Date("2026-09-22T12:00:00.000Z");

  if (!canClaimOneShot({ status: "scheduled", run_at: "2026-09-22T12:00:00.000Z" }, now)) {
    throw new Error("due one-shot was not claimable");
  }
  if (canClaimOneShot({ status: "running", run_at: "2026-09-22T11:59:00.000Z" }, now)) {
    throw new Error("already claimed one-shot was claimable");
  }
});

Deno.test("caps the controlled run and respects the daily campaign remainder", () => {
  if (MAX_CONTROLLED_CONTACTS !== 500) {
    throw new Error(`unexpected cap: ${MAX_CONTROLLED_CONTACTS}`);
  }
  if (effectiveTarget(500, 10, 250) !== 240) {
    throw new Error("daily remainder was not enforced");
  }
  if (effectiveTarget(20, 90, 100) !== 10) {
    throw new Error("per-run target did not use the daily remainder correctly");
  }
  if (effectiveTarget(1000, 0, 1000) !== 500) {
    throw new Error("controlled run cap was not enforced");
  }
});
