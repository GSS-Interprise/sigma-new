export type OneShotCampaignRef = {
  campanha_id: string | null;
};

/**
 * Campaigns with a due one-shot must not enter the recurring branch in the
 * same scheduler tick. Keep this policy pure so the race guard is testable
 * without booting Deno.serve or connecting to Supabase.
 */
export function oneShotCampaignIds(oneShots: OneShotCampaignRef[]): string[] {
  return [...new Set(
    oneShots
      .map(({ campanha_id }) => campanha_id)
      .filter((id): id is string => Boolean(id)),
  )];
}

export function canRunRecurringCampaign(
  campanhaId: string,
  excludedCampaignIds: string[],
): boolean {
  return !excludedCampaignIds.includes(campanhaId);
}
