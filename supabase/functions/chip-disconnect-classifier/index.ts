// =====================================================================
// chip-disconnect-classifier
// Recebe eventos CONNECTION_UPDATE da Evolution (via N8N bridge ou direto)
// e classifica o disconnect, atualizando chip_state + chip_health_event.
//
// Payload esperado (do bridge ou Evolution direto):
//   {
//     "instance": "Prospec-chapecó",
//     "instanceName": "Prospec-chapecó",
//     "state": "close",
//     "statusReason": 401,
//     "disconnectionReasonCode": 401,
//     "disconnectionObject": "{...}"
//   }
//
// Doc: .claude/plano-aquecimento-anti-ban-v1.md §7 Sprint 1
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();

    // Aceita formatos variados (bridge N8N pode reformatar)
    const instanceName: string | undefined =
      body.instance || body.instanceName || body.instance_name;
    const state: string | undefined = body.state || body.connection;
    const code: number | undefined =
      body.statusReason ||
      body.disconnectionReasonCode ||
      body.code ||
      body.error_code;
    const reason: string | undefined =
      body.reason || body.message || body.disconnectionObject;

    if (!instanceName) {
      return json({ ok: false, error: "instanceName missing" }, 400);
    }

    // Resolve chip_id pelo instance_name
    const { data: chip } = await supabase
      .from("chips")
      .select("id, nome, connection_state")
      .eq("instance_name", instanceName)
      .maybeSingle();

    if (!chip) {
      return json({ ok: false, error: `chip not found: ${instanceName}` }, 404);
    }

    // Atualiza connection_state na tabela chips se mudou
    if (state && state !== chip.connection_state) {
      await supabase
        .from("chips")
        .update({ connection_state: state, updated_at: new Date().toISOString() })
        .eq("id", chip.id);
    }

    // Só classifica se for desconexão (state=close) com código
    if (state === "close" && code) {
      const { data: classification, error } = await supabase.rpc(
        "chip_register_disconnect",
        { p_chip_id: chip.id, p_code: code, p_reason: reason || null }
      );
      if (error) {
        console.error("[disconnect-classifier] rpc error", error);
        return json({ ok: false, error: error.message }, 500);
      }
      console.log(
        `[disconnect-classifier] ${chip.nome} (${instanceName}) code=${code} →`,
        classification
      );
      return json({ ok: true, chip: chip.nome, classification });
    }

    // Reconnect (state=open) → registra recovery (score_delta = -10 implícito via decay)
    if (state === "open") {
      console.log(
        `[disconnect-classifier] ${chip.nome} reconnected (state=open)`
      );
      return json({ ok: true, chip: chip.nome, action: "reconnect" });
    }

    return json({
      ok: true,
      chip: chip.nome,
      action: "noop",
      reason: "no_disconnect_code",
    });
  } catch (e: any) {
    console.error("[disconnect-classifier] error", e);
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
