// =====================================================================
// report-semanal-maikon
// Relatório executivo SEMANAL de campanhas IA, enviado toda quinta-feira
// 8h BRT (11h UTC) pro grupo "Gss tecnologia Raul" pro Maikon usar na
// reunião de diretoria.
//
// DIFERENÇA do report-diario-grupo (17h):
//   - 17h = operacional do DIA (snapshot do que rolou hoje)
//   - 8h quinta = EXECUTIVO da SEMANA (foco em decisão de diretoria)
//
// Configurado pra rodar via pg_cron `0 11 * * 4` (08h BRT toda quinta).
// Chip de envio: Prospec-chapecó (mesmo do report 17h).
//
// POST opcional: { force?: true, dry_run?: true } pra testar sem enviar.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRUPO_JID_DEFAULT = "120363423136911817@g.us"; // Gss tecnologia Raul
const INSTANCIA_ENVIO = "Prospec-chapecó";
const DATA_INICIO_OPERACAO = "2026-04-27"; // primeira campanha (Pediatria UTI Chapecó)

function pickEmoji(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes("pediatr")) return "👶";
  if (n.includes("tubarão") || n.includes("emergencista") || n.includes("emergência")) return "🚑";
  if (n.includes("reumato")) return "🦴";
  if (n.includes("alerg")) return "🌿";
  if (n.includes("radio") || n.includes("telediagn") || n.includes("ultrasso")) return "🩻";
  if (n.includes("ortop")) return "🦵";
  if (n.includes("anestesi")) return "💉";
  if (n.includes("gineco") || n.includes("obstet")) return "👩‍⚕️";
  if (n.includes("clinico") || n.includes("clínico")) return "🩺";
  if (n.includes("psiqu")) return "🧠";
  if (n.includes("urolog")) return "🩻";
  if (n.includes("teste")) return "🧪";
  return "📌";
}

