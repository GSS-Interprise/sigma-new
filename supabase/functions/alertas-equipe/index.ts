// Avisos à equipe comercial (Vinicius e Maikon) sobre médicos interessados — decisão do Raul em 12/11:
//   quente  { campanha_lead_id, resumo } — médico que quer fechar (ALERTA_LEAD da IA): WhatsApp na hora.
//   resumo  (cron diário, 18h) — médicos classificados como "interessado" no dia: um WhatsApp com o total por campanha.
//   criar_templates / status_templates — modelos na Meta (número 9713-2474).
//   ia_falhas (cron 15 min) — Fase 8.1: 3+ respostas da IA falhando em 30 min = e-mail ao Raul com o motivo (no máximo
//               1 a cada 6 h). Caso real: a OpenAI ficou sem crédito de 09 a 12/11 e 92 respostas falharam em silêncio.
//               As conversas sem resposta já aparecem em Conversas › "Precisa de resposta".
// Só WhatsApp oficial (pedido do Raul), pelo remetente de config alertas_equipe_sender_id. Antes, o aviso de lead
// quente saía pelo chip Evolution, desligado desde 08/11: em 30 dias 1 lead quente e nenhum aviso entregue.
// Começa em config alertas_equipe_inicio (2026-11-16). Destinatários: alertas_equipe_destinos = "Nome:55...; Nome:55...".
// Só service_role chama.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const SIGMA = "https://sigma-gss.lovable.app";
const PLUGIN_GSS = "d9a6180c-4ae4-4ed4-9c16-401b781e1ee7"; // conta Chakra GSS (BM GSS), a mesma do SLA
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// Sem acento: modelos acentuados desta conta já foram recusados pela Meta.
const MODELOS = [
  {
    nome: "gss_medico_quente_v1",
    corpo: "Medico quer fechar - {{1}} ({{2}}), campanha {{3}}: {{4}}. Abra a conversa no Sigma pelo botao e fale com ele hoje.",
    exemplo: ["Dra. Maria Silva", "Pediatria", "Pediatria Nova Prata", "perguntou quando comeca e pediu para falar com alguem"],
    botao: { type: "URL", text: "Abrir conversa", url: `${SIGMA}/conversas?conversa={{1}}`, example: [`${SIGMA}/conversas?conversa=3f2a9c1e`] },
  },
  {
    nome: "gss_resumo_interessados_v1",
    corpo: "Resumo do dia - {{1}} medicos responderam com interesse nas campanhas: {{2}}. Veja quem precisa de resposta no Sigma pelo botao.",
    exemplo: ["12", "Pediatria Nova Prata 5, GO Braco do Norte 4, Anestesio SMO 3"],
    botao: { type: "URL", text: "Abrir Conversas", url: `${SIGMA}/conversas`, example: undefined },
  },
];

async function config(admin: any, nome: string) {
  const { data } = await admin.from("config_lista_items").select("valor").eq("campo_nome", nome).maybeSingle();
  return String(data?.valor ?? "").trim();
}

async function chakraGss(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("CHAKRA_API_KEY_GSS")?.trim();
  if (!key) throw new Error("CHAKRA_API_KEY_GSS ausente");
  const r = await fetch(`https://api.chakrahq.com${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
  const corpo: any = await r.json().catch(() => ({}));
  if (!r.ok || (Array.isArray(corpo?._errors) && corpo._errors.length)) throw new Error(`chakra ${r.status}: ${JSON.stringify(corpo?._errors ?? corpo).slice(0, 300)}`);
  return corpo;
}

async function remetente(admin: any) {
  const id = await config(admin, "alertas_equipe_sender_id");
  if (!id) throw new Error("config alertas_equipe_sender_id ausente");
  const { data } = await admin.from("whatsapp_official_senders").select("id, phone_e164, chakra_waba_id, chakra_phone_number_id").eq("id", id).maybeSingle();
  if (!data) throw new Error("remetente nao encontrado");
  return data;
}

async function destinos(admin: any) {
  return (await config(admin, "alertas_equipe_destinos")).split(/[;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.lastIndexOf(":");
    return { nome: i > 0 ? x.slice(0, i).trim() : "", fone: dig(i > 0 ? x.slice(i + 1) : x) };
  }).filter((d) => d.fone.length >= 12);
}

async function ativo(admin: any) {
  const inicio = await config(admin, "alertas_equipe_inicio");
  return !!inicio && Date.now() >= new Date(`${inicio}T00:00:00-03:00`).getTime();
}

async function enviar(sender: any, para: string, modelo: string, corpo: string[], botao?: string) {
  const componentes: any[] = [{ type: "body", parameters: corpo.map((t) => ({ type: "text", text: t.slice(0, 200) })) }];
  if (botao) componentes.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: botao }] });
  const r = await chakraGss(`/v1/ext/plugin/whatsapp/${PLUGIN_GSS}/api/v24.0/${sender.chakra_phone_number_id}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "template",
      template: { name: modelo, language: { policy: "deterministic", code: "pt_BR" }, components: componentes } }),
  });
  return JSON.stringify(r).match(/wamid\.[A-Za-z0-9=_-]+/)?.[0] ?? null;
}

