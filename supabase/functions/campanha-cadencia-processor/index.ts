import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppText } from "../_shared/evo-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_EXECUTION_MS = 120_000;
const MAX_LEADS_PER_RUN = 200;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const startTime = Date.now();
  let processed = 0, sent = 0, failed = 0, skipped = 0;

  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const filtroCampanha = body.campanha_id as string | undefined;

    console.log(`[cadencia] 🔔 processor iniciado${filtroCampanha ? ` (campanha=${filtroCampanha})` : ""}`);

    // Credenciais Evolution (pra WhatsApp)
    const { data: evoConfig } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    const evoUrl = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;

    // Busca leads com próximo touch pendente
    const agora = new Date().toISOString();
    let q = supabase
      .from("campanha_leads")
      .select(`
        id, campanha_id, lead_id, status, canal_atual, chip_usado_id, proximo_touch_em, proximo_passo_id, touches_executados, humano_assumiu,
        lead:lead_id(id, nome, phone_e164, email, uf, cidade, opt_out, classificacao, cooldown_ate),
        campanha:campanha_id(id, nome, status, cadencia_ativa, cadencia_template_id, briefing_ia, chip_id, chip_ids)
      `)
      .not("proximo_touch_em", "is", null)
      .lte("proximo_touch_em", agora)
      .in("status", ["contatado", "em_conversa", "aquecido"])
      .limit(MAX_LEADS_PER_RUN);

    if (filtroCampanha) q = q.eq("campanha_id", filtroCampanha);

    const { data: candidatos, error } = await q;
    if (error) throw new Error(`query: ${error.message}`);

    if (!candidatos || candidatos.length === 0) {
      console.log(`[cadencia] sem touches pendentes`);
      return json({ ok: true, processed: 0, sent: 0, failed: 0, skipped: 0 });
    }

    console.log(`[cadencia] ${candidatos.length} candidatos`);

    // Cache de passos por template (evita query N vezes)
    const passosCache = new Map<string, any[]>();
    const getPassos = async (templateId: string) => {
      if (passosCache.has(templateId)) return passosCache.get(templateId)!;
      const { data } = await supabase
        .from("cadencia_passos")
        .select("id, ordem, dia_offset, canal, mensagem_template, subject_template, is_breakup")
        .eq("template_id", templateId)
        .order("ordem", { ascending: true });
      const passos = data || [];
      passosCache.set(templateId, passos);
      return passos;
    };

    for (const cl of candidatos) {
      if (Date.now() - startTime > MAX_EXECUTION_MS - 5000) {
        console.warn(`[cadencia] timeout perto, parando`);
        break;
      }

      processed++;
      const lead = cl.lead as any;
      const campanha = cl.campanha as any;

      // Guards
      if (!lead || !campanha) { skipped++; continue; }
      if (lead.opt_out === true) { skipped++; await clearTouch(supabase, cl.id, "opt_out"); continue; }
      if (lead.classificacao === "proibido" || lead.classificacao === "protegido") { skipped++; await clearTouch(supabase, cl.id, "classificacao"); continue; }
      if (lead.cooldown_ate && new Date(lead.cooldown_ate) > new Date()) { skipped++; continue; }
      if (campanha.status !== "ativa") { skipped++; continue; }
      if (campanha.cadencia_ativa === false) { skipped++; await clearTouch(supabase, cl.id, "cadencia_desativada"); continue; }
      if (cl.humano_assumiu === true) { skipped++; continue; }

      if (!campanha.cadencia_template_id || !cl.proximo_passo_id) {
        skipped++;
        await clearTouch(supabase, cl.id, "sem_cadencia");
        continue;
      }

      const passos = await getPassos(campanha.cadencia_template_id);
      const passoAtual = passos.find((p: any) => p.id === cl.proximo_passo_id);
      if (!passoAtual) { skipped++; await clearTouch(supabase, cl.id, "passo_nao_encontrado"); continue; }

      // Executa por canal
      let touchOk = false;
      let touchErro = "";
      let conteudo = "";

      try {
        if (passoAtual.canal === "whatsapp" || passoAtual.canal === "whatsapp_audio") {
          const { ok, erro, msg } = await executarWhatsApp(supabase, cl, lead, campanha, passoAtual, evoUrl, evoKey);
          touchOk = ok;
          touchErro = erro;
          conteudo = msg;
        } else if (passoAtual.canal === "email") {
          const { ok, erro, msg, subject } = await executarEmail(supabase, cl, lead, campanha, passoAtual);
          touchOk = ok;
          touchErro = erro;
          conteudo = subject ? `[${subject}] ${msg}` : msg;
        } else if (passoAtual.canal === "ligacao_task") {
          // Cria tarefa humana pro responsável ligar
          touchOk = await criarTarefaLigacao(supabase, cl, lead, campanha, passoAtual);
          conteudo = "tarefa de ligação criada";
        } else {
          touchErro = `canal não suportado: ${passoAtual.canal}`;
        }
      } catch (e: any) {
        touchErro = e.message || String(e);
      }

      // Log touch
      await supabase.from("campanha_lead_touches").insert({
        campanha_lead_id: cl.id,
        passo_id: passoAtual.id,
        ordem: passoAtual.ordem,
        canal: passoAtual.canal,
        executado_em: new Date().toISOString(),
        resultado: touchOk ? "enviado" : "erro",
        conteudo_enviado: conteudo.slice(0, 1000),
        erro_detalhe: touchErro ? touchErro.slice(0, 500) : null,
      });

      // Avança cadência
      const proximo = passos.find((p: any) => p.ordem > passoAtual.ordem);
      const novoTouchEm = proximo
        ? new Date(Date.now() + (proximo.dia_offset - passoAtual.dia_offset) * 86400_000).toISOString()
        : null;

      const updates: any = {
        touches_executados: (cl.touches_executados || 0) + 1,
        data_ultimo_contato: new Date().toISOString(),
      };

      if (passoAtual.is_breakup || !proximo) {
        updates.proximo_touch_em = null;
        updates.proximo_passo_id = null;
        if (passoAtual.is_breakup) {
          updates.status = "sem_resposta";
          updates.data_status = new Date().toISOString();
        }
      } else {
        updates.proximo_touch_em = novoTouchEm;
        updates.proximo_passo_id = proximo.id;
      }

      await supabase.from("campanha_leads").update(updates).eq("id", cl.id);

      if (touchOk) sent++; else failed++;

      console.log(`[cadencia] ${touchOk ? "✅" : "❌"} T${passoAtual.ordem} ${passoAtual.canal} ${lead.nome} ${touchErro ? "- " + touchErro.slice(0, 80) : ""}`);
    }

    return json({ ok: true, processed, sent, failed, skipped });
  } catch (err: any) {
    console.error("[cadencia] ERRO:", err.message);
    return json({ ok: false, error: err.message }, 500);
  }
});

