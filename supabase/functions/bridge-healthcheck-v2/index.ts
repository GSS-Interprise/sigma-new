// Healthcheck E2E (versão 2): testa fluxo completo, não só endpoint HTTP.
//
// Verifica 5 sinais independentes:
//   1. bridge_http      — endpoint do webhook responde 200 (igual ao v1)
//   2. webhooks_ok      — todas instances ativas com URL = /campanha-webhook-bridge
//   3. fluxo_entrada    — entradas elegíveis de IA possuem processamento durável
//   4. fluxo_processa   — campanha_leads ganhou response da IA recente
//   5. fluxo_saida      — campanha_lead_touches com touches executados recente
//
// Cada métrica vira um sub-status. Alerta dispara só se MUDA de ok→down (idempotente).
// Dispara alertas separados por categoria, assim Raul sabe se é entrada/processo/saída.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const N8N_HEALTH_URL = "https://disparador-n8n.srv983143.hstgr.cloud/healthz";
const BRIDGE_PATH_FRAGMENT = "campanha-webhook-bridge"; // todo webhook saudável tem este fragmento
const ALERT_PHONE = "555484351512";
const HTTP_TIMEOUT_MS = 10_000;

// Janela "horário comercial" pra avaliar volume esperado (UTC)
// 12h-22h UTC = 9h-19h BRT
const HOR_COMERCIAL_UTC_INI = 12;
const HOR_COMERCIAL_UTC_FIM = 22;

// Limites pra considerar "sem volume" (suspeito) — só vale em horário comercial e com campanha ativa
const FLUXO_ENTRADA_GAP_HORAS = 3;   // sem msgs incoming há 3h em horário comercial = suspeito
const FLUXO_SAIDA_GAP_HORAS = 6;     // sem touches há 6h em horário comercial com campanha ativa = suspeito

type Metric = { ok: boolean; detail: string; evaluated?: boolean };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const agora = new Date();
  const agoraIso = agora.toISOString();
  const horaUtc = agora.getUTCHours();
  const dia = agora.getUTCDay(); // 0=Dom, 6=Sab
  const isHorarioComercial = dia >= 1 && dia <= 5 && horaUtc >= HOR_COMERCIAL_UTC_INI && horaUtc <= HOR_COMERCIAL_UTC_FIM;

  // ── 1. Bridge HTTP ping ──
  const bridgeHttp = await checkBridgeHttp();

  // ── 2. Webhooks das instances saudáveis apontam pro path certo? ──
  const webhooksOk = await checkWebhooksConfig(supabase);

  // ── 3. Fluxo de entrada: mensagens elegíveis chegaram ao processamento durável? ──
  const fluxoEntrada = await checkFluxoEntrada(supabase, isHorarioComercial);

  // ── 4. Fluxo de processamento: campanha_leads ganhou resposta IA recente? ──
  const fluxoProcessa = await checkFluxoProcessamento(supabase, isHorarioComercial);

  // ── 5. Fluxo de saída: touches sendo executados em campanhas ativas? ──
  const fluxoSaida = await checkFluxoSaida(supabase, isHorarioComercial);

  // ── Composição final ──
  const metricas = { bridge_http: bridgeHttp, webhooks_ok: webhooksOk, fluxo_entrada: fluxoEntrada, fluxo_processa: fluxoProcessa, fluxo_saida: fluxoSaida };
  const avaliadas = Object.values(metricas).filter((m) => m.evaluated !== false);
  const overall = avaliadas.every((m) => m.ok) ? "ok" : "down";

  // ── Persiste estado granular ──
  await upsertConfig(supabase, "bridge_health_status", overall);
  await upsertConfig(supabase, "bridge_health_last_check", agoraIso);
  await upsertConfig(supabase, "bridge_health_last_detail", JSON.stringify({
    bridge_http: metricas.bridge_http.ok ? "ok" : metricas.bridge_http.detail,
    webhooks_ok: metricas.webhooks_ok.ok ? "ok" : metricas.webhooks_ok.detail,
    fluxo_entrada: metricas.fluxo_entrada.evaluated === false ? "não avaliado" : metricas.fluxo_entrada.ok ? "ok" : metricas.fluxo_entrada.detail,
    fluxo_processa: metricas.fluxo_processa.evaluated === false ? "não avaliado" : metricas.fluxo_processa.ok ? "ok" : metricas.fluxo_processa.detail,
    fluxo_saida: metricas.fluxo_saida.evaluated === false ? "não avaliado" : metricas.fluxo_saida.ok ? "ok" : metricas.fluxo_saida.detail,
    horario_comercial: isHorarioComercial,
  }).slice(0, 1000));

  // ── Alertas idempotentes por categoria (só em mudança ok→down) ──
  const alertas: string[] = [];
  for (const [name, m] of Object.entries(metricas)) {
    // Fora da janela de avaliação não é recuperação. Preserva o último estado
    // observado e evita alertas "VOLTOU" causados apenas pela troca de horário.
    if (m.evaluated === false) continue;
    const key = `bridge_health_${name}_status`;
    const { data: prev } = await supabase.from("config_lista_items").select("valor").eq("campo_nome", key).maybeSingle();
    const prevOk = (prev?.valor || "ok") === "ok";
    const nowOk = m.ok;
    await upsertConfig(supabase, key, nowOk ? "ok" : "down");

    if (prevOk && !nowOk) {
      // Caiu — manda alerta
      const sent = await sendAlert(supabase, `🚨 Bridge: ${name} CAIU`, `Detalhe: ${m.detail}\nHora: ${agoraIso}\nResolva antes que afete a operação.`);
      if (sent) alertas.push(`${name}:fired`);
    } else if (!prevOk && nowOk) {
      // Voltou
      const sent = await sendAlert(supabase, `✅ Bridge: ${name} VOLTOU`, `Hora: ${agoraIso}\nFluxo retomado.`);
      if (sent) alertas.push(`${name}:recovered`);
    }
  }

  console.log(`[healthcheck-v2] overall=${overall} comercial=${isHorarioComercial} alertas=${alertas.length}`);

  return new Response(
    JSON.stringify({ ok: true, overall, horario_comercial: isHorarioComercial, metricas, alertas }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// ─────────── Métricas individuais ───────────

async function checkBridgeHttp(): Promise<Metric> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    // Testa o runtime do n8n sem injetar uma mensagem falsa no workflow.
    const resp = await fetch(N8N_HEALTH_URL, { method: "GET", signal: ctrl.signal });
    clearTimeout(t);
    if (resp.status === 200) return { ok: true, detail: "http=200" };
    return { ok: false, detail: `http=${resp.status}` };
  } catch (e: any) {
    return { ok: false, detail: `fetch_error: ${e.message?.slice(0, 100)}` };
  }
}

