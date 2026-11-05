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
import { renderEmail, aplicarVariaveis, type EmailConteudo, conteudoPronto } from "../_shared/email-marketing.ts";
import { GmailErro, gmailAccessToken, gmailEnviar, gmailMensagemRaw } from "../_shared/gmail.ts";

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

// Mesmo critério de email_publico_campanha: um endereço fora do padrão faz o Resend recusar o
// LOTE INTEIRO ("Invalid `to` field"). Em 14/10 um "...@gmail.com20240827135433" derrubou 100.
const EMAIL_VALIDO = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

async function resendUm(email: unknown): Promise<{ id: string | null; erro: string | null }> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(email),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) return { id: null, erro: String(corpo?.message || corpo?.error || `resend_${r.status}`).slice(0, 300) };
  return { id: corpo?.id ?? null, erro: null };
}

async function resendLote(emails: unknown[]): Promise<{ ids: (string | null)[]; erro: string | null; erros?: (string | null)[] }> {
  const r = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const erro = String(corpo?.message || corpo?.error || `resend_${r.status}`).slice(0, 300);
    // erro de validação (422): o lote tinha algo que o provedor recusou. Manda um a um para
    // que só o problemático fique de fora. Erro de limite/servidor segue parando a rodada.
    if (r.status !== 422) return { ids: emails.map(() => null), erro };
    const ids: (string | null)[] = [], erros: (string | null)[] = [];
    for (const e of emails) { const u = await resendUm(e); ids.push(u.id); erros.push(u.erro); }
    return { ids, erro: null, erros };
  }
  const lista = Array.isArray(corpo?.data) ? corpo.data : [];
  return { ids: emails.map((_, i) => lista[i]?.id ?? null), erro: null };
}

/** Dados que alimentam as variáveis do modelo, por lead. */
async function varsDosLeads(svc: any, leadIds: string[]) {
  if (!leadIds.length) return new Map<string, any>();
  const { data } = await svc.from("leads").select("id, nome, especialidade, cidade, uf").in("id", leadIds);
  return new Map((data ?? []).map((l: any) => [l.id, l]));
}

