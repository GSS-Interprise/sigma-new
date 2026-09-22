import {
  canRunRecurringCampaign,
  oneShotCampaignIds,
} from "./policy.ts";

Deno.test("deduplicates due one-shot campaign ids and ignores empty ids", () => {
  const ids = oneShotCampaignIds([
    { campanha_id: "campaign-a" },
    { campanha_id: "campaign-a" },
    { campanha_id: null },
    { campanha_id: "" },
    { campanha_id: "campaign-b" },
  ]);

  if (JSON.stringify(ids) !== JSON.stringify(["campaign-a", "campaign-b"])) {
    throw new Error(`unexpected ids: ${JSON.stringify(ids)}`);
  }
});

Deno.test("recurring branch excludes a campaign with a due one-shot", () => {
  const excluded = oneShotCampaignIds([{ campanha_id: "campaign-a" }]);

  if (canRunRecurringCampaign("campaign-a", excluded)) {
    throw new Error("one-shot campaign was not excluded from recurring dispatch");
  }
  if (!canRunRecurringCampaign("campaign-b", excluded)) {
    throw new Error("unrelated campaign was incorrectly excluded");
  }
});
