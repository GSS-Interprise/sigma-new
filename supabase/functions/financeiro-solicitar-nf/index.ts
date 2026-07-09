// T06a — solicita a NF ao médico por email (e opcional WhatsApp), com reply-to
// tokenizado pra o inbound (T06b) casar a NF recebida ao pagamento.
// Input: { pagamento_id, canal?: "email"|"whatsapp"|"ambos", email_override? }
//   email_override = simulação (manda pra um email de teste em vez do médico).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmtBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { pagamento_id, canal = "email", email_override } = await req.json().catch(() => ({}));
    if (!pagamento_id) return json({ ok: false, error: "pagamento_id obrigatorio" }, 400);

    const { data: pag, error: pErr } = await supabase
      .from("financeiro_pagamentos")
      .select("id, profissional_nome, profissional_crm, medico_id, mes_referencia, ano_referencia, unidade, setor, total_plantoes, valor_total")
      .eq("id", pagamento_id).maybeSingle();
    if (pErr || !pag) return json({ ok: false, error: "pagamento nao encontrado" }, 404);

    // contato do médico
    let email: string | null = null, telefone: string | null = null;
    if (pag.medico_id) {
      const { data: med } = await supabase.from("medicos").select("email, telefone").eq("id", pag.medico_id).maybeSingle();
      email = med?.email ?? null; telefone = med?.telefone ?? null;
    }
    const destino = email_override || email;

    // config: domínio de recebimento (inbound T06b)
    const { data: cfgRows } = await supabase.from("config_lista_items")
      .select("campo_nome, valor").in("campo_nome", ["financeiro_nf_reply_domain"]);
    const replyDomain = cfgRows?.find((c: any) => c.campo_nome === "financeiro_nf_reply_domain")?.valor || "nf.gestaoservicosaude.com.br";
    const replyTo = `nf+${pag.id}@${replyDomain}`;
    const fromFin = "GSS Saúde Financeiro <financeiro@gestaoservicosaude.com.br>";

    const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const comp = `${String(pag.mes_referencia).padStart(2, "0")}/${pag.ano_referencia}`;
    const compExt = `${MESES[pag.mes_referencia - 1] ?? comp}/${pag.ano_referencia}`;
    const valor = fmtBRL(Number(pag.valor_total));
    const assunto = `Informações para emissão da NFS-e — ${compExt} — [NF-${String(pag.id).slice(0, 8)}]`;
    const localTxt = [pag.unidade, pag.setor].filter(Boolean).join(" · ");
    const html = `
      <!-- preheader (oculto) -->
      <div style="display:none;max-height:0;overflow:hidden;opacity:0">Solicitação de NF-e — produção ${compExt} — ${valor}. Responda anexando o PDF.</div>
      <div style="margin:0;padding:0;background:#eef1f5;font-family:'Segoe UI',Arial,sans-serif">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 12px">
          <tr><td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(27,58,91,.08)">
              <!-- header -->
              <tr><td style="background:#1b3a5b;padding:28px 32px">
                <table role="presentation" width="100%"><tr>
                  <td style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px">GSS <span style="font-weight:400;opacity:.85">Saúde</span></td>
                  <td align="right" style="color:#9fc0e0;font-size:12px;text-transform:uppercase;letter-spacing:1.5px">Departamento Financeiro</td>
                </tr></table>
              </td></tr>
              <!-- faixa -->
              <tr><td style="background:#2563a8;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
              <!-- corpo -->
              <tr><td style="padding:32px">
                <p style="margin:0 0 4px;font-size:16px;color:#1b3a5b">Olá, Dr(a). <b>${pag.profissional_nome}</b>,</p>
                <p style="margin:0 0 20px;font-size:14px;color:#42546a;line-height:1.6">Seguem as informações para emissão da <b>NFS-e</b> referente à sua produção de <b>${compExt}</b>${localTxt ? ` (${localTxt})` : ""}.</p>

                <!-- destaque valor -->
                <table role="presentation" width="100%" style="background:#f2f7fc;border:1px solid #d8e6f4;border-radius:10px;margin:0 0 24px">
                  <tr><td style="padding:18px 22px">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5a7594">Valor da nota</div>
                    <div style="font-size:28px;font-weight:700;color:#1b3a5b;margin-top:2px">${valor}</div>
                    <div style="font-size:12px;color:#5a7594;margin-top:2px">Competência ${compExt}${pag.total_plantoes ? ` · ${pag.total_plantoes} plantões` : ""}</div>
                  </td></tr>
                </table>

                <!-- dados do tomador -->
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8a99ab;margin:0 0 8px">Dados do tomador</div>
                <table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;color:#42546a;margin:0 0 22px">
                  <tr><td style="padding:4px 0;width:130px;color:#8a99ab">Razão Social</td><td style="padding:4px 0"><b>GSS - GESTÃO SERVIÇOS A SAÚDE LTDA</b></td></tr>
                  <tr><td style="padding:4px 0;color:#8a99ab">CNPJ</td><td style="padding:4px 0">18.670.594/0001-03</td></tr>
                  <tr><td style="padding:4px 0;color:#8a99ab;vertical-align:top">Endereço</td><td style="padding:4px 0">Av. Osvaldo Reis, 2470, Andar 2, Sala 10 — Praia Brava, Itajaí/SC — CEP 88.306-600</td></tr>
                </table>

                <!-- descricao -->
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8a99ab;margin:0 0 8px">Descrição da nota</div>
                <p style="margin:0 0 6px;font-size:13px;color:#42546a;line-height:1.6">Prestação de serviços médicos no mês de <b>${compExt}</b>${pag.unidade ? `, no <b>${pag.unidade}</b>` : ""}.${pag.total_plantoes ? ` Qtde. ${pag.total_plantoes} plantões.` : ""} Valor total: <b>${valor}</b>.</p>
                <p style="margin:0 0 22px;font-size:12px;color:#8a99ab;font-style:italic">Ajuste a descrição conforme a especialidade e o local exato de prestação.</p>

                <!-- dados bancarios -->
                <table role="presentation" width="100%" style="background:#fafbfc;border:1px dashed #cfd8e3;border-radius:10px;margin:0 0 22px">
                  <tr><td style="padding:16px 20px">
                    <div style="font-size:13px;font-weight:700;color:#1b3a5b;margin:0 0 8px">Inclua os dados bancários da conta PJ na descrição da nota</div>
                    <div style="font-size:13px;color:#42546a;line-height:1.9">Razão Social · CNPJ · Banco · Agência · Conta · PIX <span style="color:#8a99ab">(mesmos dados da conta PJ)</span></div>
                  </td></tr>
                </table>

                <!-- atencao -->
                <table role="presentation" width="100%" style="background:#fff7ed;border-left:3px solid #e6a23c;border-radius:6px;margin:0 0 24px">
                  <tr><td style="padding:12px 16px;font-size:12px;color:#8a5a15;line-height:1.6"><b>Atenção:</b> o <b>local da prestação de serviços</b> deve ser exatamente onde o serviço foi realizado. Caso contrário, será necessário cancelar a nota e emitir uma nova.</td></tr>
                </table>

                <!-- CTA -->
                <table role="presentation" width="100%" style="background:#1b3a5b;border-radius:10px">
                  <tr><td style="padding:18px 22px;text-align:center">
                    <div style="color:#fff;font-size:15px;font-weight:600">📎 Responda este email anexando a NF em PDF</div>
                    <div style="color:#9fc0e0;font-size:12px;margin-top:4px">O recebimento é automático — não precisa preencher mais nada.</div>
                  </td></tr>
                </table>
              </td></tr>
              <!-- footer -->
              <tr><td style="background:#f6f8fa;padding:18px 32px;border-top:1px solid #e6ebf1">
                <div style="font-size:12px;color:#8a99ab">GSS Saúde · Departamento Financeiro<br>Este é um email automático — em caso de dúvida, responda que retornaremos.</div>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </div>`;

    let emailResult: any = null;
    if ((canal === "email" || canal === "ambos") && destino) {
      const { data: er, error: ee } = await supabase.functions.invoke("send-email-resend", {
        body: { to: destino, subject: assunto, html, reply_to: replyTo, from: fromFin },
      });
      emailResult = ee ? { error: ee.message } : er;
      // log
      await supabase.from("sigma_email_log").insert({
        modulo: "financeiro", referencia_id: pag.id, destinatario_nome: pag.profissional_nome,
        destinatario_email: destino, assunto, status: ee ? "erro" : "enviado",
        erro: ee?.message ?? null, metadata: { tipo: "solicitacao_nf", reply_to: replyTo, simulacao: !!email_override },
      });
    }

    let whatsResult: any = null;
    if ((canal === "whatsapp" || canal === "ambos") && telefone) {
      const { data: wr, error: we } = await supabase.functions.invoke("send-whatsapp", {
        body: { to: telefone, message: `Olá Dr(a). ${pag.profissional_nome}, referente à produção de ${comp}, solicitamos a emissão da NF no valor de ${valor}. Pode responder aqui ou por email com a NF em PDF.` },
      });
      whatsResult = we ? { error: we.message } : wr;
    }

    // marca solicitada (só se algo foi enviado)
    if (emailResult && !emailResult.error || whatsResult && !whatsResult.error) {
      await supabase.from("financeiro_pagamentos")
        .update({ nf_status: "solicitada", nf_solicitada_em: new Date().toISOString() })
        .eq("id", pag.id);
    }

    return json({ ok: true, destino, reply_to: replyTo, email: emailResult, whatsapp: whatsResult, simulacao: !!email_override });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
