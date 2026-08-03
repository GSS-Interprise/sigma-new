import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("RESEND_FROM") ?? "Sigma GSS <onboarding@resend.dev>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface Payload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  from?: string; // remetente por chamada (default = env RESEND_FROM). Domínio precisa estar verificado.
  attachments?: { filename: string; content?: string; path?: string }[]; // content = base64; path = URL
  tags?: { name: string; value: string }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurado");

    // Mantém a função sem JWT no gateway para chamadas internas, mas não
    // permite que a chave pública seja usada como relay de e-mail anônimo.
    const authorization = req.headers.get("Authorization") || "";
    const isServiceRole = authorization === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    if (!isServiceRole) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const authClient = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authorization } },
      });
      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

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
        attachments: body.attachments,
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
