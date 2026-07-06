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
      .select("id, profissional_nome, profissional_crm, medico_id, mes_referencia, ano_referencia, unidade, valor_total")
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

    const comp = `${String(pag.mes_referencia).padStart(2, "0")}/${pag.ano_referencia}`;
    const valor = fmtBRL(Number(pag.valor_total));
    const assunto = `Emissão de NF — ${comp} — [NF-${String(pag.id).slice(0, 8)}]`;
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#1b3a5b;line-height:1.6">
        <p>Olá, Dr(a). <b>${pag.profissional_nome}</b>,</p>
        <p>Referente à sua produção de <b>${comp}</b>${pag.unidade ? ` na unidade <b>${pag.unidade}</b>` : ""}, solicitamos a emissão da nota fiscal no valor de <b>${valor}</b>.</p>
        <p><b>Como enviar:</b> basta <b>responder este email anexando a NF em PDF</b>. O recebimento é automático.</p>
        <p style="color:#5a6b7b;font-size:12px">GSS Saúde · Financeiro</p>
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