function formatDataBR(d: Date): string {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

// Retorna o domingo (00:00 BRT) da semana de uma data.
// Semana começa segunda 00:00 BRT, termina domingo 23:59:59 BRT.
function inicioSemana(d: Date): Date {
  const dow = d.getDay(); // 0=dom, 1=seg, ..., 6=sab
  const diff = dow === 0 ? -6 : 1 - dow; // ajusta pra segunda
  const seg = new Date(d);
  seg.setDate(d.getDate() + diff);
  seg.setHours(0, 0, 0, 0);
  return seg;
}

interface CampanhaSemanal {
  id: string;
  nome: string;
  status: string;
  // Semana atual
  disparos_semana: number;
  respostas_semana: number;
  quentes_semana: number;
  // Semana anterior (comparação)
  disparos_semana_anterior: number;
  // Acumulado
  total_disparos_acumulado: number;
  total_convertidos_acumulado: number;
  // Pool e saúde
  pool_pendentes: number;
  contatado: number;
  em_conversa: number;
  quentes_em_aberto: number;
  quente_mais_antigo_h: number | null;
  // Estimativa de autonomia
  autonomia_dias: number | null;
}

function montarMensagem(
  rows: CampanhaSemanal[],
  semanaInicio: Date,
  semanaFim: Date,
  primeiraExecucao: boolean
): string {
  const ehTeste = (c: CampanhaSemanal) => /teste/i.test(c.nome);
  const ativas = rows.filter((r) => r.status === "ativa" && !ehTeste(r));

  const totalDisparosSemana = ativas.reduce((s, r) => s + (r.disparos_semana || 0), 0);
  const totalDisparosAnterior = ativas.reduce((s, r) => s + (r.disparos_semana_anterior || 0), 0);
  const totalRespostasSemana = ativas.reduce((s, r) => s + (r.respostas_semana || 0), 0);
  const totalQuentesSemana = ativas.reduce((s, r) => s + (r.quentes_semana || 0), 0);
  const totalQuentesAbertos = ativas.reduce((s, r) => s + (r.quentes_em_aberto || 0), 0);
  const totalConvertidosAcumulado = ativas.reduce((s, r) => s + (r.total_convertidos_acumulado || 0), 0);
  const totalDisparosAcumulado = ativas.reduce((s, r) => s + (r.total_disparos_acumulado || 0), 0);

  const deltaSemana = totalDisparosAnterior > 0
    ? Math.round(((totalDisparosSemana - totalDisparosAnterior) / totalDisparosAnterior) * 100)
    : null;

  const taxaRespostaSemana = totalDisparosSemana > 0
    ? Math.round((totalRespostasSemana / totalDisparosSemana) * 100)
    : 0;

  const linhas: string[] = [];

  linhas.push(`📈 *GSS — Relatório Semanal de Prospecção IA*`);
  linhas.push(`_Semana ${formatDataBR(semanaInicio)} a ${formatDataBR(semanaFim)}_`);
  linhas.push("");

  // ===== RESUMO EXECUTIVO =====
  linhas.push(`*🎯 Resumo da semana:*`);
  const deltaStr = deltaSemana !== null
    ? ` (${deltaSemana >= 0 ? "+" : ""}${deltaSemana}% vs semana anterior)`
    : "";
  linhas.push(`• ${totalDisparosSemana} disparos enviados${deltaStr}`);
  linhas.push(`• ${totalRespostasSemana} respostas recebidas (taxa ${taxaRespostaSemana}%)`);
  linhas.push(`• ${totalQuentesSemana} leads quentes gerados`);
  linhas.push(`• ${totalQuentesAbertos} quente(s) aguardando atendimento humano`);
  linhas.push("");

  // ===== POR CAMPANHA =====
  linhas.push("———");
  linhas.push("");
  linhas.push(`*📋 Por campanha (semana atual):*`);
  linhas.push("");

  const ordenadas = [...ativas].sort((a, b) => b.disparos_semana - a.disparos_semana);

  for (const c of ordenadas) {
    const emoji = pickEmoji(c.nome);
    linhas.push(`${emoji} *${c.nome.trim()}*`);

    if (c.disparos_semana > 0) {
      const taxa = c.disparos_semana > 0
        ? Math.round((c.respostas_semana / c.disparos_semana) * 100)
        : 0;
      linhas.push(`  Semana: ${c.disparos_semana} disparos · ${c.respostas_semana} respostas (${taxa}%) · ${c.quentes_semana} quente(s)`);
    } else {
      linhas.push(`  Semana: sem disparos`);
    }

    linhas.push(`  Pipeline atual: ${c.contatado} contatados · ${c.em_conversa} em conversa · ${c.quentes_em_aberto} quente(s) aberto(s)`);

    if (c.total_disparos_acumulado > 0) {
      const conv = c.total_convertidos_acumulado > 0
        ? ` · ${c.total_convertidos_acumulado} convertido(s)`
        : "";
      linhas.push(`  Acumulado: ${c.total_disparos_acumulado} disparos${conv}`);
    }

    if (c.pool_pendentes > 0 && c.autonomia_dias !== null) {
      linhas.push(`  Pool restante: ${c.pool_pendentes} leads (~${c.autonomia_dias} dias de autonomia)`);
    } else if (c.pool_pendentes === 0) {
      linhas.push(`  ⚠️ Pool esgotado — precisa importar mais leads`);
    }

    linhas.push("");
  }

  // ===== HISTÓRICO COMPLETO (primeira execução) =====
  if (primeiraExecucao) {
    linhas.push("———");
    linhas.push("");
    linhas.push(`*📚 Histórico desde início (27/04):*`);
    linhas.push("");
    linhas.push(`• ${totalDisparosAcumulado} disparos totais enviados`);
    linhas.push(`• ${totalConvertidosAcumulado} contratos fechados`);
    linhas.push(`• ${ativas.length} campanhas ativas atualmente`);
    linhas.push("");

    // Por campanha — só acumulado
    for (const c of ordenadas.filter(c => c.total_disparos_acumulado > 0)) {
      const emoji = pickEmoji(c.nome);
      const conv = c.total_convertidos_acumulado > 0
        ? ` → ${c.total_convertidos_acumulado} convertido(s)`
        : "";
      linhas.push(`${emoji} ${c.nome.trim()}: ${c.total_disparos_acumulado} disparos${conv}`);
    }
    linhas.push("");
  }

  // ===== ALERTAS =====
  const quentesAtrasados = ativas
    .filter((c) => c.quente_mais_antigo_h && c.quente_mais_antigo_h > 24)
    .sort((a, b) => (b.quente_mais_antigo_h || 0) - (a.quente_mais_antigo_h || 0));

  const poolsEsgotados = ativas.filter((c) => c.pool_pendentes === 0);

  if (quentesAtrasados.length > 0 || poolsEsgotados.length > 0) {
    linhas.push("———");
    linhas.push("");
    linhas.push(`*⚠️ Próximas ações:*`);

    if (quentesAtrasados.length > 0) {
      linhas.push("");
      linhas.push(`Leads quentes esperando há mais de 24h:`);
      for (const c of quentesAtrasados) {
        const h = Math.round(c.quente_mais_antigo_h || 0);
        const dias = Math.floor(h / 24);
        const horasResto = h % 24;
        const tempo = dias > 0 ? `${dias}d ${horasResto}h` : `${h}h`;
        linhas.push(`  ▸ ${c.nome.trim()}: ${tempo}`);
      }
    }

    if (poolsEsgotados.length > 0) {
      linhas.push("");
      linhas.push(`Campanhas com pool esgotado:`);
      for (const c of poolsEsgotados) {
        linhas.push(`  ▸ ${c.nome.trim()}`);
      }
    }
    linhas.push("");
  }

  // ===== FOOTER =====
  linhas.push("———");
  linhas.push(`_Relatório semanal automatizado • GSS Tecnologia • Reunião de diretoria_`);

  return linhas.join("\n");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const forcePrimeira = body.primeira_execucao === true;

    // Calcula intervalos
    const agora = new Date();
    const semanaInicio = inicioSemana(agora);
    const semanaFim = new Date(semanaInicio);
    semanaFim.setDate(semanaInicio.getDate() + 6);
    semanaFim.setHours(23, 59, 59, 999);

    const semanaAnteriorInicio = new Date(semanaInicio);
    semanaAnteriorInicio.setDate(semanaInicio.getDate() - 7);
    const semanaAnteriorFim = new Date(semanaInicio);
    semanaAnteriorFim.setSeconds(-1);

    // Detecta primeira execução: nunca foi enviado antes
    const { data: ultimoEnvio } = await supabase
      .from("config_lista_items")
      .select("valor")
      .eq("campo_nome", "report_semanal_maikon_ultimo_envio")
      .maybeSingle();
    const primeiraExecucao = forcePrimeira || !ultimoEnvio?.valor;

    const { data: configs } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key", "report_grupo_jid"]);

    const cfg: Record<string, string> = {};
    for (const c of configs || []) cfg[c.campo_nome] = c.valor as string;

    const evoUrl = cfg.evolution_api_url?.replace(/\/+$/, "");
    const evoKey = cfg.evolution_api_key;
    const grupoJid = cfg.report_grupo_jid || GRUPO_JID_DEFAULT;

    if (!evoUrl || !evoKey) {
      return json({ ok: false, error: "evolution_not_configured" }, 500);
    }

    // Busca campanhas ativas de prospecção
    const { data: camps, error: campErr } = await supabase
      .from("campanhas")
      .select("id, nome, status, limite_diario_campanha")
      .eq("status", "ativa")
      .eq("tipo_campanha", "prospeccao");

    if (campErr) return json({ ok: false, error: "campanhas_failed", detail: campErr.message }, 500);

    // Pra cada campanha, agrega métricas
    const semanaIni = semanaInicio.toISOString();
    const semanaFimIso = semanaFim.toISOString();
    const semanaAntIni = semanaAnteriorInicio.toISOString();
    const semanaAntFim = semanaAnteriorFim.toISOString();

    const rows: CampanhaSemanal[] = [];

    for (const c of camps || []) {
      // disparos da semana (via campanha_leads.data_primeiro_contato)
      const { count: disparosSemana } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .gte("data_primeiro_contato", semanaIni)
        .lte("data_primeiro_contato", semanaFimIso);

      const { count: disparosSemanaAnt } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .gte("data_primeiro_contato", semanaAntIni)
        .lte("data_primeiro_contato", semanaAntFim);

      // respostas da semana (leads que avançaram pra em_conversa+ na semana)
      const { count: respostasSemana } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .in("status", ["em_conversa", "aquecido", "quente", "convertido"])
        .gte("data_ultimo_contato", semanaIni)
        .lte("data_ultimo_contato", semanaFimIso);

      // quentes gerados na semana
      const { count: quentesSemana } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .eq("status", "quente")
        .gte("data_status", semanaIni)
        .lte("data_status", semanaFimIso);

      // pool atual
      const { count: poolPendentes } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .eq("status", "frio");

      const { count: contatado } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .eq("status", "contatado");

      const { count: emConversa } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .eq("status", "em_conversa");

      const { count: quentesAbertos } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .eq("status", "quente");

      // acumulado total
      const { count: totalDisparos } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .not("data_primeiro_contato", "is", null);

      const { count: totalConvertidos } = await supabase
        .from("campanha_leads")
        .select("*", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .eq("status", "convertido");

      // quente mais antigo aguardando
      const { data: quenteMaisAntigo } = await supabase
        .from("campanha_leads")
        .select("data_status")
        .eq("campanha_id", c.id)
        .eq("status", "quente")
        .order("data_status", { ascending: true })
        .limit(1)
        .maybeSingle();

      let quenteH: number | null = null;
      if (quenteMaisAntigo?.data_status) {
        quenteH = (Date.now() - new Date(quenteMaisAntigo.data_status).getTime()) / (1000 * 60 * 60);
      }

      // autonomia estimada
      const limite = (c as any).limite_diario_campanha || 25;
      const autonomiaDias = (poolPendentes || 0) > 0
        ? Math.round((poolPendentes || 0) / limite)
        : null;

      rows.push({
        id: c.id,
        nome: c.nome,
        status: c.status,
        disparos_semana: disparosSemana || 0,
        respostas_semana: respostasSemana || 0,
        quentes_semana: quentesSemana || 0,
        disparos_semana_anterior: disparosSemanaAnt || 0,
        total_disparos_acumulado: totalDisparos || 0,
        total_convertidos_acumulado: totalConvertidos || 0,
        pool_pendentes: poolPendentes || 0,
        contatado: contatado || 0,
        em_conversa: emConversa || 0,
        quentes_em_aberto: quentesAbertos || 0,
        quente_mais_antigo_h: quenteH,
        autonomia_dias: autonomiaDias,
      });
    }

    const mensagem = montarMensagem(rows, semanaInicio, semanaFim, primeiraExecucao);
    console.log("[report-semanal-maikon] mensagem (", mensagem.length, "chars)");

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        primeira_execucao: primeiraExecucao,
        semana_inicio: semanaInicio.toISOString(),
        semana_fim: semanaFim.toISOString(),
        total_campanhas: rows.length,
        mensagem,
      });
    }

    const resp = await fetch(
      `${evoUrl}/message/sendText/${encodeURIComponent(INSTANCIA_ENVIO)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey },
        body: JSON.stringify({ number: grupoJid, text: mensagem }),
      }
    );

    const respBody = await resp.json().catch(() => null);

    if (!resp.ok) {
      console.error("[report-semanal-maikon] envio falhou:", resp.status, respBody);
      return json({ ok: false, error: "send_failed", status: resp.status, detail: respBody }, 500);
    }

    await supabase
      .from("config_lista_items")
      .upsert(
        { campo_nome: "report_semanal_maikon_ultimo_envio", valor: new Date().toISOString() },
        { onConflict: "campo_nome" }
      );

    console.log("[report-semanal-maikon] ✅ enviado pro grupo");
    return json({
      ok: true,
      primeira_execucao: primeiraExecucao,
      message_id: (respBody as any)?.key?.id || null,
      total_campanhas: rows.length,
      chars_enviados: mensagem.length,
    });
  } catch (err: any) {
    console.error("[report-semanal-maikon] erro:", err);
    return json({ ok: false, error: err?.message || "unknown" }, 500);
  }
});
