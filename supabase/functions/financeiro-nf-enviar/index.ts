// Solicitação/cobrança de NF EM LOTE (reunião com a Mavi, 22/09). O ganho está aqui:
// a competência inteira sai num clique, com prévia antes, e cada envio vira registro.
//
// Input: {
//   pagamento_ids: string[], canal?: "email" | "whatsapp",
//   tipo?: "solicitacao" | "lembrete", preview?: boolean,
//   destino_override?: string, teste?: boolean
// }
//
// O e-mail leva um LINK TOKENIZADO de upload (/nf/<token>): o médico anexa a nota sem
// responder e-mail nenhum, então o fluxo não fica esperando o MX do inbound.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chakraApi, digits, unwrapChakraPayload } from "../_shared/chakra.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const fmtBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const SENDERS_ATIVOS = ["approved", "online", "active", "activated", "connected"];

type Pag = {
  id: string; profissional_nome: string; medico_id: string | null;
  mes_referencia: number; ano_referencia: number; unidade: string | null; setor: string | null;
  total_plantoes: number | null; valor_total: number | null;
  nf_lembretes: number | null;
};

function corpoEmail(pag: Pag, compExt: string, valor: string, link: string) {
  const localTxt = [pag.unidade, pag.setor].filter(Boolean).join(" · ");
  return `
  <div style="margin:0;padding:0;background:#eef1f5;font-family:'Segoe UI',Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(27,58,91,.08)">
          <tr><td style="background:#1b3a5b;padding:28px 32px">
            <table role="presentation" width="100%"><tr>
              <td style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px">GSS <span style="font-weight:400;opacity:.85">Saúde</span></td>
              <td align="right" style="color:#9fc0e0;font-size:12px;text-transform:uppercase;letter-spacing:1.5px">Departamento Financeiro</td>
            </tr></table>
          </td></tr>
          <tr><td style="background:#2563a8;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
          <tr><td style="padding:32px">
            <p style="margin:0 0 4px;font-size:16px;color:#1b3a5b">Olá, Dr(a). <b>${pag.profissional_nome}</b>,</p>
            <p style="margin:0 0 20px;font-size:14px;color:#42546a;line-height:1.6">Seguem as informações para emissão da <b>NFS-e</b> referente à sua produção de <b>${compExt}</b>${localTxt ? ` (${localTxt})` : ""}.</p>

            <table role="presentation" width="100%" style="background:#f2f7fc;border:1px solid #d8e6f4;border-radius:10px;margin:0 0 24px">
              <tr><td style="padding:18px 22px">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5a7594">Valor da nota</div>
                <div style="font-size:28px;font-weight:700;color:#1b3a5b;margin-top:2px">${valor}</div>
                <div style="font-size:12px;color:#5a7594;margin-top:2px">Competência ${compExt}${pag.total_plantoes ? ` · ${pag.total_plantoes} plantões` : ""}</div>
              </td></tr>
            </table>

            <table role="presentation" width="100%" style="background:#1b3a5b;border-radius:10px;margin:0 0 24px">
              <tr><td style="padding:20px 22px;text-align:center">
                <div style="color:#fff;font-size:15px;font-weight:600;margin-bottom:12px">Já emitiu a nota? Envie por aqui</div>
                <a href="${link}" style="display:inline-block;background:#ffffff;color:#1b3a5b;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px">Anexar a nota fiscal</a>
                <div style="color:#9fc0e0;font-size:12px;margin-top:10px">Ou responda este e-mail com o PDF anexado.</div>
              </td></tr>
            </table>

            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8a99ab;margin:0 0 8px">Dados do tomador</div>
            <table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;color:#42546a;margin:0 0 22px">
              <tr><td style="padding:4px 0;width:130px;color:#8a99ab">Razão Social</td><td style="padding:4px 0"><b>GSS - GESTÃO SERVIÇOS A SAÚDE LTDA</b></td></tr>
              <tr><td style="padding:4px 0;color:#8a99ab">CNPJ</td><td style="padding:4px 0">18.670.594/0001-03</td></tr>
              <tr><td style="padding:4px 0;color:#8a99ab;vertical-align:top">Endereço</td><td style="padding:4px 0">Av. Osvaldo Reis, 2470, Andar 2, Sala 10 — Praia Brava, Itajaí/SC — CEP 88.306-600</td></tr>
            </table>

            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8a99ab;margin:0 0 8px">Descrição da nota</div>
            <p style="margin:0 0 6px;font-size:13px;color:#42546a;line-height:1.6">Prestação de serviços médicos no mês de <b>${compExt}</b>${pag.unidade ? `, no <b>${pag.unidade}</b>` : ""}.${pag.total_plantoes ? ` Qtde. ${pag.total_plantoes} plantões.` : ""} Valor total: <b>${valor}</b>.</p>
            <p style="margin:0 0 22px;font-size:12px;color:#8a99ab;font-style:italic">Ajuste a descrição conforme a especialidade e o local exato de prestação.</p>

            <table role="presentation" width="100%" style="background:#fafbfc;border:1px dashed #cfd8e3;border-radius:10px;margin:0 0 22px">
              <tr><td style="padding:16px 20px">
                <div style="font-size:13px;font-weight:700;color:#1b3a5b;margin:0 0 8px">Inclua os dados bancários da conta PJ na descrição da nota</div>
                <div style="font-size:13px;color:#42546a;line-height:1.9">Razão Social · CNPJ · Banco · Agência · Conta · PIX</div>
              </td></tr>
            </table>

            <table role="presentation" width="100%" style="background:#fff7ed;border-radius:6px">
              <tr><td style="padding:12px 16px;font-size:12px;color:#8a5a15;line-height:1.6"><b>Atenção:</b> o <b>local da prestação de serviços</b> deve ser exatamente onde o serviço foi realizado. Caso contrário, será necessário cancelar a nota e emitir uma nova.</td></tr>
            </table>
          </td></tr>
          <tr><td style="background:#f6f8fa;padding:18px 32px;border-top:1px solid #e6ebf1">
            <div style="font-size:12px;color:#8a99ab">GSS Saúde · Departamento Financeiro</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceRole);

  try {
    const authorization = req.headers.get("Authorization") || "";
    // aceita a service-role tanto pela chave exata quanto pelo claim do JWT — é como o
    // twilio-whatsapp-send faz; sem isso um cron/edge interna cai em "unauthorized"
    const temClaimServiceRole = (() => {
      const token = authorization.replace(/^Bearer\s+/i, "");
      const parte = token.split(".")[1];
      if (!parte) return false;
      try {
        const payload = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/")));
        return payload?.role === "service_role";
      } catch {
        return false;
      }
    })();
    const ehServiceRole = authorization === `Bearer ${serviceRole}` || temClaimServiceRole;
    let userId: string | null = null;
    if (!ehServiceRole) {
      const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authorization } },
      });
      const { data: { user } } = await auth.auth.getUser();
      if (!user) return json({ ok: false, error: "unauthorized" }, 401);
      userId = user.id;
    }

    const input = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(input.pagamento_ids) ? input.pagamento_ids.filter(Boolean) : [];
    const canal: "email" | "whatsapp" = input.canal === "whatsapp" ? "whatsapp" : "email";
    const tipo: "solicitacao" | "lembrete" = input.tipo === "lembrete" ? "lembrete" : "solicitacao";
    const preview = input.preview === true;
    const destinoOverride = String(input.destino_override || "").trim();
    const teste = input.teste === true || !!destinoOverride;
    if (!ids.length) return json({ ok: false, error: "pagamento_ids obrigatorio" }, 400);
    if (ids.length > 200) return json({ ok: false, error: "lote maximo de 200" }, 400);

    const { data: cfgRows } = await svc.from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", [
        "financeiro_nf_reply_domain", "financeiro_nf_link_base",
        "financeiro_whatsapp_sender_id", "financeiro_nf_whatsapp_template_id",
        "financeiro_nf_whatsapp_template_lembrete_id", "financeiro_nf_whatsapp_botao_url",
      ]);
    const cfg = (nome: string) => cfgRows?.find((c: any) => c.campo_nome === nome)?.valor || "";
    const replyDomain = cfg("financeiro_nf_reply_domain") || "nf.gestaoservicosaude.com.br";
    const linkBase = (cfg("financeiro_nf_link_base") || Deno.env.get("APP_URL") || "https://sigma-gss.lovable.app").replace(/\/+$/, "");
    const fromFin = "GSS Saúde Financeiro <financeiro@gestaoservicosaude.com.br>";
    const comBotaoUrl = cfg("financeiro_nf_whatsapp_botao_url") === "1";

    // WhatsApp: remetente e template vêm de configuração — nada de número no front.
    let sender: any = null, template: any = null;
    if (canal === "whatsapp") {
      const senderId = cfg("financeiro_whatsapp_sender_id");
      // cobrança fora da janela de 24h também precisa de template próprio
      const templateId = tipo === "lembrete"
        ? (cfg("financeiro_nf_whatsapp_template_lembrete_id") || cfg("financeiro_nf_whatsapp_template_id"))
        : cfg("financeiro_nf_whatsapp_template_id");
      if (!senderId || !templateId) {
        return json({
          ok: false, error: "whatsapp_nao_configurado",
          detalhe: "Configure financeiro_whatsapp_sender_id e financeiro_nf_whatsapp_template_id em config_lista_items.",
        }, 409);
      }
      const [s, t] = await Promise.all([
        svc.from("whatsapp_official_senders")
          .select("id, provider, phone_e164, status, chakra_plugin_id, chakra_phone_number_id")
          .eq("id", senderId).maybeSingle(),
        svc.from("whatsapp_official_templates")
          .select("id, friendly_name, language, approval_status, provider, variables")
          .eq("id", templateId).maybeSingle(),
      ]);
      sender = s.data; template = t.data;
      if (!sender || !SENDERS_ATIVOS.includes(String(sender.status).toLowerCase())) {
        return json({ ok: false, error: "whatsapp_sender_indisponivel", detalhe: `Remetente do financeiro não está conectado (status ${sender?.status ?? "inexistente"}).` }, 409);
      }
      if (sender.provider !== "chakra" || !sender.chakra_plugin_id || !sender.chakra_phone_number_id) {
        return json({ ok: false, error: "whatsapp_sender_nao_chakra" }, 409);
      }
      if (!template || template.approval_status !== "approved") {
        return json({ ok: false, error: "whatsapp_template_nao_aprovado" }, 409);
      }
    }

    const { data: pags, error: pErr } = await svc.from("financeiro_pagamentos")
      .select("id, profissional_nome, medico_id, mes_referencia, ano_referencia, unidade, setor, total_plantoes, valor_total, nf_lembretes")
      .in("id", ids);
    if (pErr) throw pErr;

    const medicoIds = [...new Set((pags ?? []).map((p: any) => p.medico_id).filter(Boolean))];
    const { data: medicos } = medicoIds.length
      ? await svc.from("medicos").select("id, email, telefone").in("id", medicoIds)
      : { data: [] as any[] };
    const contato = (id: string | null) => (medicos ?? []).find((m: any) => m.id === id) || null;

    const resultados: any[] = [];
    for (const pag of (pags ?? []) as Pag[]) {
      const comp = `${String(pag.mes_referencia).padStart(2, "0")}/${pag.ano_referencia}`;
      const compExt = `${MESES[pag.mes_referencia - 1] ?? comp}/${pag.ano_referencia}`;
      const valor = fmtBRL(Number(pag.valor_total));
      const med = contato(pag.medico_id);
      const destino = destinoOverride || (canal === "email" ? (med?.email ?? "") : (med?.telefone ?? ""));

      if (!destino) {
        resultados.push({ pagamento_id: pag.id, medico: pag.profissional_nome, status: "sem_contato" });
        continue;
      }

      const token = crypto.randomUUID().replace(/-/g, "") + Math.random().toString(36).slice(2, 8);
      const link = `${linkBase}/nf/${token}`;
      const assunto = tipo === "lembrete"
        ? `Lembrete — nota fiscal de ${compExt} — [NF-${pag.id.slice(0, 8)}]`
        : `Informações para emissão da NFS-e — ${compExt} — [NF-${pag.id.slice(0, 8)}]`;

      if (preview) {
        resultados.push({
          pagamento_id: pag.id, medico: pag.profissional_nome, destino, status: "previa",
          assunto, link,
          texto_whatsapp: `Dr(a). ${pag.profissional_nome}, a GSS precisa da nota fiscal de ${compExt} no valor de ${valor}. Envie por aqui: ${link}`,
        });
        continue;
      }

      let erro: string | null = null;
      let providerMessageId: string | null = null;

      if (canal === "email") {
        const { data: er, error: ee } = await svc.functions.invoke("send-email-resend", {
          body: {
            to: destino, subject: assunto, from: fromFin,
            reply_to: `nf+${pag.id}@${replyDomain}`,
            html: corpoEmail(pag, compExt, valor, link),
          },
        });
        erro = ee?.message ?? (er?.error ? String(er.error) : null);
        providerMessageId = er?.id ?? er?.data?.id ?? null;
        await svc.from("sigma_email_log").insert({
          modulo: "financeiro", referencia_id: pag.id,
          destinatario_nome: pag.profissional_nome, destinatario_email: destino,
          assunto, status: erro ? "erro" : "enviado", erro,
          metadata: { tipo: `nf_${tipo}`, token, teste },
        });
      } else {
        // Primeiro contato iniciado pela empresa = template aprovado, sempre.
        // Com botão de URL dinâmica, o link não vai no corpo: o token entra como
        // sufixo do botão (aprova mais fácil na Meta e o texto fica limpo).
        const variaveis: Record<string, string> = comBotaoUrl
          ? { "1": pag.profissional_nome, "2": compExt, "3": valor }
          : { "1": pag.profissional_nome, "2": compExt, "3": valor, "4": link };
        const posicoes = Object.keys(template.variables || {}).sort((a, b) => Number(a) - Number(b));
        try {
          const resp = await chakraApi(
            `/v1/ext/plugin/whatsapp/${sender.chakra_plugin_id}/api/v24.0/${sender.chakra_phone_number_id}/messages`,
            {
              method: "POST",
              body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: digits(destino.startsWith("+") || digits(destino).startsWith("55") ? destino : `55${destino}`),
                type: "template",
                template: {
                  name: template.friendly_name,
                  language: { policy: "deterministic", code: template.language || "pt_BR" },
                  components: [
                    ...(posicoes.length
                      ? [{ type: "body", parameters: posicoes.map((p) => ({ type: "text", text: variaveis[p] ?? "" })) }]
                      : []),
                    // sufixo do botão de URL: https://…/nf/ + token
                    ...(comBotaoUrl
                      ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: token }] }]
                      : []),
                  ],
                },
              }),
            },
          );
          const r = unwrapChakraPayload(resp);
          providerMessageId = String(r.messages?.[0]?.id || r.messageId || r.id || "") || null;
        } catch (e: any) {
          erro = String(e?.message || e);
        }
      }

      // só marca como solicitada quando o provedor aceitou
      await svc.from("financeiro_nf_solicitacoes").insert({
        pagamento_id: pag.id, tipo, canal, destino, token,
        status: erro ? "erro" : "enviada", erro,
        provider_message_id: providerMessageId, teste, enviado_por: userId,
      });

      if (!erro && !teste) {
        const patch: Record<string, unknown> = { nf_status: "solicitada" };
        if (tipo === "solicitacao") patch.nf_solicitada_em = new Date().toISOString();
        else {
          patch.nf_lembretes = Number(pag.nf_lembretes || 0) + 1;
          patch.nf_ultimo_lembrete_em = new Date().toISOString();
        }
        await svc.from("financeiro_pagamentos").update(patch).eq("id", pag.id);
      }

      resultados.push({
        pagamento_id: pag.id, medico: pag.profissional_nome, destino,
        status: erro ? "erro" : "enviado", erro, link,
      });
    }

    const enviados = resultados.filter((r) => r.status === "enviado").length;
    return json({
      ok: true, canal, tipo, preview, teste,
      enviados, erros: resultados.filter((r) => r.status === "erro").length,
      sem_contato: resultados.filter((r) => r.status === "sem_contato").length,
      resultados,
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
