// =====================================================================
// report-diario-grupo
// Consulta vw_campanhas_dashboard, monta relatório das campanhas ativas
// e envia via chip Prospec-chapecó pro grupo WhatsApp configurado.
//
// Configurado pra rodar via pg_cron `0 20 * * 1-5` (17h BRT seg-sex).
// Chip de envio: Prospec-chapecó (numero pessoal do Raul, já está no grupo).
// Grupo destino: lido de config_lista_items.report_grupo_jid
//                ou fallback hardcoded.
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
  if (n.includes("teste")) return "🧪";
  return "📌";
}

function formatDataBR(d: Date): string {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

interface CampanhaRow {
  nome: string;
  status: string;
  disparos_hoje: number;
  disparos_ontem: number;
  disparos_7d: number;
  contatado: number;
  em_conversa: number;
  quentes: number;
  convertidos: number;
  pool_pendentes: number;
  taxa_contato_pct: number;
  quente_mais_antigo_h: number | null;
  total_disparos: number;
}

function montarMensagem(rows: CampanhaRow[]): string {
  const hoje = new Date();
  // TESTE é campanha interna de validação, não entra em métricas executivas
  const ehTeste = (c: CampanhaRow) => /teste/i.test(c.nome);
  const ativas = rows.filter((r) => r.status === "ativa" && !ehTeste(r));
  const totalDisparosHoje = ativas.reduce((s, r) => s + (r.disparos_hoje || 0), 0);
  const totalQuentesAbertos = ativas.reduce((s, r) => s + (r.quentes || 0), 0);
  const totalConvertidosHoje = ativas.reduce((s, r) => s + (r.convertidos || 0), 0);

  const linhas: string[] = [];
  linhas.push(`📊 *GSS — Status dos disparos (${formatDataBR(hoje)})*`);
  linhas.push("");
  linhas.push(
    `*Resumo do dia:* ${totalDisparosHoje} disparos | ${totalQuentesAbertos} lead(s) quente(s) em aberto`
  );
  linhas.push("");
  linhas.push("———");
  linhas.push("");

  // Ordena: mais disparos hoje primeiro, depois mais pool, depois nome
  const ordenadas = [...ativas].sort((a, b) => {
    if (b.disparos_hoje !== a.disparos_hoje) return b.disparos_hoje - a.disparos_hoje;
    return b.pool_pendentes - a.pool_pendentes;
  });

  for (const c of ordenadas) {
    const emoji = pickEmoji(c.nome);
    linhas.push(`${emoji} *${c.nome.trim()}*`);

    const deltaOntem = c.disparos_ontem
      ? ` (vs ${c.disparos_ontem} ontem)`
      : "";
    linhas.push(`${c.disparos_hoje} disparos hoje${deltaOntem}`);

    if (c.em_conversa > 0 || c.contatado > 0) {
      const partes: string[] = [];
      if (c.contatado > 0) partes.push(`${c.contatado} contatados`);
      if (c.em_conversa > 0) partes.push(`${c.em_conversa} em conversa`);
      linhas.push(partes.join(" | "));
    }

    if (c.taxa_contato_pct > 0 && c.total_disparos >= 5) {
      linhas.push(`Taxa de contato: ${c.taxa_contato_pct}%`);
    }

    if (c.quentes > 0) {
      const horas = c.quente_mais_antigo_h
        ? ` (mais antigo: ${Math.round(c.quente_mais_antigo_h)}h)`
        : "";
      linhas.push(`🔥 ${c.quentes} lead(s) quente(s)${horas}`);
    }

    if (c.convertidos > 0) {
      linhas.push(`✅ ${c.convertidos} convertidos acumulado`);
    }

    linhas.push("");
  }

  linhas.push("———");
  linhas.push("");

  // Alertas: leads quentes esperando > 12h
  const quentesEsperando = ativas
    .filter((c) => c.quente_mais_antigo_h && c.quente_mais_antigo_h > 12)
    .sort((a, b) => (b.quente_mais_antigo_h || 0) - (a.quente_mais_antigo_h || 0));

  if (quentesEsperando.length > 0) {
    linhas.push("*⚠️ Atenção pra Bruna:*");
    for (const c of quentesEsperando) {
      const h = Math.round(c.quente_mais_antigo_h || 0);
      linhas.push(`  ▸ ${c.nome.trim()}: quente esperando há ${h}h`);
    }
    linhas.push("");
  }

  if (totalConvertidosHoje > 0) {
    linhas.push(`✅ *Convertidos acumulados:* ${totalConvertidosHoje}`);
    linhas.push("");
  }

  linhas.push(`_Report automatizado das 17h • GSS Tecnologia_`);

  return linhas.join("\n");
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

    const { data: rows, error: viewErr } = await supabase
      .from("vw_campanhas_dashboard")
      .select(
        "nome, status, disparos_hoje, disparos_ontem, disparos_7d, contatado, em_conversa, quentes, convertidos, pool_pendentes, taxa_contato_pct, quente_mais_antigo_h, total_disparos"
      );

    if (viewErr) return json({ ok: false, error: "view_failed", detail: viewErr.message }, 500);

    const mensagem = montarMensagem((rows || []) as CampanhaRow[]);
    console.log("[report-grupo] mensagem montada (", mensagem.length, " chars)");

    if (dryRun) {
      return json({ ok: true, dry_run: true, mensagem, total_campanhas: rows?.length || 0 });
    }

    const resp = await fetch(
      `${evoUrl}/message/sendText/${encodeURIComponent(INSTANCIA_ENVIO)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey },
        body: JSON.stringify({
          number: grupoJid,
          text: mensagem,
        }),
      }
    );

    const respBody = await resp.json().catch(() => null);

    if (!resp.ok) {
      console.error("[report-grupo] envio falhou:", resp.status, respBody);
      return json(
        { ok: false, error: "send_failed", status: resp.status, detail: respBody },
        500
      );
    }

    await supabase
      .from("config_lista_items")
      .upsert(
        {
          campo_nome: "report_grupo_ultimo_envio",
          valor: new Date().toISOString(),
        },
        { onConflict: "campo_nome" }
      );

    console.log("[report-grupo] ✅ enviado pro grupo");
    return json({
      ok: true,
      message_id: (respBody as any)?.key?.id || null,
      total_campanhas: rows?.length || 0,
      chars_enviados: mensagem.length,
    });
  } catch (e) {
    console.error("[report-grupo] uncaught:", e);
    return json({ ok: false, error: "uncaught", detail: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
