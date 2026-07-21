import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processSigzapOutboxRow, type SigzapOutboxRow } from "../_shared/sigzap-outbox.ts";

serve(async (req) => {
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    let tokenRole = "";
    try {
      const payload = (token.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/");
      const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
      tokenRole = JSON.parse(atob(padded)).role || "";
    } catch {
      // Chaves opacas novas continuam aceitas pela igualdade abaixo.
    }
    if (!serviceKey || (token !== serviceKey && tokenRole !== "service_role")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", serviceKey);
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body.limit) || 20, 100));
    const { data: rows, error: claimError } = await supabase.rpc("claim_sigzap_outbox_batch", { p_limit: limit });
    if (claimError) throw claimError;

    const { data: config, error: configError } = await supabase
      .from("config_lista_items").select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    if (configError) throw configError;
    const url = String(config?.find((item: any) => item.campo_nome === "evolution_api_url")?.valor || "").replace(/\/+$/, "");
    const apiKey = String(config?.find((item: any) => item.campo_nome === "evolution_api_key")?.valor || "");
    if (!url || !apiKey) throw new Error("Evolution API nao configurada");

    const results = [];
    for (const row of (rows || []) as SigzapOutboxRow[]) {
      try {
        results.push({ id: row.id, ...(await processSigzapOutboxRow({ supabase, evo: { url, apiKey }, row })) });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await supabase.from("sigzap_outbox").update({
          status: row.attempts >= row.max_attempts ? "failed" : "queued",
          next_retry_at: new Date(Date.now() + 60_000).toISOString(),
          last_error_code: "WORKER_ERROR",
          last_error_detail: detail.slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        results.push({ id: row.id, sent: false, error: detail });
      }
    }

    return Response.json({ processed: results.length, results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
