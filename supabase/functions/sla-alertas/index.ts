// Alertas do SLA de laudos (radiologia GSS). Cron a cada 5 min com {"acao": "coletor"}; só service_role chama.
//   criar_templates — envia à Meta os modelos de alerta (80% e vencido), com o botão "Assumir laudo"
//   coletor — sem leitura "ok" da estação há mais de 15 min: abre uma queda e avisa por e-mail; quando volta, fecha e avisa.
// Os alertas para o médico (80% / 100% do prazo) entram aqui depois (docs/arquitetura/sla-laudos-radiologia.md).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { chakraApi, unwrapChakraPayload } from "../_shared/chakra.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const UNIDADES = ["marieta"];
const LIMITE_MIN = 15;

// Modelos de alerta. Sem acento: os modelos acentuados desta conta foram recusados pela Meta (financeiro, 10/2026).
// Sem nome de paciente (decisão do Raul, 12/11): o médico acha o exame no PACS pela origem e pela hora.
// O botão leva o payload "sla_assumir:<alerta_id>" no envio; o chakra-webhook repassa para cá.
export const PAYLOAD_ASSUMIR = "sla_assumir:";
const MODELOS = [
  {
    nome: "gss_sla_laudo_prazo_v1",
    corpo: "Alerta de SLA de laudo - {{1}}, {{2}}: o exame das {{3}} vence em {{4}}. Confira o PACS e toque em Assumir laudo para parar os avisos.",
    exemplo: ["Pronto Socorro", "Hospital Marieta", "08:22", "20 min"],
    variaveis: { "1": "Origem", "2": "Unidade", "3": "Hora do exame", "4": "Tempo restante" },
  },
  {
    nome: "gss_sla_laudo_vencido_v1",
    corpo: "SLA de laudo vencido - {{1}}, {{2}}: o exame das {{3}} passou do prazo ha {{4}} e ninguem assumiu o laudo. Confira o PACS e toque em Assumir laudo.",
    exemplo: ["Pronto Socorro", "Hospital Marieta", "08:22", "15 min"],
    variaveis: { "1": "Origem", "2": "Unidade", "3": "Hora do exame", "4": "Tempo de atraso" },
  },
];

async function remetente(admin: any) {
  const { data: cfg } = await admin.from("config_lista_items").select("valor").eq("campo_nome", "sla_whatsapp_sender_id").maybeSingle();
  if (!cfg?.valor) throw new Error("config sla_whatsapp_sender_id ausente");
  const { data } = await admin.from("whatsapp_official_senders")
    .select("id, phone_e164, chakra_plugin_id, chakra_waba_id, chakra_phone_number_id").eq("id", cfg.valor).maybeSingle();
  if (!data) throw new Error("remetente do SLA nao encontrado");
  return data;
}

