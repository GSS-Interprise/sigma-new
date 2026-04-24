import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  lead_id?: string;
  campanha_id?: string;
  campanha_lead_id?: string;
  template_id?: string;
  reply_to?: string;
  tags?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const payload = (await req.json()) as EmailPayload;
    if (!payload.to) throw new Error("campo 'to' obrigatório");
    if (!payload.subject) throw new Error("campo 'subject' obrigatório");
    if (!payload.html && !payload.text) throw new Error("html ou text obrigatório");

    // 1. Busca config Resend
    const { data: config } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["resend_api_key", "resend_from_email", "resend_from_name", "resend_reply_to"]);

    const cfg = Object.fromEntries((config || []).map((c: any) => [c.campo_nome, c.valor]));
    const apiKey = cfg.resend_api_key;
    const fromEmail = cfg.resend_from_email;
    const fromName = cfg.resend_from_name || "GSS Saúde";
    const replyTo = payload.reply_to || cfg.resend_reply_to || fromEmail;

    if (!apiKey || apiKey.trim() === "") {
      return jsonResp({
        ok: false,
        error: "Resend não configurado. Configure 'resend_api_key' em config_lista_items.",
        setup_guide: ".claude/setup-resend.md",
      }, 503);
    }
    if (!fromEmail) {
      return jsonResp({
        ok: false,
        error: "resend_from_email não configurado",
      }, 503);
    }

    // 2. Adiciona footer de opt-out obrigatório (LGPD)
    const optOutFooter = `

---
Você está recebendo este e-mail porque foi identificado como potencial profissional para vagas médicas da GSS Saúde. Se não deseja mais receber nossos contatos, responda esta mensagem com "PARAR" ou entre em contato pelo WhatsApp do remetente.`;

    const textFinal = payload.text ? `${payload.text}\n${optOutFooter}` : undefined;
    const htmlFinal = payload.html
      ? `${payload.html}<hr style="margin-top:32px;border:none;border-top:1px solid #ddd"><p style="color:#888;font-size:12px;line-height:1.5;font-family:sans-serif">Você está recebendo este e-mail porque foi identificado como potencial profissional para vagas médicas da GSS Saúde. Se não deseja mais receber nossos contatos, <a href="mailto:${replyTo}?subject=PARAR">clique aqui</a> ou responda esta mensagem com "PARAR".</p>`
      : undefined;

    // 3. Envia via Resend API
    const resendBody: any = {
      from: `${fromName} <${fromEmail}>`,
      to: [payload.to],
      subject: payload.subject,
      reply_to: replyTo,
    };
    if (htmlFinal) resendBody.html = htmlFinal;
    if (textFinal) resendBody.text = textFinal;

    // Tags pra tracking (Resend aceita)
    if (payload.tags) {
      resendBody.tags = Object.entries(payload.tags).map(([name, value]) => ({ name, value }));
    }

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendBody),
    });

    const resendData = await resendResp.json().catch(() => ({}));

    if (!resendResp.ok) {
      const errMsg = resendData?.message || `HTTP ${resendResp.status}`;
      console.error(`[email] ❌ Resend: ${errMsg}`);

      if (payload.lead_id) {
        await supabase.from("lead_historico").insert({
          lead_id: payload.lead_id,
          tipo_evento: "email_enviado", // TODO: criar tipo email_falhou
          descricao_resumida: `Falha email: ${errMsg.slice(0, 300)}`,
          metadados: {
            to: payload.to,
            subject: payload.subject,
            erro: errMsg,
            campanha_id: payload.campanha_id,
            campanha_lead_id: payload.campanha_lead_id,
          },
        });
      }

      return jsonResp({ ok: false, error: errMsg, resend_status: resendResp.status }, 500);
    }

    const messageId = resendData.id;
    console.log(`[email] ✅ ${payload.to} (id ${messageId})`);

    // 4. Log em lead_historico
    if (payload.lead_id) {
      await supabase.from("lead_historico").insert({
        lead_id: payload.lead_id,
        tipo_evento: "email_enviado",
        descricao_resumida: `Email enviado: ${payload.subject.slice(0, 100)}`,
        metadados: {
          to: payload.to,
          subject: payload.subject,
          resend_id: messageId,
          campanha_id: payload.campanha_id,
          campanha_lead_id: payload.campanha_lead_id,
          template_id: payload.template_id,
        },
      });
    }

    return jsonResp({ ok: true, message_id: messageId, to: payload.to });
  } catch (err: any) {
    console.error("[email] ERRO:", err.message);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
