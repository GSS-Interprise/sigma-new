// T07 — envia o comprovante de pagamento (já anexado em financeiro-anexos, tipo=
// comprovante) ao médico e/ou à contabilidade, com o PDF em anexo. Marca
// comprovante_status='enviado'. Input: { pagamento_id, anexo_id?, para?: string[] }
//   para: ["medico"] (default) | ["medico","contabilidade"]
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { pagamento_id, anexo_id, para = ["medico"] } = await req.json().catch(() => ({}));
    if (!pagamento_id) return json({ ok: false, error: "pagamento_id obrigatorio" }, 400);

    const { data: pag } = await supabase.from("financeiro_pagamentos")
      .select("id, profissional_nome, medico_id, mes_referencia, ano_referencia, valor_total").eq("id", pagamento_id).maybeSingle();
    if (!pag) return json({ ok: false, error: "pagamento nao encontrado" }, 404);

    // comprovante: por id, ou o mais recente do pagamento
    let anexoQ = supabase.from("financeiro_anexos").select("id, arquivo_path, arquivo_nome, mime").eq("pagamento_id", pagamento_id).eq("tipo", "comprovante");
    if (anexo_id) anexoQ = anexoQ.eq("id", anexo_id);
    const { data: anexos } = await anexoQ.order("created_at", { ascending: false }).limit(1);
    const anexo = anexos?.[0];
    if (!anexo) return json({ ok: false, error: "nenhum comprovante anexado" }, 404);

    const { data: file, error: dErr } = await supabase.storage.from("financeiro-anexos").download(anexo.arquivo_path);
    if (dErr || !file) return json({ ok: false, error: "falha ao ler comprovante" }, 500);
    const b64 = toBase64(new Uint8Array(await file.arrayBuffer()));

    // destinatários
    const dest: string[] = [];
    if (para.includes("medico") && pag.medico_id) {
      const { data: med } = await supabase.from("medicos").select("email").eq("id", pag.medico_id).maybeSingle();
      if (med?.email) dest.push(med.email);
    }
    if (para.includes("contabilidade")) {
      const { data: cfg } = await supabase.from("config_lista_items").select("valor").eq("campo_nome", "financeiro_contabilidade_email").maybeSingle();
      if (cfg?.valor) dest.push(cfg.valor);
    }
    if (dest.length === 0) return json({ ok: false, error: "sem destinatário (médico sem email / contabilidade não configurada)" }, 400);

    const comp = `${String(pag.mes_referencia).padStart(2, "0")}/${pag.ano_referencia}`;
    const valor = (Number(pag.valor_total) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const { data: er, error: ee } = await supabase.functions.invoke("send-email-resend", {
      body: {
        to: dest,
        from: "GSS Saúde Financeiro <financeiro@gestaoservicosaude.com.br>",
        subject: `Comprovante de pagamento — ${comp} — ${pag.profissional_nome}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1b3a5b;line-height:1.6">
          <p>Olá,</p>
          <p>Segue em anexo o comprovante de pagamento referente à produção de <b>${comp}</b> (<b>${valor}</b>) — Dr(a). <b>${pag.profissional_nome}</b>.</p>
          <p style="color:#5a6b7b;font-size:12px">GSS Saúde · Financeiro</p></div>`,
        attachments: [{ filename: anexo.arquivo_nome || "comprovante.pdf", content: b64 }],
      },
    });
    if (ee) return json({ ok: false, error: ee.message }, 500);

    const enviadoPara = para.join("+");
    await supabase.from("financeiro_pagamentos").update({ comprovante_status: "enviado" }).eq("id", pag.id);
    await supabase.from("financeiro_anexos").update({ status: "enviado", enviado_para: enviadoPara, enviado_em: new Date().toISOString() }).eq("id", anexo.id);
    await supabase.from("sigma_email_log").insert({
      modulo: "financeiro", referencia_id: pag.id, destinatario_nome: pag.profissional_nome,
      destinatario_email: dest.join(", "), assunto: `Comprovante ${comp}`, status: "enviado",
      metadata: { tipo: "comprovante", enviado_para: enviadoPara },
    });

    return json({ ok: true, destinatarios: dest, email_id: (er as any)?.id });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
