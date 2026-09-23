import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyOfficialThrottle } from "../_shared/official-cadence.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-campaign-scheduler-key",
};

// The sender-level database lease is the shared pacing source for this
// one-shot and regular campaigns; a provider 429 defers rather than burns a
// recipient attempt or counts as a sent message.
const WAVE_CONCURRENCY = 1;
const MAX_RUN_MS = 45_000;
const SEND_TIMEOUT_MS = 20_000;
const CAMPAIGN_HOLD_STATUS = "pausada";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function hasServiceRoleClaim(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
  if (!token) return false;
  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded))?.role === "service_role";
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function countFirstContacts(admin: any, campanhaId: string, start: Date) {
  const { count, error } = await admin
    .from("campanha_leads")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanhaId)
    .neq("status", "frio")
    .not("data_primeiro_contato", "is", null)
    .gte("data_primeiro_contato", start.toISOString());
  if (error) throw error;
  return count || 0;
}

async function reconcileFailure(
  admin: any,
  leadId: string,
  reason: string,
  providerCode?: string,
) {
  const { error } = await admin.rpc("reconcile_whatsapp_delivery", {
    p_campanha_lead_id: leadId,
    p_status: "failed",
    p_error_code: providerCode || (reason.match(/\b\d{3,6}\b/) || [null])[0],
    p_error_message: reason,
  });
  if (error) console.error("[burst] reconcile failed", error.message);
}

async function deferSend(admin: unknown, leadId: string, retryAfterMs: number) {
  const client = admin as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await client.rpc("defer_whatsapp_campaign_send", {
    p_campanha_lead_id: leadId,
    p_retry_after_ms: retryAfterMs,
  });
  if (error) throw error;
}

