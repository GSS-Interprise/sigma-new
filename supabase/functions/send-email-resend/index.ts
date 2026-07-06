import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("RESEND_FROM") ?? "Sigma GSS <onboarding@resend.dev>";

interface Payload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  from?: string; // remetente por chamada (default = env RESEND_FROM). Domínio precisa estar verificado.
  tags?: { name: string; value: string }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurado");

    const body = (await req.json()) as Payload;
    if (!body.to) throw new Error("'to' obrigatório");
    if (!body.subject) throw new Error("'subject' obrigatório");
    if (!body.html && !body.text) throw new Error("'html' ou 'text' obrigatório");

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: body.from ?? FROM,
        to: Array.isArray(body.to) ? body.to : [body.to],
        subject: body.subject,
        html: body.html,
        text: body.text,
        reply_to: body.reply_to,
        tags: body.tags,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[send-email-resend] erro:", resp.status, data);
      return new Response(
        JSON.stringify({ success: false, status: resp.status, error: data }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[send-email-resend]", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});