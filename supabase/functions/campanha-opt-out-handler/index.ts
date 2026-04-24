import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { phone, msg_text, instance_name } = await req.json();
    if (!phone) throw new Error("phone obrigatório");

    const phoneDigits = String(phone).replace(/\D/g, "");
    const phoneE164 = phoneDigits.startsWith("55") ? `+${phoneDigits}` : `+55${phoneDigits}`;

    console.log(`[opt-out] 🛑 ${phoneE164}: "${(msg_text || "").slice(0, 100)}"`);

    // Tentar achar o lead (nome/cidade) pra usar no blacklist record
    let leadNome = "";
    for (const pv of [phoneE164, `+${phoneDigits}`, phoneDigits]) {
      const { data } = await supabase
        .from("leads")
        .select("id, nome")
        .eq("phone_e164", pv)
        .is("merged_into_id", null)
        .limit(1)
        .maybeSingle();
      if (data) { leadNome = data.nome || ""; break; }
    }

    // INSERT em blacklist — trigger cuida de pausar campanhas e marcar leads.opt_out=true
    const { error: blErr } = await supabase
      .from("blacklist")
      .insert({
        phone_e164: phoneE164,
        nome: leadNome,
        origem: "opt_out_whatsapp",
        reason: `Opt-out LGPD via WhatsApp. Msg: "${(msg_text || "").slice(0, 200)}"`,
      });

    if (blErr) {
      if (blErr.code === "23505") {
        console.log(`[opt-out] ✓ ${phoneE164} já estava na blacklist`);
      } else {
        console.error(`[opt-out] ❌ insert blacklist: ${blErr.message}`);
        throw blErr;
      }
    }

    // Buscar credenciais Evolution pra mandar confirmação única
    const { data: evoConfig } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);

    const evoUrl = evoConfig
      ?.find((c: any) => c.campo_nome === "evolution_api_url")
      ?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;

    // Confirmação obrigatória (LGPD exige reconhecimento do pedido)
    if (evoUrl && evoKey && instance_name) {
      const confirmationMsg =
        "ok, entendido. Não vou mais te chamar por aqui. Se mudar de ideia, é só me avisar. Abraço.";
      try {
        const resp = await fetch(
          `${evoUrl}/message/sendText/${encodeURIComponent(instance_name)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({ number: phoneDigits, text: confirmationMsg }),
          },
        );
        if (resp.ok) {
          console.log(`[opt-out] ✓ confirmação enviada pra ${phoneE164}`);
        } else {
          console.warn(`[opt-out] ⚠️ confirmação falhou: ${resp.status}`);
        }
      } catch (e: any) {
        console.warn(`[opt-out] ⚠️ erro send confirmação: ${e.message}`);
      }
    }

    // Log adicional em lead_historico (trigger do blacklist também loga, mas esse é específico do canal)
    // (trigger já cuida)

    return new Response(
      JSON.stringify({ ok: true, phone_e164: phoneE164, msg: "opt-out processado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[opt-out] ERRO:", err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