async function executarWhatsApp(supabase: any, cl: any, lead: any, campanha: any, passo: any, evoUrl?: string, evoKey?: string) {
  if (!evoUrl || !evoKey) return { ok: false, erro: "evolution_nao_configurado", msg: "" };

  // Pega chip usado no T1 (prioridade) ou primeiro chip da campanha
  let chipId = cl.chip_usado_id || campanha.chip_id || (campanha.chip_ids || [])[0];
  if (!chipId) return { ok: false, erro: "sem_chip", msg: "" };

  const { data: chip } = await supabase.from("chips").select("id, instance_name, nome, status").eq("id", chipId).maybeSingle();
  if (!chip || chip.status !== "ativo") return { ok: false, erro: "chip_inativo", msg: "" };

  const briefing = campanha.briefing_ia || {};
  const msgFinal = resolveTemplate(passo.mensagem_template || "Oi {{nome}}!", {
    nome: stripDoctorPrefix(lead.nome) || "Dr(a)",
    cidade: briefing.cidade || lead.cidade || "",
    hospital: briefing.hospital || "",
    servico: briefing.nome_servico || "",
  });

  const phone = normalizeBrazilPhone(lead.phone_e164 || "");
  if (!phone) return { ok: false, erro: "telefone_invalido", msg: "" };

  // Envio via helper anti-ban (warm-up + rate-limit + log automático)
  const result = await sendWhatsAppText({
    supabase,
    evo: { url: evoUrl, apiKey: evoKey },
    chipId: chip.id,
    instanceName: chip.instance_name,
    toJid: phone,
    text: msgFinal,
    eventoOrigem: "cadencia",
    awaitDelay: true,
  });
  if (result.sent) return { ok: true, erro: "", msg: msgFinal };
  return { ok: false, erro: result.reason || "send_failed", msg: msgFinal };
}

