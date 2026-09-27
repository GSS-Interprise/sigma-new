// Motor do e-mail marketing (27/09). Serve às duas formas: campanha só de e-mail e o
// bloco de e-mail dentro de uma campanha de WhatsApp.
//
// Ações:
//   estimar  { campanha_id }                    → quantos vão receber, e uma amostra
//   teste    { campanha_id, para[], conteudo?, assunto?, remetente_nome? }
//                                              → manda a prévia para endereços da equipe
//   iniciar  { campanha_id }                    → põe o público na fila e começa a enviar
//   pausar / retomar { campanha_id }
//   processar {}                                → cron: envia a próxima leva de cada campanha
//
// O Sigma decide quem recebe; o Resend só entrega (lote de até 100 por chamada) e devolve
// os eventos em email-eventos. Toda mensagem leva o descadastro de um clique exigido por
// Gmail e Yahoo desde 2024.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderEmail, aplicarVariaveis, type EmailConteudo } from "../_shared/email-marketing.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-sync-key",
};
const LOTE_RESEND = 100;          // máximo do endpoint de lote
const LOTES_POR_RODADA = 5;       // 500 e-mails por campanha a cada execução do cron

type Ctx = { svc: any; supabaseUrl: string; appUrl: string; from: string | null; fromTeste: string; replyTo: string | null };

function hojeBrtInicio(): string {
  // começo do dia em Brasília, para o limite diário
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 3)).toISOString();
}

async function contexto(svc: any, supabaseUrl: string): Promise<Ctx> {
  const { data } = await svc.from("config_lista_items").select("campo_nome, valor")
    .in("campo_nome", ["email_marketing_from", "email_marketing_reply_to", "financeiro_nf_link_base"]);
  const cfg = (n: string) => data?.find((c: any) => c.campo_nome === n)?.valor || "";
  return {
    svc, supabaseUrl,
    appUrl: (cfg("financeiro_nf_link_base") || Deno.env.get("APP_URL") || "https://sigma-gss.lovable.app").replace(/\/+$/, ""),
    // Remetente de marketing vem do SUBDOMÍNIO próprio. Sem ele configurado, campanha real
    // não sai: mandar volume pelo domínio principal arrisca a reputação do e-mail do
    // financeiro e dos contratos. Teste pode sair pelo domínio principal.
    from: cfg("email_marketing_from") || null,
    fromTeste: Deno.env.get("RESEND_FROM_EMAIL") || "financeiro@gestaoservicosaude.com.br",
    replyTo: cfg("email_marketing_reply_to") || null,
  };
}

const remetente = (nome: string | null | undefined, email: string) =>
  `${(nome || "GSS Saúde").replace(/[<>"]/g, "")} <${email.replace(/^.*<|>.*$/g, "")}>`;

async function resendLote(emails: unknown[]): Promise<{ ids: (string | null)[]; erro: string | null }> {
  const r = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) return { ids: emails.map(() => null), erro: String(corpo?.message || corpo?.error || `resend_${r.status}`).slice(0, 300) };
  const lista = Array.isArray(corpo?.data) ? corpo.data : [];
  return { ids: emails.map((_, i) => lista[i]?.id ?? null), erro: null };
}

/** Dados que alimentam as variáveis do modelo, por lead. */
async function varsDosLeads(svc: any, leadIds: string[]) {
  if (!leadIds.length) return new Map<string, any>();
  const { data } = await svc.from("leads").select("id, nome, especialidade, cidade, uf").in("id", leadIds);
  return new Map((data ?? []).map((l: any) => [l.id, l]));
}

