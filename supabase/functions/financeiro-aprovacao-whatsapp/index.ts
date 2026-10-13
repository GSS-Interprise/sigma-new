// Aprovação do pagamento pelo WhatsApp (12/10).
//
// O fechamento já vai para a diretoria aprovar no canal do Sigma (FinanceiroFecharDialog +
// MensagemAcao). Isto acrescenta o WhatsApp: o aprovador recebe um modelo oficial com o resumo,
// um botão que abre o relatório e dois botões de resposta. O clique vale como a aprovação e
// fica registrado no Sigma, que continua sendo a referência.
//
// POST JSON { acao, ... }  (função pública: cada ação confere quem chama)
//   criar_template {}                      financeiro/admin  — envia o modelo para a Meta aprovar
//   enviar         { fechamento_id }       financeiro/admin  — manda o pedido aos aprovadores
//   responder      { telefone, payload }   service role      — chamado pelo chakra-webhook no clique
//   relatorio      { token }               público, pelo token — resumo + link temporário do PDF
//
// Quem aprova: config_lista_items.financeiro_aprovadores_whatsapp = "Nome:5547999990000; Outro:55..."
// Só clique vindo de um desses números, com pedido em aberto, é aceito.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chakraApi, chakraTextMessage, unwrapChakraPayload } from "../_shared/chakra.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const TEMPLATE = "gss_aprovacao_pagamento_v1";
const PAPEIS = ["admin", "gestor_financeiro"];
export const PAYLOAD_APROVAR = "fin_aprovar:";
export const PAYLOAD_NAO = "fin_nao_aprovar:";
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const brl = (n: unknown) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// corpo sem acento: os modelos acentuados desta conta foram recusados pela Meta
const CORPO = "Ola {{1}}, o fechamento de {{2}} esta pronto para aprovacao do pagamento: {{3}} medicos, total de {{4}}. Abra o relatorio pelo botao e responda aqui mesmo.";

// deno-lint-ignore no-explicit-any
type Svc = any;

async function config(svc: Svc) {
  const { data } = await svc.from("config_lista_items").select("campo_nome, valor").in("campo_nome", [
    "financeiro_whatsapp_sender_id", "financeiro_nf_link_base", "financeiro_aprovadores_whatsapp",
    "financeiro_canal_aprovacao_id", "financeiro_canal_comprovantes_id",
  ]);
  const cfg = (n: string) => String(data?.find((c: any) => c.campo_nome === n)?.valor || "").trim();
  const aprovadores = cfg("financeiro_aprovadores_whatsapp").split(/[;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.lastIndexOf(":");
    const nome = i > 0 ? x.slice(0, i).trim() : "";
    let fone = dig(i > 0 ? x.slice(i + 1) : x);
    if (fone.length === 10 || fone.length === 11) fone = "55" + fone;
    return { nome, fone };
  }).filter((a) => a.fone.length >= 12);
  return {
    senderId: cfg("financeiro_whatsapp_sender_id"),
    linkBase: (cfg("financeiro_nf_link_base") || "https://sigma-gss.lovable.app").replace(/\/+$/, ""),
    aprovadores, canalAprovacao: cfg("financeiro_canal_aprovacao_id"), canalComprovantes: cfg("financeiro_canal_comprovantes_id"),
  };
}

async function remetente(svc: Svc, senderId: string) {
  const { data } = await svc.from("whatsapp_official_senders")
    .select("id, phone_e164, status, chakra_plugin_id, chakra_waba_id, chakra_phone_number_id").eq("id", senderId).maybeSingle();
  return data;
}

/** O WhatsApp entrega o número brasileiro com ou sem o nono dígito: compara as duas formas. */
function mesmoNumero(a: string, b: string) {
  const v = (x: string) => {
    const d = dig(x); const s = new Set([d]);
    if (/^55\d{2}[6-9]\d{7}$/.test(d)) s.add(d.slice(0, 4) + "9" + d.slice(4));
    if (/^55\d{2}9[6-9]\d{7}$/.test(d)) s.add(d.slice(0, 4) + d.slice(5));
    return s;
  };
  const va = v(a); return [...v(b)].some((x) => va.has(x));
}

async function postarNoCanal(svc: Svc, canalId: string, autorId: string | null, autorNome: string, mensagem: string, acao: unknown = null) {
  if (!canalId || !autorId) return false;
  const { data: m, error } = await svc.from("comunicacao_mensagens")
    .insert({ canal_id: canalId, user_id: autorId, user_nome: autorNome, mensagem, acao }).select("id").single();
  if (error || !m) return false;
  const { data: parts } = await svc.from("comunicacao_participantes").select("user_id").eq("canal_id", canalId);
  const notifs = (parts ?? []).filter((p: any) => p.user_id !== autorId).map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id }));
  if (notifs.length) await svc.from("comunicacao_notificacoes").insert(notifs);
  return true;
}

