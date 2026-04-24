// Healthcheck dos chips de disparo.
// Ping via /chat/sendPresence: esse endpoint depende do socket Baileys vivo.
// /chat/whatsappNumbers retorna ok mesmo com socket morto (falso positivo),
// e /instance/fetchInstances reporta state=open inconsistentemente. Presence
// é o único ping leve (sem efeitos ao lead) que reflete saúde real.
// Se o ping falha: tenta /instance/restart e recheca. Se segue ruim, marca
// o chip como 'suspeito' e alerta o Raul via WhatsApp (uma vez, quando o
// status muda — igual ao bridge-healthcheck, sem spam).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_PHONE = "555484351512"; // Raul
const PRESENCE_TARGET = "555484351512"; // number usado só no presence ping (não envia msg visível)
const CHECK_TIMEOUT_MS = 10_000;
const RESTART_WAIT_MS = 8_000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: evoConfig } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    const evoUrl = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;
    if (!evoUrl || !evoKey) throw new Error("Evolution não configurada");

    // Só chips que o usuário marcou como "pode disparar". Ativos + suspeitos
    // (este último pra detectar recuperação e voltar pra 'ativo').
    // Ignora chips inativos (desligados deliberadamente) e sem instance_name.
    const { data: chips } = await supabase
      .from("chips")
      .select("id, nome, instance_name, status, connection_state, tipo_instancia, pode_disparar")
      .eq("tipo_instancia", "disparos")
      .eq("pode_disparar", true)
      .in("status", ["ativo", "suspeito"])
      .not("instance_name", "is", null);

    const results: any[] = [];
    let alertsSent = 0;

    for (const chip of chips || []) {
      const wasHealthy = chip.connection_state === "open" && chip.status === "ativo";
      const r = await checkChip(chip, evoUrl, evoKey);

      // Persist novo estado
      await supabase.from("chips").update({
        connection_state: r.healthy ? "open" : (r.last_state || "close"),
        status: r.healthy ? "ativo" : (chip.status === "ativo" ? "suspeito" : chip.status),
        updated_at: new Date().toISOString(),
      }).eq("id", chip.id);

      // Alerta só em mudança (wasHealthy -> isHealthy)
      if (wasHealthy && !r.healthy) {
        const title = `🚨 Chip ${chip.nome} CAIU`;
        const body =
          `Instance: ${chip.instance_name}\n` +
          `Motivo: ${r.reason}\n` +
          `Restart: ${r.restart_attempted ? (r.restart_worked ? "tentou e voltou" : "tentou mas falhou") : "não tentado"}\n` +
          `Hora: ${new Date().toISOString()}\n` +
          `Campanhas vão começar a falhar até reconectar manualmente.`;
        if (await sendAlert(supabase, evoUrl, evoKey, title, body, chip.id)) alertsSent++;
      } else if (!wasHealthy && r.healthy) {
        const title = `✅ Chip ${chip.nome} VOLTOU`;
        const body = `Instance: ${chip.instance_name}\nHora: ${new Date().toISOString()}\nDisparos voltam a funcionar.`;
        if (await sendAlert(supabase, evoUrl, evoKey, title, body, chip.id)) alertsSent++;
      }

      results.push({
        chip_id: chip.id,
        nome: chip.nome,
        healthy: r.healthy,
        reason: r.reason,
        restart_attempted: r.restart_attempted,
        restart_worked: r.restart_worked,
      });
    }

    console.log(`[chip-healthcheck] checados=${results.length} saudáveis=${results.filter(r=>r.healthy).length} alertas=${alertsSent}`);

    return new Response(
      JSON.stringify({ ok: true, checked: results.length, alerts_sent: alertsSent, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[chip-healthcheck] ERRO:", e.message);
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function checkChip(
  chip: any,
  evoUrl: string,
  evoKey: string,
): Promise<{ healthy: boolean; reason: string; restart_attempted: boolean; restart_worked: boolean; last_state: string }> {
  const instance = encodeURIComponent(chip.instance_name);

  const firstPing = await pingChip(evoUrl, evoKey, instance);
  if (firstPing.ok) {
    return { healthy: true, reason: "ping_ok", restart_attempted: false, restart_worked: false, last_state: "open" };
  }

  // Falhou — tenta restart
  let restartWorked = false;
  try {
    await fetchWithTimeout(`${evoUrl}/instance/restart/${instance}`, {
      method: "POST",
      headers: { apikey: evoKey },
    }, CHECK_TIMEOUT_MS);
    await sleep(RESTART_WAIT_MS);

    const secondPing = await pingChip(evoUrl, evoKey, instance);
    if (secondPing.ok) {
      restartWorked = true;
      return {
        healthy: true,
        reason: `first_ping_failed(${firstPing.reason})_then_restart_ok`,
        restart_attempted: true,
        restart_worked: true,
        last_state: "open",
      };
    }
    return {
      healthy: false,
      reason: `ping_failed:${firstPing.reason};restart_then_ping_failed:${secondPing.reason}`,
      restart_attempted: true,
      restart_worked: false,
      last_state: "close",
    };
  } catch (e: any) {
    return {
      healthy: false,
      reason: `ping_failed:${firstPing.reason};restart_error:${(e.message || "").slice(0, 80)}`,
      restart_attempted: true,
      restart_worked: restartWorked,
      last_state: "close",
    };
  }
}

async function pingChip(
  evoUrl: string,
  evoKey: string,
  instance: string,
): Promise<{ ok: boolean; reason: string }> {
  try {
    const resp = await fetchWithTimeout(`${evoUrl}/chat/sendPresence/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({ number: PRESENCE_TARGET, delay: 100, presence: "available" }),
    }, CHECK_TIMEOUT_MS);
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, reason: `http_${resp.status}:${txt.slice(0, 80)}` };
    }
    const data = await resp.json();
    // Evolution retorna { presence: "available" } quando OK
    if (data && (data.presence || data.ok === true)) return { ok: true, reason: "presence_ok" };
    return { ok: false, reason: "presence_response_invalid" };
  } catch (e: any) {
    return { ok: false, reason: `fetch_error:${(e.message || "").slice(0, 80)}` };
  }
}

async function sendAlert(
  supabase: any,
  evoUrl: string,
  evoKey: string,
  title: string,
  body: string,
  excludeChipId: string,
): Promise<boolean> {
  try {
    // Escolhe um chip ativo DIFERENTE do que caiu (se o próprio caiu, não adianta)
    const { data: chipAlerta } = await supabase
      .from("chips")
      .select("instance_name")
      .eq("status", "ativo")
      .eq("tipo_instancia", "disparos")
      .neq("id", excludeChipId)
      .limit(1)
      .maybeSingle();
    const instance = chipAlerta?.instance_name;
    if (!instance) {
      // Fallback: qualquer chip ativo (mesmo o que caiu — última tentativa)
      const { data: anyChip } = await supabase
        .from("chips")
        .select("instance_name")
        .eq("status", "ativo")
        .limit(1)
        .maybeSingle();
      if (!anyChip?.instance_name) return false;
      return await doSend(evoUrl, evoKey, anyChip.instance_name, `${title}\n\n${body}`);
    }
    return await doSend(evoUrl, evoKey, instance, `${title}\n\n${body}`);
  } catch (e) {
    console.error("[chip-healthcheck] alert err:", (e as Error).message);
    return false;
  }
}

async function doSend(evoUrl: string, evoKey: string, instance: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({ number: ALERT_PHONE, text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, opts: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