// Criação de modelo da Amni: a rota padrão (chakraApi) manda a WABA 286031407919518 pela conta da Pulse, que hoje
// responde 200 com {"_errors":["WABA ... is not part of plugin configuration or is not connected"]} e o modelo
// nunca chega à Meta (12/11). A conta GSS tem o plugin d9a6180c com essa WABA: cria por ela. O envio continua
// pela rota padrão até alguém migrar a Amni de conta (ver _shared/chakra.ts, CHAKRA_IDS_CONTA_PULSE).
async function chakraGss(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("CHAKRA_API_KEY_GSS")?.trim();
  if (!key) throw new Error("CHAKRA_API_KEY_GSS ausente");
  const r = await fetch(`https://api.chakrahq.com${path}`, {
    ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const corpo: any = await r.json().catch(() => ({}));
  if (!r.ok || (Array.isArray(corpo?._errors) && corpo._errors.length)) {
    throw new Error(`chakra ${r.status}: ${JSON.stringify(corpo?._errors ?? corpo).slice(0, 300)}`);
  }
  return corpo;
}

async function criarTemplates(admin: any, dryRun: boolean) {
  const sender = await remetente(admin);
  const out: unknown[] = [];
  for (const m of MODELOS) {
    const componentes = [
      { type: "BODY", text: m.corpo, example: { body_text: [m.exemplo] } },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Assumir laudo" }] },
    ];
    if (dryRun) { out.push({ nome: m.nome, remetente: sender.phone_e164, componentes }); continue; }
    const resposta = await chakraGss(`/v1/ext/plugin/whatsapp/api/v24.0/${sender.chakra_waba_id}/message_templates`,
      { method: "POST", body: JSON.stringify({ name: m.nome, category: "UTILITY", language: "pt_BR", components: componentes }) });
    const remoto = unwrapChakraPayload(resposta);
    const remotoId = String(remoto.id || remoto.message_template_id || m.nome);
    const st = String(remoto.status || "PENDING").toLowerCase();
    const { error } = await admin.from("whatsapp_official_templates").upsert({
      provider: "chakra", content_sid: `chakra:${sender.chakra_plugin_id}:${remotoId}`, friendly_name: m.nome, language: "pt_BR",
      category: "UTILITY", body: m.corpo, variables: m.variaveis,
      approval_status: st === "approved" ? "approved" : st === "rejected" ? "rejected" : "pending", twilio_payload: remoto,
      updated_at: new Date().toISOString(),
    }, { onConflict: "content_sid" });
    if (error) throw error;
    out.push({ nome: m.nome, status: st, id: remotoId, bruto: JSON.stringify(resposta).slice(0, 400) });
  }
  return out;
}

// Situação dos modelos direto na Meta (via Chakra): a conta que não enxerga a WABA aceita o modelo como "pendente"
// e nunca manda à Meta, então só vale o que a listagem da WABA mostra.
async function statusTemplates(admin: any) {
  const sender = await remetente(admin);
  const out: unknown[] = [];
  // O filtro ?name= é ignorado e a lista vem paginada: percorre as páginas pelo cursor.
  const todos: any[] = [];
  let after = "";
  for (let i = 0; i < 15; i++) {
    // Sem unwrapChakraPayload: ele devolveria o próprio array "data" e perderia o "paging".
    const r: any = await chakraGss(
      `/v1/ext/plugin/whatsapp/api/v24.0/${sender.chakra_waba_id}/message_templates${after ? `?after=${encodeURIComponent(after)}` : ""}`);
    if (Array.isArray(r?.data)) todos.push(...r.data);
    after = r?.paging?.cursors?.after && r?.paging?.next ? r.paging.cursors.after : "";
    if (!after) break;
  }
  for (const m of MODELOS) {
    const t = todos.find((x: any) => x.name === m.nome);
    const st = String(t?.status || "nao_encontrado").toLowerCase();
    if (t) {
      await admin.from("whatsapp_official_templates").update({
        approval_status: st === "approved" ? "approved" : st === "rejected" ? "rejected" : "pending", updated_at: new Date().toISOString(),
      }).eq("friendly_name", m.nome);
    }
    out.push({ nome: m.nome, status: st, motivo: t?.rejected_reason ?? null, total_na_waba: todos.length, nomes: todos.map((x: any) => x.name).join(",") });
  }
  return out;
}

function ehServiceRole(auth: string) {
  try {
    const p = JSON.parse(atob(auth.replace(/^Bearer\s+/i, "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p?.role === "service_role";
  } catch {
    return false;
  }
}

// Motivo legível a partir da última leitura recebida (qualquer status).
function motivoQueda(ultima: { status: string; detalhe: any; lida_em: string } | null, minutosSemNada: number | null) {
  if (!ultima || (minutosSemNada !== null && minutosSemNada > LIMITE_MIN)) {
    return "A estação parou de mandar leituras: PC desligado ou em suspensão, internet/túnel caído ou a tarefa do coletor parou.";
  }
  const m = ultima.detalhe?.motivo;
  if (m === "pacs_fechado") return "O Vue PACS está fechado na estação.";
  if (m === "tela_indisponivel") return "A tela da estação está bloqueada ou a sessão do usuário caiu.";
  if (ultima.status === "sem_grade") return "O PACS está aberto, mas a lista não aparece: outra janela por cima, outra pasta ou a VPN caiu.";
  return `Última leitura com status "${ultima.status}".`;
}

async function emailar(titulo: string, corpo: string) {
  const resend = Deno.env.get("RESEND_API_KEY");
  const para = (Deno.env.get("SLA_ALERTA_EMAILS") || Deno.env.get("MONITOR_WHATSAPP_EMAILS") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!resend || !para.length) return false;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Sigma GSS <avisos@gestaoservicosaude.com.br>", to: para, subject: titulo,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px"><p><b>${esc(titulo)}</b></p>`
        + `<p style="white-space:pre-line">${esc(corpo)}</p>`
        + `<p style="color:#9ca3af;font-size:12px">Coletor de SLA de laudos. O aviso sai quando a leitura para e quando volta.</p></div>`,
      tags: [{ name: "origem", value: "sla_coletor" }],
    }),
  }).catch(() => null);
  return !!r?.ok;
}

const hora = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "nunca";

async function checarColetor(admin: any, unidades = UNIDADES) {
  const res: unknown[] = [];
  for (const unidade of unidades) {
    const { data: ok } = await admin.from("sla_leituras").select("lida_em").eq("unidade", unidade).eq("status", "ok")
      .order("lida_em", { ascending: false }).limit(1).maybeSingle();
    const { data: ultima } = await admin.from("sla_leituras").select("lida_em, status, detalhe").eq("unidade", unidade)
      .order("lida_em", { ascending: false }).limit(1).maybeSingle();
    const { data: aberta } = await admin.from("sla_coletor_quedas").select("id, aberta_em").eq("unidade", unidade)
      .is("fechada_em", null).maybeSingle();

    const minOk = ok ? (Date.now() - new Date(ok.lida_em).getTime()) / 60000 : null;
    const minNada = ultima ? (Date.now() - new Date(ultima.lida_em).getTime()) / 60000 : null;
    const parado = minOk === null || minOk > LIMITE_MIN;

    if (parado && !aberta) {
      const motivo = motivoQueda(ultima, minNada);
      await admin.from("sla_coletor_quedas").insert({ unidade, ultima_ok_em: ok?.lida_em ?? null, motivo });
      const email = await emailar(`SLA de laudos: coletor parado (${unidade})`,
        `Ninguém está lendo a fila de laudos desde ${hora(ok?.lida_em ?? null)}.\n${motivo}\n\nEnquanto não voltar, os alertas de prazo não saem.`);
      res.push({ unidade, evento: "caiu", email });
    } else if (!parado && aberta) {
      await admin.from("sla_coletor_quedas").update({ fechada_em: new Date().toISOString() }).eq("id", aberta.id);
      const min = Math.round((Date.now() - new Date(aberta.aberta_em).getTime()) / 60000);
      const email = await emailar(`SLA de laudos: coletor voltou (${unidade})`,
        `A leitura da fila voltou às ${hora(ok!.lida_em)}. Ficou parada cerca de ${min + LIMITE_MIN} min.`);
      res.push({ unidade, evento: "voltou", email });
    } else {
      res.push({ unidade, parado, min_desde_ok: minOk === null ? null : Math.round(minOk) });
    }
  }
  return res;
}

Deno.serve(async (req) => {
  if (!ehServiceRole(req.headers.get("Authorization") || "")) return json({ ok: false, error: "sem_permissao" }, 401);
  const body = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    if (body.acao === "status_templates") return json({ ok: true, modelos: await statusTemplates(admin) });
    if (body.acao === "criar_templates") return json({ ok: true, modelos: await criarTemplates(admin, !!body.dry_run) });
    // body.unidades só para teste manual (ex.: ["teste"]); o cron não manda.
    if (body.acao === "coletor") return json({ ok: true, coletor: await checarColetor(admin, Array.isArray(body.unidades) ? body.unidades.map(String) : UNIDADES) });
    return json({ ok: false, error: "acao" }, 400);
  } catch (e) {
    console.error("[sla-alertas]", e);
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
