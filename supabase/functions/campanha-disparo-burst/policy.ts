export const MAX_CONTROLLED_CONTACTS = 500;

export type OneShotState = {
  status: string;
  run_at: string;
};

export function isAuthorized(
  authorization: string,
  serviceRole: string,
  schedulerHeader: string,
  schedulerKey: string,
): boolean {
  return authorization === `Bearer ${serviceRole}` ||
    (schedulerKey.length > 0 && schedulerHeader === schedulerKey);
}

export function canClaimOneShot(run: OneShotState, now: Date): boolean {
  return run.status === "scheduled" && new Date(run.run_at).getTime() <= now.getTime();
}

export function effectiveTarget(
  requested: number,
  alreadySent: number,
  dailyLimit: number,
): number {
  const boundedRequest = Math.min(Math.max(Math.trunc(requested), 0), MAX_CONTROLLED_CONTACTS);
  const remainingDaily = Math.max(Math.trunc(dailyLimit) - Math.trunc(alreadySent), 0);
  return Math.min(boundedRequest, remainingDaily);
}
