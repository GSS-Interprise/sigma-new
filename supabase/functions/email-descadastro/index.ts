// Descadastro do e-mail marketing. Pública (--no-verify-jwt): quem chama é o médico, pelo
// link do rodapé, ou o próprio Gmail/Yahoo pelo botão "cancelar inscrição" (POST de um
// clique, cabeçalho List-Unsubscribe-Post — exigência deles desde 2024).
//
// GET  ?t=token   → dados para a página de confirmação (/descadastro/<token>)
// POST ?t=token   → registra a saída. Vale para TODA campanha de e-mail daquele endereço.
//
// Só tira do e-mail: WhatsApp e demais canais seguem as regras próprias de opt-out.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const mascarar = (email: string) => {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    let token = new URL(req.url).searchParams.get("t") || "";
    if (!token && req.method === "POST") {
      const corpo = await req.json().catch(() => ({}));
      token = String(corpo?.t || "");
    }
    if (!token) return json({ ok: false, error: "token_ausente" }, 400);
    if (token === "teste") return json({ ok: true, teste: true, email: "e-mail de teste", descadastrado: req.method === "POST" });

    const { data: envio } = await svc.from("email_envios")
      .select("id, email, lead_id, campanha_id").eq("token", token).maybeSingle();
    if (!envio) return json({ ok: false, error: "link_invalido" }, 404);

    const { data: ja } = await svc.from("email_optout").select("email").eq("email", envio.email).maybeSingle();

    if (req.method === "GET") return json({ ok: true, email: mascarar(envio.email), descadastrado: !!ja });

    if (!ja) {
      await svc.from("email_optout").insert({ email: envio.email, motivo: "descadastro", campanha_id: envio.campanha_id });
      if (envio.lead_id) {
        await svc.from("lead_historico").insert({
          lead_id: envio.lead_id, tipo_evento: "opt_out_lgpd",
          descricao_resumida: "Pediu para não receber mais e-mails de marketing",
          metadados: { canal: "email", campanha_id: envio.campanha_id },
        });
      }
    }
    await svc.from("email_envios").update({ status: "descadastrado" }).eq("id", envio.id);
    // quem ainda estava na fila de outras campanhas sai também
    await svc.from("email_envios").update({ status: "bloqueado", erro: "descadastrado" })
      .eq("email", envio.email).eq("status", "fila");

    return json({ ok: true, email: mascarar(envio.email), descadastrado: true });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
