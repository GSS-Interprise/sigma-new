// Alertas do SLA de laudos (radiologia GSS). Plano: docs/arquitetura/sla-laudos-radiologia.md. Só service_role chama.
//   coletor (cron 5 min) — sem leitura "ok" da estação há mais de 15 min: abre uma queda e avisa por e-mail; quando volta, avisa.
//   exames  (cron 2 min) — 80% do prazo: WhatsApp ao plantonista com "Assumir laudo"; 100% sem assumir: de novo ao
//                          plantonista + coordenador (WhatsApp e e-mail). Só roda com config sla_alertas_ativo = "true".
//   assumir              — clique no botão (chamado pelo chakra-webhook): marca o exame como assumido e para os avisos.
//   criar_templates / status_templates — modelos na Meta.
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

// ── Motor de alertas ao médico ─────────────────────────────────────────────
// Envio pela conta Chakra GSS, plugin d9a6180c (BM GSS, inclui a Amni): é a conta em que os modelos foram criados.
const PLUGIN_GSS = "d9a6180c-4ae4-4ed4-9c16-401b781e1ee7";
const ORIGEM: Record<string, string> = { ps: "Pronto Socorro", internado: "Internado", externo: "Externo" };
const NOME_UNIDADE: Record<string, string> = { marieta: "Hospital Marieta" };
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
// Mesmo número com ou sem o 9 e o 55: compara DDD + 8 últimos dígitos.
const mesmoNumero = (a: string, b: string) => {
  const n = (x: string) => { const d = dig(x).replace(/^55/, ""); return d.slice(0, 2) + d.slice(-8); };
  return n(a) === n(b);
};
const duracao = (min: number) => {
  const m = Math.max(1, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
};
const horaExame = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

async function enviarModelo(sender: any, para: string, modelo: string, params: string[], alertaId: string) {
  const resp = await chakraGss(`/v1/ext/plugin/whatsapp/${PLUGIN_GSS}/api/v24.0/${sender.chakra_phone_number_id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "template",
      template: {
        name: modelo, language: { policy: "deterministic", code: "pt_BR" },
        components: [
          { type: "body", parameters: params.map((t) => ({ type: "text", text: t })) },
          // o payload identifica o alerta no clique (o texto do botão é igual para todos)
          { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: PAYLOAD_ASSUMIR + alertaId }] },
        ],
      },
    }),
  });
  return JSON.stringify(resp).match(/wamid\.[A-Za-z0-9=_-]+/)?.[0] ?? null;
}

async function enviarTexto(sender: any, para: string, texto: string) {
  try {
    await chakraGss(`/v1/ext/plugin/whatsapp/${PLUGIN_GSS}/api/v24.0/${sender.chakra_phone_number_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "text", text: { body: texto } }),
    });
  } catch (e) { console.warn("[sla-alertas] texto", e); }
}

async function config(admin: any, nome: string) {
  const { data } = await admin.from("config_lista_items").select("valor").eq("campo_nome", nome).maybeSingle();
  return String(data?.valor ?? "").trim();
}