async function texto(sender: any, para: string, mensagem: string) {
  try {
    await chakraApi(`/v1/ext/plugin/whatsapp/${sender.chakra_plugin_id}/api/v24.0/${sender.chakra_phone_number_id}/messages`,
      { method: "POST", body: JSON.stringify(chakraTextMessage(para, mensagem)) });
  } catch (e) { console.warn("[aprovacao-whatsapp] falha ao responder:", e); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const input = await req.json().catch(() => ({}));
    const acao = String(input.acao || "");
    const cfg = await config(svc);

    // ── relatório pelo token (o link do botão) ─────────────────────────────
    if (acao === "relatorio") {
      const { data: ped } = await svc.from("financeiro_aprovacao_whatsapp")
        .select("id, status, aprovador_nome, respondido_em, enviado_em, fechamento:fechamento_id(id, mes_referencia, ano_referencia, total, qtd_medicos, status, pdf_path)")
        .eq("token", String(input.token || "")).maybeSingle();
      // link vale 15 dias: depois disso o relatório só pelo Sigma, com login
      if (!ped || Date.now() - new Date(ped.enviado_em).getTime() > 15 * 86400_000) return json({ ok: false, error: "link_invalido" }, 404);
      const f: any = ped.fechamento;
      let pdfUrl: string | null = null;
      if (f?.pdf_path) {
        const { data } = await svc.storage.from("financeiro-anexos").createSignedUrl(f.pdf_path, 600);
        pdfUrl = data?.signedUrl ?? null;
      }
      return json({
        ok: true, aprovador: ped.aprovador_nome, pedido_status: ped.status, respondido_em: ped.respondido_em,
        competencia: `${String(f?.mes_referencia).padStart(2, "0")}/${f?.ano_referencia}`, total: f?.total, qtd_medicos: f?.qtd_medicos,
        fechamento_status: f?.status, pdf_url: pdfUrl,
      });
    }

    // ── quem chama as demais ações ─────────────────────────────────────────
    const auth = req.headers.get("Authorization") || "";
    const chave = auth.replace(/^Bearer\s+/i, "").trim();
    // função pública: o token não chega validado. Service role é a chave exata do projeto, ou
    // uma que o banco aceite numa tabela que só o service role lê.
    let ehServiceRole = !!chave && chave === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!ehServiceRole && chave.split(".").length === 3) {
      const papel = (() => { try { return JSON.parse(atob(chave.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.role; } catch { return null; } })();
      if (papel === "service_role") {
        const { error } = await createClient(supabaseUrl, chave, { auth: { persistSession: false } }).from("integracao_segredos").select("nome").limit(1);
        ehServiceRole = !error;
      }
    }
    let usuario: string | null = null, usuarioNome = "Financeiro";
    if (!ehServiceRole) {
      const u = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await u.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
      if (!user) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      if (!(papeis ?? []).some((p: any) => PAPEIS.includes(p.role))) return json({ ok: false, error: "sem_permissao" }, 403);
      usuario = user.id;
      usuarioNome = (user.user_metadata as any)?.nome_completo || (user.user_metadata as any)?.nome || "Financeiro";
    }

    if (!cfg.senderId) return json({ ok: false, error: "financeiro_whatsapp_sender_id nao configurado" }, 409);
    const sender = await remetente(svc, cfg.senderId);
    if (!sender?.chakra_plugin_id || !sender?.chakra_waba_id || !sender?.chakra_phone_number_id) {
      return json({ ok: false, error: "remetente do financeiro sem plugin/waba" }, 409);
    }

    // ── modelo oficial ─────────────────────────────────────────────────────
    if (acao === "criar_template") {
      const componentes = [
        { type: "BODY", text: CORPO, example: { body_text: [["Dr. Joao", "setembro/2026", "42", "R$ 310.450,00"]] } },
        {
          type: "BUTTONS",
          buttons: [
            { type: "QUICK_REPLY", text: "Aprovar pagamento" },
            { type: "QUICK_REPLY", text: "Nao aprovar" },
            { type: "URL", text: "Ver relatorio", url: `${cfg.linkBase}/aprovacao/{{1}}`, example: [`${cfg.linkBase}/aprovacao/a1b2c3d4e5f6`] },
          ],
        },
      ];
      if (input.dry_run) return json({ ok: true, dry_run: true, nome: TEMPLATE, remetente: sender.phone_e164, componentes });
      const resposta = await chakraApi(`/v1/ext/plugin/whatsapp/api/v24.0/${sender.chakra_waba_id}/message_templates`,
        { method: "POST", body: JSON.stringify({ name: TEMPLATE, category: "UTILITY", language: "pt_BR", components: componentes }) });
      const remoto = unwrapChakraPayload(resposta);
      const remotoId = String(remoto.id || remoto.message_template_id || TEMPLATE);
      const st = String(remoto.status || "PENDING").toLowerCase();
      const { data: gravado, error } = await svc.from("whatsapp_official_templates").upsert({
        provider: "chakra", content_sid: `chakra:${sender.chakra_plugin_id}:${remotoId}`, friendly_name: TEMPLATE, language: "pt_BR",
        category: "UTILITY", body: CORPO, variables: { "1": "Nome do aprovador", "2": "Competencia", "3": "Quantidade de medicos", "4": "Total" },
        approval_status: st === "approved" ? "approved" : st === "rejected" ? "rejected" : "pending", twilio_payload: remoto, updated_at: new Date().toISOString(),
      }, { onConflict: "content_sid" }).select("id, approval_status").single();
      if (error) throw error;
      return json({ ok: true, template: TEMPLATE, id: gravado.id, status: gravado.approval_status });
    }

    // ── enviar o pedido aos aprovadores ────────────────────────────────────
    if (acao === "enviar") {
      const { data: f } = await svc.from("financeiro_fechamentos")
        .select("id, mes_referencia, ano_referencia, total, qtd_medicos, status, pdf_path").eq("id", String(input.fechamento_id || "")).maybeSingle();
      if (!f) return json({ ok: false, error: "fechamento_nao_encontrado" }, 404);
      if (f.status !== "aguardando_aprovacao") return json({ ok: false, error: "fechamento_fora_de_aprovacao", detalhe: `Situação atual: ${f.status}.` }, 409);
      if (!cfg.aprovadores.length) return json({ ok: false, error: "sem_aprovadores", detalhe: "Cadastre financeiro_aprovadores_whatsapp (Nome:55DDDnúmero; ...)." }, 409);
      const { data: tpl } = await svc.from("whatsapp_official_templates").select("id, approval_status").eq("friendly_name", TEMPLATE).eq("provider", "chakra")
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (tpl?.approval_status !== "approved") return json({ ok: false, error: "template_nao_aprovado", detalhe: `Modelo ${TEMPLATE}: ${tpl?.approval_status ?? "não criado"}.` }, 409);

      const meses = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
      const competencia = `${meses[(f.mes_referencia ?? 1) - 1]}/${f.ano_referencia}`;
      // pedido anterior em aberto deste fechamento deixa de valer: só o último conta
      await svc.from("financeiro_aprovacao_whatsapp").update({ status: "substituido" }).eq("fechamento_id", f.id).eq("status", "enviado");
      const resultados = [];
      for (const ap of cfg.aprovadores) {
        const token = crypto.randomUUID().replace(/-/g, "");
        let wamid: string | null = null, erro: string | null = null;
        try {
          const resp = await chakraApi(`/v1/ext/plugin/whatsapp/${sender.chakra_plugin_id}/api/v24.0/${sender.chakra_phone_number_id}/messages`, {
            method: "POST",
            body: JSON.stringify({
              messaging_product: "whatsapp", recipient_type: "individual", to: ap.fone, type: "template",
              template: {
                name: TEMPLATE, language: { policy: "deterministic", code: "pt_BR" },
                components: [
                  { type: "body", parameters: [ap.nome || "Diretoria", competencia, String(f.qtd_medicos ?? 0), brl(f.total)].map((t) => ({ type: "text", text: t })) },
                  // o payload identifica o pedido no clique (o texto do botão é igual para todos)
                  { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: PAYLOAD_APROVAR + token }] },
                  { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: PAYLOAD_NAO + token }] },
                  { type: "button", sub_type: "url", index: "2", parameters: [{ type: "text", text: token }] },
                ],
              },
            }),
          });
          wamid = JSON.stringify(resp).match(/wamid\.[A-Za-z0-9=_-]+/)?.[0] ?? null;
        } catch (e: any) { erro = String(e?.message || e).slice(0, 300); }
        const { data: perfil } = await svc.from("profiles").select("id, telefone").not("telefone", "is", null);
        const aprovadorId = (perfil ?? []).find((p: any) => dig(p.telefone).length >= 10 && mesmoNumero(dig(p.telefone).length <= 11 ? "55" + dig(p.telefone) : dig(p.telefone), ap.fone))?.id ?? null;
        await svc.from("financeiro_aprovacao_whatsapp").insert({
          fechamento_id: f.id, telefone: ap.fone, aprovador_nome: ap.nome || null, aprovador_id: aprovadorId, token,
          wa_message_id: wamid, status: erro ? "erro" : "enviado", erro, created_by: usuario,
        });
        resultados.push({ aprovador: ap.nome, ok: !erro, erro });
      }
      return json({ ok: true, enviados: resultados.filter((r) => r.ok).length, resultados });
    }

    // ── clique do aprovador (chamado pelo chakra-webhook) ──────────────────
    if (acao === "responder") {
      if (!ehServiceRole) return json({ ok: false, error: "sem_permissao" }, 403);
      const payload = String(input.payload || "");
      const aprovou = payload.startsWith(PAYLOAD_APROVAR);
      if (!aprovou && !payload.startsWith(PAYLOAD_NAO)) return json({ ok: true, tratado: false });
      const token = payload.split(":")[1] || "";
      const fone = dig(input.telefone);
      const { data: ped } = await svc.from("financeiro_aprovacao_whatsapp")
        .select("id, status, telefone, aprovador_nome, aprovador_id, fechamento_id, created_by").eq("token", token).maybeSingle();
      // o clique só vale do número para onde o pedido foi enviado
      if (!ped || !mesmoNumero(ped.telefone, fone)) return json({ ok: true, tratado: false });
      const nome = ped.aprovador_nome || "Diretoria";
      if (ped.status !== "enviado") {
        await texto(sender, fone, ped.status === "substituido" ? "Este pedido foi substituido por um mais recente. Responda no ultimo, por favor." : "Este pedido ja foi respondido. Nada foi alterado.");
        return json({ ok: true, tratado: true, repetido: true });
      }
      const { data: f } = await svc.from("financeiro_fechamentos").select("id, mes_referencia, ano_referencia, total, qtd_medicos, status, criado_por").eq("id", ped.fechamento_id).maybeSingle();
      const comp = f ? `${String(f.mes_referencia).padStart(2, "0")}/${f.ano_referencia}` : "";
      const agora = new Date().toISOString();
      const autor = ped.aprovador_id || ped.created_by || f?.criado_por || null;

      if (aprovou) {
        // mesma transição do botão no chat: só aprova o que ainda está aguardando
        const { data: upd } = await svc.from("financeiro_fechamentos")
          .update({ status: "aprovado", aprovado_por: ped.aprovador_id, aprovado_em: agora })
          .eq("id", ped.fechamento_id).eq("status", "aguardando_aprovacao").select("id");
        if (!upd?.length) {
          await svc.from("financeiro_aprovacao_whatsapp").update({ status: "substituido", respondido_em: agora }).eq("id", ped.id);
          await texto(sender, fone, `O fechamento ${comp} ja tinha sido processado no Sigma. Nada foi alterado.`);
          return json({ ok: true, tratado: true, ja_processado: true });
        }
        await svc.from("financeiro_aprovacao_whatsapp").update({ status: "aprovado", respondido_em: agora }).eq("id", ped.id);
        await svc.from("financeiro_aprovacao_whatsapp").update({ status: "substituido" }).eq("fechamento_id", ped.fechamento_id).eq("status", "enviado");
        await postarNoCanal(svc, cfg.canalAprovacao, autor, nome, `✅ *Fechamento ${comp} aprovado pelo WhatsApp* por ${nome} — ${brl(f?.total)}, ${f?.qtd_medicos || 0} médico(s).`);
        await postarNoCanal(svc, cfg.canalComprovantes, autor, nome,
          `✅ *Fechamento ${comp} aprovado* por ${nome} — ${brl(f?.total)}, ${f?.qtd_medicos || 0} médico(s).\nThais, envie os comprovantes aqui neste canal. 👇`,
          { tipo: "enviar_comprovantes", referencia_id: ped.fechamento_id, status: "pendente" });
        await texto(sender, fone, `Aprovado. O pagamento do fechamento ${comp} (${brl(f?.total)}) foi liberado e o financeiro ja foi avisado. Ficou registrado no Sigma.`);
        return json({ ok: true, tratado: true, aprovado: true });
      }

      await svc.from("financeiro_aprovacao_whatsapp").update({ status: "nao_aprovado", respondido_em: agora }).eq("id", ped.id);
      await postarNoCanal(svc, cfg.canalAprovacao, autor, nome, `⚠️ *Fechamento ${comp} NÃO aprovado pelo WhatsApp* por ${nome}. O fechamento continua aguardando: falar com a diretoria antes de reenviar.`);
      await texto(sender, fone, `Registrado: o fechamento ${comp} nao foi aprovado e nenhum pagamento foi liberado. O financeiro foi avisado e vai falar com voce.`);
      return json({ ok: true, tratado: true, aprovado: false });
    }

    return json({ ok: false, error: "acao_desconhecida" }, 400);
  } catch (e: any) {
    console.error("[financeiro-aprovacao-whatsapp]", e);
    return json({ ok: false, error: String(e?.message || e).slice(0, 300) }, 500);
  }
});