async function executarEmail(supabase: any, cl: any, lead: any, campanha: any, passo: any) {
  // Busca email primário do lead_contatos ou leads.email
  let emailTo = lead.email;
  if (!emailTo) {
    const { data: contato } = await supabase
      .from("lead_contatos")
      .select("valor")
      .eq("lead_id", lead.id)
      .eq("tipo", "email")
      .eq("ativo", true)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    emailTo = contato?.valor;
  }
  if (!emailTo) return { ok: false, erro: "sem_email", msg: "", subject: "" };

  const briefing = campanha.briefing_ia || {};
  const vars = {
    nome: stripDoctorPrefix(lead.nome) || "Dr(a)",
    cidade: briefing.cidade || lead.cidade || "",
    hospital: briefing.hospital || "",
    servico: briefing.nome_servico || "",
  };
  const subject = resolveTemplate(passo.subject_template || `Sobre a oportunidade em ${vars.cidade}`, vars);
  const text = resolveTemplate(passo.mensagem_template || "", vars);
  const html = text.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

  try {
    const resp = await fetch("https://zupsbgtoeoixfokzkjro.functions.supabase.co/campanha-email-sender", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        to: emailTo,
        subject,
        text,
        html,
        lead_id: lead.id,
        campanha_id: cl.campanha_id,
        campanha_lead_id: cl.id,
        template_id: `passo_${passo.id}`,
      }),
    });
    const data = await resp.json();
    if (!resp.ok || data.ok === false) {
      return { ok: false, erro: data.error || `email_${resp.status}`, msg: text, subject };
    }
    return { ok: true, erro: "", msg: text, subject };
  } catch (e: any) {
    return { ok: false, erro: e.message || "fetch_error", msg: text, subject };
  }
}

async function criarTarefaLigacao(supabase: any, cl: any, lead: any, campanha: any, passo: any) {
  const briefing = campanha.briefing_ia || {};
  const handoffTel = briefing.handoff_telefone || "";

  await supabase.from("lead_historico").insert({
    lead_id: lead.id,
    tipo_evento: "campanha_disparo",
    descricao_resumida: `[TAREFA] Ligar pro Dr(a) ${lead.nome} — ${campanha.nome} T${passo.ordem}`,
    metadados: {
      campanha_id: cl.campanha_id,
      passo_id: passo.id,
      responsavel_telefone: handoffTel,
      tipo: "ligacao_task",
    },
  });
  return true;
}

async function clearTouch(supabase: any, clId: string, motivo: string) {
  await supabase
    .from("campanha_leads")
    .update({ proximo_touch_em: null, proximo_passo_id: null, erro_envio: `cadencia_parada:${motivo}` })
    .eq("id", clId);
}

function resolveTemplate(tpl: string, vars: Record<string, string>): string {
  // Spintax {opt1|opt2}
  let txt = tpl.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, g1) => {
    const opts = String(g1).split("|");
    return opts[Math.floor(Math.random() * opts.length)];
  });
  // Variáveis {{nome}}
  txt = txt.replace(/\{\{(\w+)\}\}/g, (_, v) => vars[v] ?? "");
  return txt;
}

// Remove prefixos "Dr.", "Dra.", "Dr(a)." do início do nome
function stripDoctorPrefix(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(/^\s*(dr\.?\s*\(a\)\.?|dra?\.?)\s+/i, "")
    .trim();
}

function normalizeBrazilPhone(phone: string): string {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