async function checarExames(admin: any, forcar = false, unidades = UNIDADES) {
  if (!forcar && (await config(admin, "sla_alertas_ativo")) !== "true") return { pulado: "sla_alertas_ativo desligado" };
  const sender = await remetente(admin);
  const agora = new Date();
  const res: any[] = [];
  const emails: string[] = [];
  for (const unidade of unidades) {
    // Coletor parado = fila velha: o exame pode já ter sido laudado. Não alerta médico com dado velho
    // (a queda já tem o aviso próprio).
    const { data: queda } = await admin.from("sla_coletor_quedas").select("id").eq("unidade", unidade).is("fechada_em", null).maybeSingle();
    if (queda) { res.push({ unidade, pulado: "coletor_parado" }); continue; }

    const { data: exames } = await admin.from("sla_exames")
      .select("id, origem, inicio_em, vence_em")
      .eq("unidade", unidade).is("saiu_em", null).is("ausente_em", null).is("assumido_em", null).is("silenciado_em", null)
      .lte("inicio_em", agora.toISOString());
    if (!exames?.length) { res.push({ unidade, exames: 0 }); continue; }
    const { data: ja } = await admin.from("sla_alertas").select("exame_id, tipo").in("exame_id", exames.map((e: any) => e.id));
    const feito = new Set((ja ?? []).map((a: any) => `${a.exame_id}:${a.tipo}`));
    const { data: escala } = await admin.from("sla_plantao").select("id, papel, nome, telefone, email")
      .eq("unidade", unidade).lte("inicio", agora.toISOString()).gt("fim", agora.toISOString());
    const plantonistas = (escala ?? []).filter((p: any) => p.papel === "plantonista");
    const coordenadores = (escala ?? []).filter((p: any) => p.papel === "coordenador");

    for (const e of exames) {
      const ini = new Date(e.inicio_em).getTime(), fim = new Date(e.vence_em).getTime();
      const prazo = fim - ini, gasto = agora.getTime() - ini;
      const tipo = gasto >= prazo ? "vencido" : gasto >= prazo * 0.8 ? "prazo" : null;
      if (!tipo || feito.has(`${e.id}:${tipo}`)) continue;
      const origem = ORIGEM[e.origem] ?? e.origem, hh = horaExame(e.inicio_em), un = NOME_UNIDADE[unidade] ?? unidade;
      const tempo = tipo === "vencido" ? duracao((agora.getTime() - fim) / 60000) : duracao((fim - agora.getTime()) / 60000);
      const modelo = tipo === "vencido" ? "gss_sla_laudo_vencido_v1" : "gss_sla_laudo_prazo_v1";
      const destinos = tipo === "vencido" ? [...plantonistas, ...coordenadores] : plantonistas;
      const linha = `${origem}, exame das ${hh}: ${tipo === "vencido" ? `vencido há ${tempo}` : `vence em ${tempo}`}`;

      if (!destinos.length) {
        // Sem ninguém na escala neste horário: registra e avisa por e-mail (uma vez por exame e tipo).
        await admin.from("sla_alertas").insert({ exame_id: e.id, tipo, papel: "sem_escala", canal: "email", status: "enviado", destino_nome: "Coordenação (e-mail)" });
        emails.push(`${linha}. Ninguém na escala de plantão agora.`);
        res.push({ exame: e.id, tipo, sem_escala: true });
        continue;
      }
      for (const d of destinos) {
        const { data: al } = await admin.from("sla_alertas").insert({
          exame_id: e.id, tipo, papel: d.papel, plantao_id: d.id, destino_nome: d.nome, destino: d.telefone, canal: "whatsapp",
        }).select("id").single();
        try {
          const wamid = await enviarModelo(sender, d.telefone, modelo, [origem, un, hh, tempo], al.id);
          await admin.from("sla_alertas").update({ status: "enviado", mensagem_id: wamid }).eq("id", al.id);
          res.push({ exame: e.id, tipo, para: d.nome, ok: true });
        } catch (err) {
          const msg = String((err as Error).message || err).slice(0, 300);
          await admin.from("sla_alertas").update({ status: "falhou", erro: msg }).eq("id", al.id);
          emails.push(`${linha}. O WhatsApp para ${d.nome} falhou: ${msg}`);
          res.push({ exame: e.id, tipo, para: d.nome, ok: false, erro: msg });
        }
      }
      if (tipo === "vencido") emails.push(`${linha}. Ninguém assumiu; plantonista e coordenador avisados por WhatsApp.`);
    }
  }
  if (emails.length) {
    await emailar(`SLA de laudos: ${emails.length} aviso(s)`, emails.join("\n") + "\n\nAcompanhe em Sigma › Radiologia › SLA ao vivo.");
  }
  return res;
}

