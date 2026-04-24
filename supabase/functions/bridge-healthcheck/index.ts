// Healthcheck do webhook do bridge N8N.
// Faz POST com payload de ping. Se 404/erro/timeout → alerta WhatsApp pro Raul.
// Idempotente: só alerta se o status MUDOU (evita spam).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_URL = "https://disparador-n8n.r0pfyf.easypanel.host/webhook/campanha-webhook-bridge";
const ALERT_PHONE = "555484351512"; // Raul
const HEALTHCHECK_TIMEOUT_MS = 10_000;

// Payload de ping: passa filtros do Parsear (event=messages.upsert, fromMe=false, sem @g.us)
// remoteJid usa um número que NÃO existe na base — assim, mesmo se passar pra IA, retorna lead_not_found
const PING_PAYLOAD = {
  event: "messages.upsert",
  instance: "_healthcheck_",
  data: {
    key: { id: "HEALTHCHECK-" + Date.now(), remoteJid: "550000000001@s.whatsapp.net", fromMe: false },
    message: { conversation: "[healthcheck-ping-ignore]" },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let status = "unknown";
  let httpCode = 0;
  let detail = "";

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), HEALTHCHECK_TIMEOUT_MS);
    const resp = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PING_PAYLOAD),
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);
    httpCode = resp.status;
    status = resp.status === 200 ? "ok" : `down:${resp.status}`;
    if (resp.status !== 200) {
      const txt = await resp.text();
      detail = txt.slice(0, 200);
    }
  } catch (e: any) {
    status = "error";
    detail = e.message?.slice(0, 200) || String(e);
  }

  // Estado anterior
  const { data: prevState } = await supabase
    .from("config_lista_items")
    .select("valor")
    .eq("campo_nome", "bridge_health_status")
    .maybeSingle();
  const prevStatus = prevState?.valor || "unknown";

  // Atualiza estado atual
  const agora = new Date().toISOString();
  await upsertConfig(supabase, "bridge_health_status", status);
  await upsertConfig(supabase, "bridge_health_last_check", agora);
  await upsertConfig(supabase, "bridge_health_last_detail", detail || `http=${httpCode}`);

  // Alerta SE mudou de ok pra down (não spamma se continua down)
  let alertSent = false;
  if (prevStatus === "ok" && status !== "ok") {
    alertSent = await sendAlert(supabase, "🚨 Bridge N8N CAIU", `Status: ${status}\nDetalhe: ${detail}\nHora: ${agora}\nA IA não vai responder leads até o bridge voltar.`);
  } else if (prevStatus !== "ok" && status === "ok" && prevStatus !== "unknown") {
    alertSent = await sendAlert(supabase, "✅ Bridge N8N VOLTOU", `Status: ok\nHora: ${agora}\nMensagens vão voltar a ser processadas.`);
  }

  console.log(`[healthcheck] bridge: ${status} (prev=${prevStatus}) http=${httpCode} alert=${alertSent}`);

  return new Response(
    JSON.stringify({ ok: true, status, http_code: httpCode, prev: prevStatus, alert_sent: alertSent, detail: detail || undefined }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function upsertConfig(supabase: any, campo: string, valor: string) {
  // Tenta update, se afetou 0 linhas, insert
  const { data: existing } = await supabase
    .from("config_lista_items")
    .select("id")
    .eq("campo_nome", campo)
    .maybeSingle();
  if (existing) {
    await supabase.from("config_lista_items").update({ valor }).eq("campo_nome", campo);
  } else {
    await supabase.from("config_lista_items").insert({ campo_nome: campo, valor });
  }
}

async function sendAlert(supabase: any, title: string, body: string): Promise<boolean> {
  try {
    const { data: evoConfig } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    const evoUrl = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;
    if (!evoUrl || !evoKey) return false;

    // Procura primeiro chip ativo pra mandar o alerta
    const { data: chip } = await supabase
      .from("chips")
      .select("instance_name")
      .eq("status", "ativo")
      .eq("tipo_instancia", "disparos")
      .limit(1)
      .maybeSingle();
    if (!chip?.instance_name) return false;

    const msg = `${title}\n\n${body}`;
    const r = await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(chip.instance_name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({ number: ALERT_PHONE, text: msg }),
    });
    return r.ok;
  } catch (e) {
    console.error("[healthcheck] alert err:", (e as Error).message);
    return false;
  }
}