async function checkWebhooksConfig(supabase: any): Promise<Metric> {
  const { data: evo } = await supabase
    .from("config_lista_items")
    .select("campo_nome, valor")
    .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
  const url = evo?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
  const key = evo?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;
  if (!url || !key) return { ok: false, detail: "evolution_api não configurada" };

  // Listar chips ativos disparáveis (mesmo critério do chip-healthcheck)
  const { data: chips } = await supabase
    .from("chips")
    .select("instance_name")
    .eq("status", "ativo")
    .eq("tipo_instancia", "disparos")
    // Apenas chips explicitamente classificados para prospecção IA usam o
    // bridge automático. Chips manuais/legados sem categoria não devem gerar
    // alerta de webhook errado nem ser roteados para a IA por acidente.
    .eq("categoria_uso", "prospeccao_ia")
    .eq("pode_disparar", true)
    .not("instance_name", "is", null);

  if (!chips || chips.length === 0) return { ok: true, detail: "sem chips ativos pra checar" };

  const errados: string[] = [];
  for (const c of chips) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(`${url}/webhook/find/${encodeURIComponent(c.instance_name)}`, {
        headers: { apikey: key },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!resp.ok) { errados.push(`${c.instance_name}:http_${resp.status}`); continue; }
      const data = await resp.json();
      const u = String(data?.url || "");
      if (!u.includes(BRIDGE_PATH_FRAGMENT)) {
        errados.push(`${c.instance_name}:url_errado(${u.slice(0, 60)})`);
      }
    } catch (e: any) {
      errados.push(`${c.instance_name}:err(${(e.message || "").slice(0, 50)})`);
    }
  }

  if (errados.length === 0) return { ok: true, detail: `${chips.length} chips ok` };
  return { ok: false, detail: `${errados.length}/${chips.length} chips com webhook errado: ${errados.slice(0, 3).join("; ")}` };
}

async function checkFluxoEntrada(supabase: any, isHorComercial: boolean): Promise<Metric> {
  if (!isHorComercial) return { ok: true, detail: "fora horário comercial", evaluated: false };

  // Tem campanha ativa com leads em status que esperam interação?
  const { count: campanhasAtivas } = await supabase
    .from("campanhas")
    .select("id", { count: "exact", head: true })
    .eq("status", "ativa")
    .eq("tipo_campanha", "prospeccao");

  if (!campanhasAtivas || campanhasAtivas === 0) return { ok: true, detail: "sem campanhas ativas" };

  const desde = new Date(Date.now() - FLUXO_ENTRADA_GAP_HORAS * 3600_000).toISOString();
  const { data: snapshot, error } = await supabase.rpc("bridge_ia_health_snapshot", {
    p_since: desde,
    p_grace: "2 minutes",
  });
  if (error) return { ok: false, detail: `snapshot_error: ${error.message}` };

  const eligible = Number(snapshot?.eligible_phones || 0);
  const covered = Number(snapshot?.covered_phones || 0);
  const missing = Number(snapshot?.missing_phones || 0);
  if (eligible === 0) return { ok: true, detail: "sem incoming elegível de campanha IA" };
  if (missing === 0) return { ok: true, detail: `${covered}/${eligible} contatos IA roteados` };
  return {
    ok: false,
    detail: `${missing}/${eligible} contatos de campanha IA sem processamento durável; amostras=${JSON.stringify(snapshot?.missing_samples || [])}`,
  };
}