async function assumir(admin: any, telefone: string, payload: string) {
  if (!payload.startsWith(PAYLOAD_ASSUMIR)) return { tratado: false };
  const alertaId = payload.slice(PAYLOAD_ASSUMIR.length);
  const { data: al } = await admin.from("sla_alertas").select("id, exame_id, destino, destino_nome").eq("id", alertaId).maybeSingle();
  // o clique só vale do número para onde o alerta foi
  if (!al || !al.destino || !mesmoNumero(al.destino, telefone)) return { tratado: false };
  const sender = await remetente(admin);
  const agora = new Date().toISOString();
  // O mesmo clique chega mais de uma vez (o número recebe webhook pelas duas contas Chakra; em 12/11 o médico
  // recebeu "Laudo assumido" duas vezes). Só quem marca o alerta como respondido segue e confirma.
  const { data: marcou } = await admin.from("sla_alertas").update({ status: "respondido", respondido_em: agora })
    .eq("id", al.id).is("respondido_em", null).select("id");
  if (!marcou?.length) return { tratado: true, repetido: true, duplicado: true };
  const { data: ex } = await admin.from("sla_exames").select("id, origem, inicio_em, assumido_em, assumido_por").eq("id", al.exame_id).maybeSingle();
  if (!ex) return { tratado: true, exame: null };
  const desc = `${ORIGEM[ex.origem] ?? ex.origem}, exame das ${horaExame(ex.inicio_em)}`;
  if (ex.assumido_em) {
    await enviarTexto(sender, dig(telefone), `Este exame (${desc}) ja tinha sido assumido${ex.assumido_por ? ` por ${ex.assumido_por}` : ""}. Os avisos dele ja estao parados.`);
    return { tratado: true, repetido: true };
  }
  await admin.from("sla_exames").update({ assumido_em: agora, assumido_por: al.destino_nome, assumido_via: "whatsapp" }).eq("id", ex.id).is("assumido_em", null);
  await enviarTexto(sender, dig(telefone), `Laudo assumido: ${desc}. Os avisos deste exame pararam. Obrigado!`);
  return { tratado: true, assumido: true };
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
  if (m === "vpn_desconectada") return "A VPN do hospital (Sophos) caiu: o PACS não alcança o servidor. Alguém precisa reconectar a VPN na estação.";
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
    // Leitura "viva": ok, ou lista vazia com o servidor do PACS respondendo (fila zerada de verdade, ex.: madrugada).
    const { data: ok } = await admin.from("sla_leituras").select("lida_em").eq("unidade", unidade)
      .or("status.eq.ok,detalhe->>motivo.eq.lista_vazia")
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

// Quem chama: o cron (JWT service_role do Vault) e o chakra-webhook (SUPABASE_SERVICE_ROLE_KEY, que não é JWT e o
// gateway recusava com 401 — o clique em "Assumir laudo" falhou assim em 12/11). Por isso verify_jwt = false e a
// checagem é aqui: chave igual à do ambiente, ou JWT service_role confirmado por uma leitura que só ele consegue.
async function autorizado(auth: string) {
  const chave = auth.replace(/^Bearer\s+/i, "").trim();
  if (!chave) return false;
  if (chave === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim()) return true;
  if (!ehServiceRole(auth)) return false;
  const { error } = await createClient(Deno.env.get("SUPABASE_URL")!, chave, { auth: { persistSession: false } })
    .from("integracao_segredos").select("nome").limit(1);
  return !error;
}

Deno.serve(async (req) => {
  if (!(await autorizado(req.headers.get("Authorization") || ""))) return json({ ok: false, error: "sem_permissao" }, 401);
  const body = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    if (body.acao === "exames") return json({ ok: true, exames: await checarExames(admin, !!body.forcar, Array.isArray(body.unidades) ? body.unidades.map(String) : UNIDADES) });
    if (body.acao === "assumir") return json({ ok: true, ...(await assumir(admin, String(body.telefone || ""), String(body.payload || ""))) });
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