async function sendLead(admin: any, supabaseUrl: string, serviceRole: string, lead: any) {
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_whatsapp_campaign_send",
    { p_campanha_lead_id: lead.id },
  );
  if (claimError) throw claimError;
  if (claimed !== true) return { outcome: "skipped" as const };

  try {
    const response = await fetchWithTimeout(
      `${supabaseUrl}/functions/v1/twilio-whatsapp-send`,
      {
        method: "POST",
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campaign_lead_id: lead.id }),
      },
      SEND_TIMEOUT_MS,
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      const throttle = classifyOfficialThrottle(response.status, body);
      if (throttle) {
        await deferSend(admin, lead.id, throttle.retryAfterMs);
        return {
          outcome: "rate_limited" as const,
          reason: throttle.reason,
          retryAfterMs: throttle.retryAfterMs,
        };
      }
      const reason = [body?.error, body?.provider_code, body?.provider_message]
        .filter(Boolean)
        .join(": ") || `send_http_${response.status}`;
      const providerCode = body?.provider_code != null
        ? String(body.provider_code)
        : "";
      await reconcileFailure(admin, lead.id, reason, providerCode);
      return { outcome: "failed" as const, reason };
    }
    return { outcome: "sent" as const };
  } catch (error) {
    const reason = errorText(error);
    await reconcileFailure(admin, lead.id, reason);
    return { outcome: "failed" as const, reason };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const schedulerKey = Deno.env.get("CAMPAIGN_SCHEDULER_KEY") || "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, error: "runtime_not_configured" }, 500);

  const authorization = req.headers.get("Authorization") || "";
  const internal = schedulerKey && req.headers.get("x-campaign-scheduler-key") === schedulerKey;
  if (!internal && authorization !== `Bearer ${serviceRole}` && !hasServiceRoleClaim(authorization)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const input = await req.json().catch(() => ({}));
  const runId = String(input.run_id || "");
  if (!runId) return json({ ok: false, error: "run_id_required" }, 400);

  const admin = createClient(supabaseUrl, serviceRole);
  const { data: run, error: runError } = await admin
    .from("campanha_dispatch_one_shots")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (runError) return json({ ok: false, error: runError.message }, 500);
  if (!run) return json({ ok: false, error: "run_not_found" }, 404);
  if (run.status !== "scheduled") return json({ ok: true, skipped: true, status: run.status });

  const lockToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data: claimedRun, error: claimRunError } = await admin
    .from("campanha_dispatch_one_shots")
    .update({ status: "running", lock_token: lockToken, started_at: now, updated_at: now })
    .eq("id", runId)
    .eq("status", "scheduled")
    .select("*")
    .maybeSingle();
  if (claimRunError) return json({ ok: false, error: claimRunError.message }, 500);
  if (!claimedRun) return json({ ok: true, skipped: true, reason: "already_claimed" });

  try {
    const { data: campaign, error: campaignError } = await admin
      .from("campanhas")
      .select("*")
      .eq("id", run.campanha_id)
      .single();
    if (campaignError) throw campaignError;
    if (!(campaign.whatsapp_provider === "chakra" || campaign.whatsapp_provider === "twilio")) {
      throw new Error("campaign_not_official_provider");
    }
    if (!campaign.official_sender_id || !campaign.official_template_id) {
      throw new Error("official_sender_or_template_missing");
    }

    // Keep the normal scheduler from consuming the same queue while this
    // controlled run owns it. The test intentionally ends in a paused state.
    await admin.from("campanhas").update({ status: CAMPAIGN_HOLD_STATUS, next_batch_at: null }).eq("id", campaign.id);

    const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const dayStart = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3));
    const alreadySent = await countFirstContacts(admin, campaign.id, dayStart);
    const remainingTarget = Math.max(0, Number(run.max_contacts) - alreadySent);
    if (remainingTarget === 0) {
      await admin.from("campanha_dispatch_one_shots").update({
        status: "succeeded", finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", runId).eq("lock_token", lockToken);
      return json({ ok: true, sent: 0, already_sent: alreadySent, remaining: 0 });
    }

    const { data: leads, error: leadsError } = await admin
      .from("campanha_leads")
      .select("id, retry_count, next_retry_at, envio_status")
      .eq("campanha_id", campaign.id)
      .eq("status", "frio")
      .in("envio_status", ["not_sent", "retry_wait"])
      .or(`erro_envio.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(remainingTarget);
    if (leadsError) throw leadsError;

    let attempted = Number(claimedRun.attempted_count || 0);
    let sent = Number(claimedRun.sent_count || 0);
    let failed = Number(claimedRun.failed_count || 0);
    let lastError = "";
    let rateLimitedRetryAfterMs: number | null = null;
    const executionStartedAt = Date.now();
    for (let index = 0; index < (leads || []).length; index += WAVE_CONCURRENCY) {
      if (Date.now() - executionStartedAt >= MAX_RUN_MS) {
        const nextRunAt = new Date(Date.now() + 1_000).toISOString();
        await admin.from("campanha_dispatch_one_shots").update({
          status: "scheduled",
          run_at: nextRunAt,
          lock_token: null,
          attempted_count: attempted,
          sent_count: sent,
          failed_count: failed,
          last_error: lastError || "execution_budget_exhausted",
          updated_at: new Date().toISOString(),
        }).eq("id", runId).eq("lock_token", lockToken);
        return json({
          ok: false,
          status: "scheduled_continuation",
          sent,
          failed,
          attempted,
          requested: Number(run.max_contacts),
          retry_at: nextRunAt,
        }, 202);
      }
      const wave = (leads || []).slice(index, index + WAVE_CONCURRENCY);
      const results = await Promise.all(wave.map((lead: any) => sendLead(admin, supabaseUrl, serviceRole, lead)));
      for (const result of results) {
        if (result.outcome !== "skipped" && !(
          result.outcome === "rate_limited" && result.reason === "sender_cooldown"
        )) attempted += 1;
        if (result.outcome === "sent") sent += 1;
        if (result.outcome === "failed") {
          failed += 1;
          lastError = result.reason || lastError;
        }
        if (result.outcome === "rate_limited") {
          lastError = result.reason || lastError;
          rateLimitedRetryAfterMs = result.retryAfterMs;
        }
      }
      await admin.from("campanha_dispatch_one_shots").update({ attempted_count: attempted, sent_count: sent, failed_count: failed, last_error: lastError || null, updated_at: new Date().toISOString() }).eq("id", runId).eq("lock_token", lockToken);
      if (rateLimitedRetryAfterMs !== null) break;
    }

    if (rateLimitedRetryAfterMs !== null) {
      const retryDelay = Math.max(rateLimitedRetryAfterMs, 1_000);
      const nextRunAt = new Date(Date.now() + retryDelay).toISOString();
      await admin.from("campanha_dispatch_one_shots").update({
        status: "scheduled",
        run_at: nextRunAt,
        lock_token: null,
        attempted_count: attempted,
        sent_count: sent,
        failed_count: failed,
        last_error: lastError || "chakra_rate_limited",
        updated_at: new Date().toISOString(),
      }).eq("id", runId).eq("lock_token", lockToken);
      return json({
        ok: false,
        status: "scheduled_rate_limited",
        sent,
        failed,
        attempted,
        requested: Number(run.max_contacts),
        retry_at: nextRunAt,
      }, 429);
    }

    const finalStatus = failed > 0 ? "completed_with_errors" : "succeeded";
    await admin.from("campanha_dispatch_one_shots").update({
      status: finalStatus,
      attempted_count: attempted,
      sent_count: sent,
      failed_count: failed,
      last_error: lastError || null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", runId).eq("lock_token", lockToken);
    return json({ ok: failed === 0, sent, failed, attempted, requested: Number(run.max_contacts), already_sent: alreadySent });
  } catch (error) {
    const message = errorText(error);
    await admin.from("campanha_dispatch_one_shots").update({
      status: "failed", last_error: message, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", runId).eq("lock_token", lockToken);
    return json({ ok: false, error: message }, 500);
  }
});