function montarEmail(ctx: Ctx, c: any, conteudo: EmailConteudo, assunto: string, envio: { email: string; token: string }, vars: any, teste = false) {
  const linkDescadastro = `${ctx.appUrl}/descadastro/${envio.token}`;
  const umClique = `${ctx.supabaseUrl}/functions/v1/email-descadastro?t=${envio.token}`;
  const { html, text } = renderEmail(conteudo, vars ?? {}, linkDescadastro);
  return {
    from: remetente(c.email_remetente_nome || c.nome_remetente, teste ? ctx.fromTeste : ctx.from!),
    to: [envio.email],
    subject: (teste ? "[TESTE] " : "") + aplicarVariaveis(assunto, vars ?? {}),
    html, text,
    ...(ctx.replyTo ? { reply_to: ctx.replyTo } : {}),
    headers: {
      "List-Unsubscribe": `<${umClique}>, <${linkDescadastro}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [{ name: "campanha", value: String(c.id) }, { name: "origem", value: teste ? "teste" : "email_marketing" }],
  };
}

/** Envia a próxima leva de UMA campanha, respeitando o limite diário. */
async function processarCampanha(ctx: Ctx, c: any) {
  const conteudo = (c.email_conteudo ?? {}) as EmailConteudo;
  const assunto = c.assunto_email || "";
  if (!ctx.from || !assunto || !conteudo.mensagem) return { campanha: c.id, enviados: 0, motivo: "configuracao_incompleta" };

  const { count: hoje } = await ctx.svc.from("email_envios").select("id", { count: "exact", head: true })
    .eq("campanha_id", c.id).gte("enviado_em", hojeBrtInicio());
  const restante = Math.max(0, Number(c.email_limite_diario || 500) - (hoje ?? 0));
  if (restante === 0) return { campanha: c.id, enviados: 0, motivo: "limite_diario" };

  const { data: fila } = await ctx.svc.from("email_envios").select("id, lead_id, email, nome, token")
    .eq("campanha_id", c.id).eq("status", "fila").order("created_at")
    .limit(Math.min(restante, LOTE_RESEND * LOTES_POR_RODADA));
  if (!fila?.length) {
    await ctx.svc.from("campanhas").update({ email_status: "concluido", email_concluido_em: new Date().toISOString() }).eq("id", c.id);
    return { campanha: c.id, enviados: 0, motivo: "concluida" };
  }

  // quem saiu depois de entrar na fila não recebe
  const emails = fila.map((f: any) => f.email);
  const { data: saiu } = await ctx.svc.from("email_optout").select("email").in("email", emails);
  const bloqueados = new Set((saiu ?? []).map((o: any) => o.email));
  if (bloqueados.size) {
    await ctx.svc.from("email_envios").update({ status: "bloqueado", erro: "descadastrado antes do envio" })
      .eq("campanha_id", c.id).in("email", [...bloqueados]);
  }
  const envios = fila.filter((f: any) => !bloqueados.has(f.email));
  const vars = await varsDosLeads(ctx.svc, envios.map((f: any) => f.lead_id).filter(Boolean));

  let enviados = 0;
  for (let i = 0; i < envios.length; i += LOTE_RESEND) {
    const lote = envios.slice(i, i + LOTE_RESEND);
    const { ids, erro } = await resendLote(lote.map((f: any) => montarEmail(ctx, c, conteudo, assunto, f, vars.get(f.lead_id) ?? { nome: f.nome })));
    const agora = new Date().toISOString();
    for (let k = 0; k < lote.length; k++) {
      const ok = !!ids[k];
      await ctx.svc.from("email_envios").update(ok
        ? { status: "enviado", resend_id: ids[k], enviado_em: agora, erro: null }
        : { status: "erro", erro: erro ?? "sem_id_do_provedor" }).eq("id", lote[k].id);
      if (ok) enviados++;
    }
    // histórico do lead: "recebeu o e-mail da campanha X" — era o que faltava ver no CRM
    const hist = lote.filter((_: any, k: number) => ids[k] && lote[k].lead_id).map((f: any) => ({
      lead_id: f.lead_id, tipo_evento: "email_enviado",
      descricao_resumida: `E-mail da campanha "${c.nome}": ${aplicarVariaveis(assunto, vars.get(f.lead_id) ?? {})}`.slice(0, 250),
      metadados: { campanha_id: c.id, origem: "email_marketing" },
    }));
    if (hist.length) await ctx.svc.from("lead_historico").insert(hist);
    if (erro) break; // erro do provedor no lote: para e tenta de novo na próxima rodada
  }
  return { campanha: c.id, enviados };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const input = await req.json().catch(() => ({}));
    const acao = String(input.acao || "");

    // quem pode chamar: usuário logado (tela) ou o cron (chave interna / service role)
    const auth = req.headers.get("Authorization") || "";
    const ehCron = req.headers.get("x-internal-sync-key") === (Deno.env.get("TWILIO_INTERNAL_SYNC_KEY") || "§") || (() => {
      const parte = auth.replace(/^Bearer\s+/i, "").split(".")[1];
      try { return !!parte && JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/")))?.role === "service_role"; } catch { return false; }
    })();
    if (!ehCron) {
      const u = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await u.auth.getUser();
      if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    }

    const ctx = await contexto(svc, supabaseUrl);

    if (acao === "processar") {
      if (!ehCron) return json({ ok: false, error: "apenas_cron" }, 403);
      // agendadas cujo horário chegou passam a enviar
      await svc.from("campanhas").update({ email_status: "enviando" })
        .eq("email_status", "agendado").lte("data_agendamento", new Date().toISOString());
      const { data: ativas } = await svc.from("campanhas")
        .select("id, nome, nome_remetente, email_remetente_nome, email_conteudo, assunto_email, email_limite_diario")
        .eq("email_status", "enviando");
      const out = [];
      for (const c of ativas ?? []) out.push(await processarCampanha(ctx, c));
      return json({ ok: true, campanhas: out });
    }

    const campanhaId = String(input.campanha_id || "");
    if (!campanhaId) return json({ ok: false, error: "campanha_id obrigatorio" }, 400);
    const { data: c } = await svc.from("campanhas")
      .select("id, nome, canal, nome_remetente, email_remetente_nome, email_conteudo, assunto_email, email_limite_diario, email_status, data_agendamento")
      .eq("id", campanhaId).maybeSingle();
    if (!c) return json({ ok: false, error: "campanha_nao_encontrada" }, 404);

    if (acao === "estimar") {
      // total pelo banco: o RPC de lista volta no máximo 1000 linhas pela API
      const { data: total, error } = await svc.rpc("email_publico_total", { p_campanha_id: campanhaId });
      if (error) throw error;
      const { data: amostra } = await svc.rpc("email_publico_campanha", { p_campanha_id: campanhaId }).limit(5);
      const { count: optout } = await svc.from("email_optout").select("email", { count: "exact", head: true });
      return json({ ok: true, total: Number(total ?? 0), amostra: amostra ?? [], descadastrados_na_base: optout ?? 0 });
    }

    if (acao === "teste") {
      const para: string[] = (Array.isArray(input.para) ? input.para : [input.para])
        .map((e: string) => String(e || "").trim().toLowerCase()).filter((e: string) => /@.+\./.test(e)).slice(0, 5);
      if (!para.length) return json({ ok: false, error: "informe ao menos um e-mail de teste" }, 400);
      const conteudo = (input.conteudo ?? c.email_conteudo ?? {}) as EmailConteudo;
      const assunto = String(input.assunto ?? c.assunto_email ?? "");
      if (!assunto || !conteudo.mensagem) return json({ ok: false, error: "preencha assunto e mensagem" }, 400);
      const { data: publico } = await svc.rpc("email_publico_campanha", { p_campanha_id: campanhaId }).limit(1);
      const amostraId = (publico ?? [])[0]?.lead_id;
      const amostra = amostraId ? (await varsDosLeads(svc, [amostraId])).get(amostraId) : { nome: "Dra. Marina Souza", especialidade: "Pediatria", cidade: "Itajaí", uf: "SC" };
      const cc = { ...c, email_remetente_nome: input.remetente_nome ?? c.email_remetente_nome };
      const { ids, erro } = await resendLote(para.map((e) =>
        montarEmail(ctx, cc, conteudo, assunto, { email: e, token: "teste" }, amostra, true)));
      return json({ ok: !erro, enviados: ids.filter(Boolean).length, erro, exemplo_com: amostra?.nome ?? null });
    }

    if (acao === "iniciar") {
      if (!ctx.from) {
        return json({ ok: false, error: "remetente_nao_configurado",
          detalhe: "Configure o remetente de marketing (email_marketing_from) com o subdomínio próprio antes do primeiro envio." }, 409);
      }
      const conteudo = (c.email_conteudo ?? {}) as EmailConteudo;
      if (!c.assunto_email || !conteudo.mensagem) return json({ ok: false, error: "preencha assunto e mensagem antes de enviar" }, 400);

      // enfileira no banco: pela API o público viria cortado em 1000
      const { data: novos, error } = await svc.rpc("email_enfileirar_campanha", { p_campanha_id: campanhaId });
      if (error) throw error;
      const { count: naFila } = await svc.from("email_envios").select("id", { count: "exact", head: true })
        .eq("campanha_id", campanhaId).eq("status", "fila");
      const agendada = c.data_agendamento && new Date(c.data_agendamento).getTime() > Date.now();
      await svc.from("campanhas").update({
        email_status: agendada ? "agendado" : "enviando",
        email_iniciado_em: new Date().toISOString(), email_ativo: true,
        ...(c.canal === "email" ? { status: "ativa" } : {}),
      }).eq("id", campanhaId);
      return json({ ok: true, novos: Number(novos ?? 0), na_fila: naFila ?? 0, status: agendada ? "agendado" : "enviando" });
    }

    if (acao === "pausar" || acao === "retomar") {
      await svc.from("campanhas").update({ email_status: acao === "pausar" ? "pausado" : "enviando" }).eq("id", campanhaId);
      return json({ ok: true });
    }

    return json({ ok: false, error: "acao_desconhecida" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
