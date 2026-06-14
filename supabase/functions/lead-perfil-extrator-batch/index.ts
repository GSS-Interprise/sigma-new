import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cobertura dos insights: acha leads com conversa (>=4 msgs) ainda não extraídos
// (ou extração velha) e roda o lead-perfil-extrator pra cada. Chamado por cron (a cada 2h)
// e no backfill. Processa em lote pequeno pra caber no timeout do edge.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);

  try {
    const body = await req.json().catch(() => ({}));
    const limite = Math.min(Number(body.limite) || 15, 50);
    const staleDias = Number(body.stale_dias) || 3;

    // Candidatos: lead com conversa >=4 msgs, sem perfil OU extração velha
    const { data: cands, error } = await supabase.rpc("perfil_extrator_candidatos", {
      p_limite: limite,
      p_stale_dias: staleDias,
    });
    if (error) throw new Error(`candidatos: ${error.message}`);

    const leadIds: string[] = (cands || []).map((r: any) => r.lead_id);
    let ok = 0, semDados = 0, fail = 0;

    for (const lead_id of leadIds) {
      try {
        const resp = await fetch(`${url}/functions/v1/lead-perfil-extrator`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id }),
        });
        const j = await resp.json();
        if (j.ok) ok++;
        else if (j.reason === "insuficiente" || j.reason === "opt_out") semDados++;
        else fail++;
      } catch (_) {
        fail++;
      }
    }

    return jsonResp({ ok: true, candidatos: leadIds.length, extraidos: ok, sem_dados: semDados, falhas: fail });
  } catch (err: any) {
    console.error("[perfil-batch]", err.message);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