// pelaCaixaDaEquipe: o remetente é a conta Gmail (montado em processarGmail), não o de marketing
function montarEmail(ctx: Ctx, c: any, conteudo: EmailConteudo, assunto: string, envio: { email: string; token: string }, vars: any, teste = false, pelaCaixaDaEquipe = false) {
  const linkDescadastro = `${ctx.appUrl}/descadastro/${envio.token}`;
  const umClique = `${ctx.supabaseUrl}/functions/v1/email-descadastro?t=${envio.token}`;
  const { html, text } = renderEmail(conteudo, vars ?? {}, linkDescadastro);
  return {
    from: pelaCaixaDaEquipe ? "" : remetente(c.email_remetente_nome || c.nome_remetente, teste ? ctx.fromTeste : ctx.from!),
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

/** Tira da leva quem se descadastrou depois de entrar na fila e endereço fora do padrão. */
async function filtrarFila(ctx: Ctx, c: any, fila: any[]) {
  const emails = fila.map((f: any) => f.email);
  const { data: saiu } = await ctx.svc.from("email_optout").select("email").in("email", emails);
  const bloqueados = new Set((saiu ?? []).map((o: any) => o.email));
  if (bloqueados.size) {
    await ctx.svc.from("email_envios").update({ status: "bloqueado", erro: "descadastrado antes do envio" })
      .eq("campanha_id", c.id).in("email", [...bloqueados]);
  }
  const invalidos = fila.filter((f: any) => !bloqueados.has(f.email) && !EMAIL_VALIDO.test(String(f.email || "").trim()));
  if (invalidos.length) {
    await ctx.svc.from("email_envios").update({ status: "bloqueado", erro: "endereço de e-mail inválido" })
      .in("id", invalidos.map((f: any) => f.id));
  }
  const invalido = new Set(invalidos.map((f: any) => f.id));
  return fila.filter((f: any) => !bloqueados.has(f.email) && !invalido.has(f.id));
}

// Caixas da equipe: até 25 por conta a cada rodada do cron (2 min) e só em horário comercial,
// para não parecer robô para o Google. 1.800/dia por conta saem em ~2h30 de envio.
const GMAIL_POR_RODADA = 25;
const GMAIL_HORARIO = [8, 20]; // horas de Brasília

function proximaMeiaNoiteBrt() {
  return new Date(new Date(hojeBrtInicio()).getTime() + 24 * 3600 * 1000).toISOString();
}

/** Envia a próxima leva pelas caixas Gmail escolhidas na campanha, dividindo pela cota de cada uma. */
async function processarGmail(ctx: Ctx, c: any) {
  const conteudo = (c.email_conteudo ?? {}) as EmailConteudo;
  const assunto = c.assunto_email || "";
  if (!assunto || !conteudoPronto(conteudo)) return { campanha: c.id, enviados: 0, motivo: "configuracao_incompleta" };
  const horaBrt = new Date(Date.now() - 3 * 3600 * 1000).getUTCHours();
  if (horaBrt < GMAIL_HORARIO[0] || horaBrt >= GMAIL_HORARIO[1]) return { campanha: c.id, enviados: 0, motivo: "fora_do_horario" };

  const ids: string[] = c.email_contas_gmail_ids ?? [];
  if (!ids.length) return { campanha: c.id, enviados: 0, motivo: "sem_contas" };
  const { data: contasBrutas } = await ctx.svc.from("email_contas_gmail")
    .select("id, email, nome, refresh_token, cota_diaria, pausada_ate").in("id", ids).eq("status", "conectada");
  const agora = Date.now();
  const contas: any[] = [];
  for (const conta of contasBrutas ?? []) {
    if (conta.pausada_ate && new Date(conta.pausada_ate).getTime() > agora) continue;
    // a cota é da conta, somando todas as campanhas
    const { count } = await ctx.svc.from("email_envios").select("id", { count: "exact", head: true })
      .eq("conta_gmail_id", conta.id).gte("enviado_em", hojeBrtInicio());
    const vaga = Math.min(GMAIL_POR_RODADA, Math.max(0, conta.cota_diaria - (count ?? 0)));
    if (vaga > 0) contas.push({ ...conta, vaga });
  }
  const capacidade = contas.reduce((s, x) => s + x.vaga, 0);
  if (!capacidade) return { campanha: c.id, enviados: 0, motivo: "cota_das_contas" };

  const { data: fila } = await ctx.svc.from("email_envios").select("id, lead_id, email, nome, token")
    .eq("campanha_id", c.id).eq("status", "fila").order("created_at").limit(capacidade);
  if (!fila?.length) {
    await ctx.svc.from("campanhas").update({ email_status: "concluido", email_concluido_em: new Date().toISOString() }).eq("id", c.id);
    return { campanha: c.id, enviados: 0, motivo: "concluida" };
  }
  const envios = await filtrarFila(ctx, c, fila);
  const vars = await varsDosLeads(ctx.svc, envios.map((f: any) => f.lead_id).filter(Boolean));

  let enviados = 0, i = 0;
  const problemas: string[] = [];
  for (const conta of contas) {
    let token: string;
    try {
      token = await gmailAccessToken(conta.refresh_token);
    } catch (e) {
      const erro = e instanceof GmailErro && e.tipo === "conexao" ? "A conexão com o Gmail caiu. Conecte de novo." : String((e as Error).message);
      await ctx.svc.from("email_contas_gmail").update({ status: e instanceof GmailErro && e.tipo === "conexao" ? "erro" : "conectada", erro, updated_at: new Date().toISOString() }).eq("id", conta.id);
      problemas.push(`${conta.email}: ${erro}`);
      continue;
    }
    for (let k = 0; k < conta.vaga && i < envios.length; k++, i++) {
      const f = envios[i];
      const m = montarEmail(ctx, c, conteudo, assunto, f, vars.get(f.lead_id) ?? { nome: f.nome }, false, true);
      try {
        const gmailId = await gmailEnviar(token, gmailMensagemRaw({
          deNome: conta.nome || c.email_remetente_nome || "GSS Saúde", deEmail: conta.email, para: f.email,
          assunto: m.subject, html: m.html, text: m.text, headers: m.headers,
        }));
        await ctx.svc.from("email_envios").update({
          status: "enviado", enviado_em: new Date().toISOString(), erro: null, conta_gmail_id: conta.id, gmail_message_id: gmailId,
        }).eq("id", f.id);
        if (f.lead_id) {
          await ctx.svc.from("lead_historico").insert({
            lead_id: f.lead_id, tipo_evento: "email_enviado",
            descricao_resumida: `E-mail da campanha "${c.nome}" enviado por ${conta.nome || conta.email}: ${m.subject}`.slice(0, 250),
            metadados: { campanha_id: c.id, origem: "email_gmail", conta_gmail_id: conta.id },
          });
        }
        enviados++;
      } catch (e) {
        const ge = e instanceof GmailErro ? e : new GmailErro("outro", String((e as Error).message));
        if (ge.tipo === "destinatario") {
          await ctx.svc.from("email_envios").update({ status: "erro", erro: ge.message }).eq("id", f.id);
          continue;
        }
        // cota ou conexão: o e-mail volta para a fila e a conta para por hoje (ou até reconectar)
        await ctx.svc.from("email_contas_gmail").update(ge.tipo === "cota"
          ? { pausada_ate: proximaMeiaNoiteBrt(), erro: "O Google avisou que a cota de hoje acabou.", updated_at: new Date().toISOString() }
          : { status: ge.tipo === "conexao" ? "erro" : "conectada", erro: ge.message, updated_at: new Date().toISOString() }).eq("id", conta.id);
        problemas.push(`${conta.email}: ${ge.message}`);
        break; // sem o i++ do laço: o envio atual não saiu e a próxima conta tenta ele

      }
    }
    await ctx.svc.from("email_contas_gmail").update({ ultimo_envio_em: new Date().toISOString() }).eq("id", conta.id);
  }
  return { campanha: c.id, enviados, via: "gmail", ...(problemas.length ? { problemas } : {}) };
}

/** Envia a próxima leva de UMA campanha, respeitando o limite diário. */
async function processarCampanha(ctx: Ctx, c: any) {
  if (c.email_envio_via === "gmail") return processarGmail(ctx, c);
  const conteudo = (c.email_conteudo ?? {}) as EmailConteudo;
  const assunto = c.assunto_email || "";
  if (!ctx.from || !assunto || !conteudoPronto(conteudo)) return { campanha: c.id, enviados: 0, motivo: "configuracao_incompleta" };

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

  const envios = await filtrarFila(ctx, c, fila);
  const vars = await varsDosLeads(ctx.svc, envios.map((f: any) => f.lead_id).filter(Boolean));

  let enviados = 0;
  for (let i = 0; i < envios.length; i += LOTE_RESEND) {
    const lote = envios.slice(i, i + LOTE_RESEND);
    const { ids, erro, erros } = await resendLote(lote.map((f: any) => montarEmail(ctx, c, conteudo, assunto, f, vars.get(f.lead_id) ?? { nome: f.nome })));
    const agora = new Date().toISOString();
    for (let k = 0; k < lote.length; k++) {
      const ok = !!ids[k];
      await ctx.svc.from("email_envios").update(ok
        ? { status: "enviado", resend_id: ids[k], enviado_em: agora, erro: null }
        : { status: "erro", erro: erros?.[k] ?? erro ?? "sem_id_do_provedor" }).eq("id", lote[k].id);
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
        .select("id, nome, nome_remetente, email_remetente_nome, email_conteudo, assunto_email, email_limite_diario, email_envio_via, email_contas_gmail_ids")
        .eq("email_status", "enviando");
      const out = [];
      for (const c of ativas ?? []) out.push(await processarCampanha(ctx, c));
      return json({ ok: true, campanhas: out });
    }

    const campanhaId = String(input.campanha_id || "");
    if (!campanhaId) return json({ ok: false, error: "campanha_id obrigatorio" }, 400);
    const { data: c } = await svc.from("campanhas")
      .select("id, nome, canal, nome_remetente, email_remetente_nome, email_conteudo, assunto_email, email_limite_diario, email_status, data_agendamento, email_envio_via, email_contas_gmail_ids")
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
      if (!assunto || !conteudoPronto(conteudo)) return json({ ok: false, error: "preencha assunto e mensagem" }, 400);
      const { data: publico } = await svc.rpc("email_publico_campanha", { p_campanha_id: campanhaId }).limit(1);
      const amostraId = (publico ?? [])[0]?.lead_id;
      const amostra = amostraId ? (await varsDosLeads(svc, [amostraId])).get(amostraId) : { nome: "Dra. Marina Souza", especialidade: "Pediatria", cidade: "Itajaí", uf: "SC" };
      const cc = { ...c, email_remetente_nome: input.remetente_nome ?? c.email_remetente_nome };
      const { ids, erro } = await resendLote(para.map((e) =>
        montarEmail(ctx, cc, conteudo, assunto, { email: e, token: "teste" }, amostra, true)));
      return json({ ok: !erro, enviados: ids.filter(Boolean).length, erro, exemplo_com: amostra?.nome ?? null });
    }

    if (acao === "iniciar") {
      if (c.email_envio_via === "gmail") {
        const { count } = await svc.from("email_contas_gmail").select("id", { count: "exact", head: true })
          .in("id", c.email_contas_gmail_ids ?? []).eq("status", "conectada");
        if (!count) return json({ ok: false, error: "sem_contas_gmail" }, 409);
      } else if (!ctx.from) {
        return json({ ok: false, error: "remetente_nao_configurado",
          detalhe: "Configure o remetente de marketing (email_marketing_from) com o subdomínio próprio antes do primeiro envio." }, 409);
      }
      const conteudo = (c.email_conteudo ?? {}) as EmailConteudo;
      if (!c.assunto_email || !conteudoPronto(conteudo)) return json({ ok: false, error: "preencha assunto e mensagem antes de enviar" }, 400);

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