async function checkFluxoProcessamento(supabase: any, isHorComercial: boolean): Promise<Metric> {
  if (!isHorComercial) return { ok: true, detail: "fora horário comercial", evaluated: false };
  const desde = new Date(Date.now() - FLUXO_ENTRADA_GAP_HORAS * 3600_000).toISOString();
  const { data: snapshot, error } = await supabase.rpc("bridge_ia_health_snapshot", {
    p_since: desde,
    p_grace: "2 minutes",
  });
  if (error) return { ok: false, detail: `snapshot_error: ${error.message}` };

  const completed = Number(snapshot?.completed || 0);
  const failed = Number(snapshot?.failed || 0);
  const stuck = Number(snapshot?.stuck || 0);
  const total = completed + failed;
  if (stuck > 0) return { ok: false, detail: `${stuck} processamentos travados há mais de 5 min` };
  if (failed >= 3 && failed / Math.max(total, 1) > 0.2) {
    return { ok: false, detail: `${failed}/${total} processamentos falharam nas últimas ${FLUXO_ENTRADA_GAP_HORAS}h` };
  }
  return { ok: true, detail: `${completed} concluídos, ${failed} falhos, ${stuck} travados` };
}

async function checkFluxoSaida(supabase: any, isHorComercial: boolean): Promise<Metric> {
  if (!isHorComercial) return { ok: true, detail: "fora horário comercial", evaluated: false };

  // Existe campanha ativa com pool > 0 disponível pra disparar?
  const { data: campsAtivas } = await supabase
    .from("campanhas")
    .select("id, nome, limite_diario_campanha, tipo_envio, whatsapp_provider, chip_id, chip_ids")
    .eq("status", "ativa")
    .eq("tipo_campanha", "prospeccao")
    // Campanhas manuais dependem da operadora e não geram touches automáticos.
    // Incluí-las aqui produzia falso positivo de bridge caída quando havia
    // leads frios aguardando o primeiro contato manual.
    .in("tipo_envio", ["ia", "ambos"]);

  if (!campsAtivas || campsAtivas.length === 0) return { ok: true, detail: "sem campanhas ativas" };

  // Tem leads frio nas campanhas ativas?
  const ids = campsAtivas.map((c: any) => c.id);
  const { count: friosPendentes } = await supabase
    .from("campanha_leads")
    .select("id", { count: "exact", head: true })
    .in("campanha_id", ids)
    .eq("status", "frio");

  if (!friosPendentes || friosPendentes === 0) return { ok: true, detail: "sem leads frios pra disparar" };

  // Primeiro confirma se existe capacidade operacional para executar touches.
  // Diferencia ausência de capacidade operacional de uma fila realmente
  // travada. Sem um chip IA aberto, nenhum worker consegue criar touch,
  // portanto "0 touches" sozinho induzia a equipe a investigar a fila errada.
  const configuredChipIds = [...new Set(
    campsAtivas.flatMap((camp: any) => [
      ...(Array.isArray(camp.chip_ids) ? camp.chip_ids : []),
      ...(camp.chip_id ? [camp.chip_id] : []),
    ].filter(Boolean)),
  )];

  if (configuredChipIds.length === 0) {
    return {
      ok: false,
      detail: `${friosPendentes} frios esperando, nenhuma campanha IA tem chip atribuído — atribua um chip antes de investigar a fila`,
    };
  }

  const { count: chipsOperacionais } = await supabase
    .from("chips")
    .select("id", { count: "exact", head: true })
    .in("id", configuredChipIds)
    .eq("status", "ativo")
    .eq("connection_state", "open")
    .eq("tipo_instancia", "disparos")
    .eq("categoria_uso", "prospeccao_ia")
    .eq("pode_disparar", true);

  if (!chipsOperacionais || chipsOperacionais === 0) {
    return {
      ok: false,
      detail: `${friosPendentes} frios esperando, 0 chips IA operacionais conectados — reconecte/atribua um chip antes de investigar a fila`,
    };
  }

  const desde = new Date(Date.now() - FLUXO_SAIDA_GAP_HORAS * 3600_000).toISOString();
  const { count: touchesRecentes } = await supabase
    .from("campanha_lead_touches")
    .select("id", { count: "exact", head: true })
    .gte("executado_em", desde)
    .eq("resultado", "enviado");

  if ((touchesRecentes || 0) > 0) return { ok: true, detail: `${touchesRecentes} touches em ${FLUXO_SAIDA_GAP_HORAS}h` };
  return { ok: false, detail: `${friosPendentes} frios esperando, 0 touches em ${FLUXO_SAIDA_GAP_HORAS}h — disparo travado` };
}

// ─────────── Helpers ───────────

async function upsertConfig(supabase: any, campo: string, valor: string) {
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

    const { data: chip } = await supabase
      .from("chips")
      .select("instance_name")
      .eq("status", "ativo")
      .eq("tipo_instancia", "disparos")
      .eq("connection_state", "open")
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
    console.error("[healthcheck-v2] alert err:", (e as Error).message);
    return false;
  }
}
