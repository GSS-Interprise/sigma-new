import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { oneShotCampaignIds } from "./policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Scheduler resiliente das campanhas de prospecção.
 *
 * O cron só acorda campanhas elegíveis; o processor continua sendo o dono
 * dos locks, da janela, dos limites e da seleção dos leads. Assim, executar
 * este endpoint duas vezes não cria disparo duplicado.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const schedulerKey = Deno.env.get("CAMPAIGN_SCHEDULER_KEY");
  if (!supabaseUrl || !serviceRole || !schedulerKey) {
    return json({ ok: false, error: "scheduler_not_configured" }, 500);
  }

  // Chamado exclusivamente pelo pg_cron. O token não fica no código: o cron
  // lê o segredo criptografado do Vault do Supabase.
  const receivedKey = req.headers.get("x-campaign-scheduler-key") || "";
  if (receivedKey !== schedulerKey) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole);
  const startedAt = new Date().toISOString();
  let runId: string | null = null;

  try {
    const { data: run, error: runError } = await admin
      .from("campanha_dispatch_scheduler_runs")
      .insert({ started_at: startedAt, status: "running" })
      .select("id")
      .single();
    if (runError) console.error(JSON.stringify({ event: "campaign_scheduler_run_log_error", error: runError.message }));
    runId = run?.id ?? null;

    const now = new Date().toISOString();

    // Claim the one-shot queue before selecting recurring campaigns. Without
    // this ordering, an active campaign could be selected by both branches in
    // the same scheduler tick: the recurring processor would send one lead
    // while the controlled burst was trying to pause the campaign.
    const { data: openOneShots, error: openOneShotError } = await admin
      .from("campanha_dispatch_one_shots")
      .select("campanha_id")
      .in("status", ["scheduled", "running"]);
    if (openOneShotError) throw openOneShotError;

    const { data: dueOneShots, error: dueOneShotError } = await admin
      .from("campanha_dispatch_one_shots")
      .select("id")
      .eq("status", "scheduled")
      .lte("run_at", now)
      .order("run_at", { ascending: true })
      .limit(10);
    if (dueOneShotError) throw dueOneShotError;

    const oneShotCampaignIdsInTick = oneShotCampaignIds(openOneShots || []);
    let campaignsQuery = admin
      .from("campanhas")
      .select("id")
      .eq("status", "ativa")
      .eq("tipo_campanha", "prospeccao")
      .neq("tipo_envio", "manual")
      .or(`next_batch_at.is.null,next_batch_at.lte.${now}`)
      .order("updated_at", { ascending: true });
    if (oneShotCampaignIdsInTick.length > 0) {
      campaignsQuery = campaignsQuery.not("id", "in", `(${oneShotCampaignIdsInTick.join(",")})`);
    }
    const { data: campaigns, error } = await campaignsQuery.limit(50);

    if (error) throw error;

    const results = await Promise.all(
      (campaigns || []).map(async ({ id }) => {
        try {
          // O invoke() do SDK reduz respostas 4xx/5xx a uma mensagem genérica
          // e escondia o motivo real da falha para a operação. Fetch explícito
          // preserva o corpo JSON do processor no histórico do scheduler.
          const processorResponse = await fetch(
            `${supabaseUrl}/functions/v1/campanha-disparo-processor`,
            {
              method: "POST",
              headers: {
                apikey: serviceRole,
                Authorization: `Bearer ${serviceRole}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ campanha_id: id }),
            },
          );
          const body = await processorResponse.json().catch(() => null);
          if (!processorResponse.ok) {
            return {
              campanha_id: id,
              ok: false,
              error: body?.error || `processor_http_${processorResponse.status}`,
              result: body,
            };
          }
          return { campanha_id: id, ok: body?.ok !== false, result: body ?? null };
        } catch (error) {
          return {
            campanha_id: id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const burstResults = await Promise.all(
      dueOneShots.map(async ({ id }) => {
        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/campanha-disparo-burst`,
            {
              method: "POST",
              headers: {
                apikey: serviceRole,
                Authorization: `Bearer ${serviceRole}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ run_id: id }),
            },
          );
          const body = await response.json().catch(() => null);
          return {
            campanha_id: body?.campanha_id || null,
            one_shot_id: id,
            ok: response.ok && body?.ok !== false,
            result: body,
          };
        } catch (error) {
          return {
            campanha_id: null,
            one_shot_id: id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    results.push(...burstResults);

    const failed = results.filter((result) => !result.ok);
    const sent = results.reduce((total, result) => total + Number(result.result?.sent || 0), 0);

    if (runId) {
      await admin
        .from("campanha_dispatch_scheduler_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: failed.length === 0 ? "succeeded" : "partial_failure",
          campaigns_seen: results.length,
          campaigns_triggered: results.length - failed.length,
          sent,
          failed: failed.length,
          details: results,
        })
        .eq("id", runId);
    }

    console.log(JSON.stringify({
      event: "campaign_scheduler_tick",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      campaigns: results.length,
      failed: failed.length,
      sent,
    }));

    return json({
      ok: failed.length === 0,
      campaigns: results.length,
      sent,
      failed: failed.length,
      results,
    }, failed.length === 0 ? 200 : 207);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId) {
      await admin
        .from("campanha_dispatch_scheduler_runs")
        .update({ finished_at: new Date().toISOString(), status: "failed", error_message: message })
        .eq("id", runId);
    }
    console.error(JSON.stringify({ event: "campaign_scheduler_error", started_at: startedAt, error: message }));
    return json({ ok: false, error: message }, 500);
  }
});