async function quente(admin: any, campanhaLeadId: string, resumo: string, forcar: boolean) {
  if (!forcar && !(await ativo(admin))) return { pulado: "antes de alertas_equipe_inicio" };
  // um aviso por campanha_lead: o mesmo médico quente em rodadas seguidas não repete
  const { data: cl } = await admin.from("campanha_leads")
    .select("id, conversa_id, metadados, lead:lead_id(nome, especialidade), campanha:campanha_id(nome)").eq("id", campanhaLeadId).maybeSingle();
  if (!cl) return { erro: "campanha_lead nao encontrado" };
  if (!forcar && cl.metadados?.alerta_quente_em) return { pulado: "ja avisado" };
  const sender = await remetente(admin);
  const lista = await destinos(admin);
  const nome = String(cl.lead?.nome || "Medico").replace(/\b\w+/g, (w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const esp = String(cl.lead?.especialidade || "especialidade nao informada").replace(/^&/, "").split(/ - RQE| RQE|&/)[0].trim();
  const out = [];
  for (const d of lista) {
    try {
      out.push({ para: d.nome, wamid: await enviar(sender, d.fone, "gss_medico_quente_v1", [nome, esp, String(cl.campanha?.nome || "").trim(), resumo || "demonstrou interesse em fechar"], String(cl.conversa_id || "")) });
    } catch (e) { out.push({ para: d.nome, erro: String((e as Error).message).slice(0, 200) }); }
  }
  await admin.from("campanha_leads").update({ metadados: { ...(cl.metadados || {}), alerta_quente_em: new Date().toISOString() } }).eq("id", cl.id);
  return { enviados: out };
}

async function resumoDiario(admin: any, forcar: boolean) {
  if (!forcar && !(await ativo(admin))) return { pulado: "antes de alertas_equipe_inicio" };
  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data } = await admin.from("conversa_classificacao").select("campanha_lead_id, campanha:campanha_id(nome)")
    .eq("resultado", "interessado").gte("classificado_em", desde);
  const porCampanha = new Map<string, Set<string>>();
  for (const c of data ?? []) {
    const n = String(c.campanha?.nome || "Sem campanha").trim();
    if (!porCampanha.has(n)) porCampanha.set(n, new Set());
    porCampanha.get(n)!.add(c.campanha_lead_id);
  }
  const total = [...porCampanha.values()].reduce((s, v) => s + v.size, 0);
  if (total === 0) return { total: 0, enviado: false };
  const txt = [...porCampanha.entries()].sort((a, b) => b[1].size - a[1].size).map(([n, v]) => `${n} ${v.size}`).join(", ");
  const sender = await remetente(admin);
  const out = [];
  for (const d of await destinos(admin)) {
    try { out.push({ para: d.nome, wamid: await enviar(sender, d.fone, "gss_resumo_interessados_v1", [String(total), txt]) }); }
    catch (e) { out.push({ para: d.nome, erro: String((e as Error).message).slice(0, 200) }); }
  }
  return { total, enviados: out };
}

async function criarTemplates(admin: any) {
  const sender = await remetente(admin);
  const out = [];
  for (const m of MODELOS) {
    const botao: any = { type: "URL", text: m.botao.text, url: m.botao.url };
    if (m.botao.example) botao.example = m.botao.example;
    try {
      const r = await chakraGss(`/v1/ext/plugin/whatsapp/api/v24.0/${sender.chakra_waba_id}/message_templates`, {
        method: "POST",
        body: JSON.stringify({ name: m.nome, category: "UTILITY", language: "pt_BR",
          components: [{ type: "BODY", text: m.corpo, example: { body_text: [m.exemplo] } }, { type: "BUTTONS", buttons: [botao] }] }),
      });
      await admin.from("whatsapp_official_templates").upsert({
        provider: "chakra", content_sid: `chakra:${PLUGIN_GSS}:${r.id ?? m.nome}`, friendly_name: m.nome, language: "pt_BR", category: "UTILITY",
        body: m.corpo, approval_status: String(r.status || "pending").toLowerCase() === "approved" ? "approved" : "pending", twilio_payload: r,
        updated_at: new Date().toISOString(),
      }, { onConflict: "content_sid" });
      out.push({ nome: m.nome, status: r.status, id: r.id });
    } catch (e) { out.push({ nome: m.nome, erro: String((e as Error).message).slice(0, 300) }); }
  }
  return out;
}

async function statusTemplates(admin: any) {
  const sender = await remetente(admin);
  const todos: any[] = [];
  let after = "";
  for (let i = 0; i < 15; i++) {
    const r: any = await chakraGss(`/v1/ext/plugin/whatsapp/api/v24.0/${sender.chakra_waba_id}/message_templates${after ? `?after=${encodeURIComponent(after)}` : ""}`);
    if (Array.isArray(r?.data)) todos.push(...r.data);
    after = r?.paging?.cursors?.after && r?.paging?.next ? r.paging.cursors.after : "";
    if (!after) break;
  }
  return MODELOS.map((m) => { const t = todos.find((x) => x.name === m.nome); return { nome: m.nome, status: t?.status ?? "nao_encontrado", motivo: t?.rejected_reason ?? null }; });
}

async function iaFalhas(admin: any) {
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await admin.from("campanha_ia_processed_messages").select("result, claimed_at")
    .eq("status", "failed").gte("claimed_at", desde);
  const falhas = (data ?? []).filter((r: any) => !String(r.result?.recovery || "").includes("retry"));
  if (falhas.length < 3) return { falhas: falhas.length, alertou: false };
  const ultimo = await config(admin, "ia_falhas_alerta_em");
  if (ultimo && Date.now() - new Date(ultimo).getTime() < 6 * 3_600_000) return { falhas: falhas.length, alertou: false, motivo: "ja alertado" };
  const motivos = new Map<string, number>();
  for (const f of falhas) { const m = String(f.result?.error || "?").slice(0, 120); motivos.set(m, (motivos.get(m) ?? 0) + 1); }
  const resend = Deno.env.get("RESEND_API_KEY");
  const para = (Deno.env.get("MONITOR_WHATSAPP_EMAILS") || "").split(",").map((x) => x.trim()).filter(Boolean);
  let enviado = false;
  if (resend && para.length) {
    const corpo = `A IA das campanhas falhou ${falhas.length} vezes nos últimos 30 minutos. Os médicos ficaram sem resposta e aparecem em Conversas › Precisa de resposta.\n\nMotivos:\n`
      + [...motivos].map(([m, n]) => `${n}x ${m}`).join("\n");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Sigma GSS <avisos@gestaoservicosaude.com.br>", to: para, subject: `IA das campanhas falhando (${falhas.length} em 30 min)`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-line">${corpo.replace(/[<>&]/g, "")}</div>` }),
    }).catch(() => null);
    enviado = !!r?.ok;
  }
  const agora = new Date().toISOString();
  const { data: existe } = await admin.from("config_lista_items").select("id").eq("campo_nome", "ia_falhas_alerta_em").maybeSingle();
  if (existe) await admin.from("config_lista_items").update({ valor: agora }).eq("id", existe.id);
  else await admin.from("config_lista_items").insert({ campo_nome: "ia_falhas_alerta_em", valor: agora });
  return { falhas: falhas.length, alertou: enviado, motivos: Object.fromEntries(motivos) };
}

async function autorizado(auth: string) {
  const chave = auth.replace(/^Bearer\s+/i, "").trim();
  if (!chave) return false;
  if (chave === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim()) return true;
  const { error } = await createClient(Deno.env.get("SUPABASE_URL")!, chave, { auth: { persistSession: false } }).from("integracao_segredos").select("nome").limit(1);
  return !error;
}

Deno.serve(async (req) => {
  if (!(await autorizado(req.headers.get("Authorization") || ""))) return json({ ok: false, error: "sem_permissao" }, 401);
  const body = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    if (body.acao === "quente") return json({ ok: true, ...(await quente(admin, String(body.campanha_lead_id || ""), String(body.resumo || ""), !!body.forcar)) });
    if (body.acao === "resumo") return json({ ok: true, ...(await resumoDiario(admin, !!body.forcar)) });
    if (body.acao === "ia_falhas") return json({ ok: true, ...(await iaFalhas(admin)) });
    if (body.acao === "criar_templates") return json({ ok: true, modelos: await criarTemplates(admin) });
    if (body.acao === "status_templates") return json({ ok: true, modelos: await statusTemplates(admin) });
    return json({ ok: false, error: "acao" }, 400);
  } catch (e) {
    console.error("[alertas-equipe]", e);
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
