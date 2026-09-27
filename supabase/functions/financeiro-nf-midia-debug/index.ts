// Diagnóstico temporário: descobre por qual caminho o Chakra entrega o binário da mídia
// recebida no WhatsApp. A URL que vem no webhook (lookaside.fbsbx.com) responde 401 —
// exige o token da Meta, que o provedor não expõe. Este endpoint tenta as variações do
// proxy e devolve status e content-type de cada uma, para acertar de primeira no inbound.
//
// Input: { media_id, phone_number_id? }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const key = Deno.env.get("CHAKRA_API_KEY")?.trim() || "";

  try {
    const { media_id } = await req.json().catch(() => ({}));
    if (!media_id) return json({ ok: false, error: "media_id obrigatorio" }, 400);

    const { data: cfg } = await svc.from("config_lista_items")
      .select("valor").eq("campo_nome", "financeiro_whatsapp_sender_id").maybeSingle();
    const { data: sender } = await svc.from("whatsapp_official_senders")
      .select("chakra_plugin_id, chakra_phone_number_id, chakra_waba_id").eq("id", cfg?.valor).maybeSingle();
    const plugin = String(sender?.chakra_plugin_id || "");
    const pnid = String(sender?.chakra_phone_number_id || "");
    const waba = String(sender?.chakra_waba_id || "");

    const { data: ev } = await svc.from("whatsapp_chakra_webhook_events")
      .select("payload").ilike("payload", `%${media_id}%`).limit(1).maybeSingle();
    const urlWebhook = String(
      (ev?.payload as any)?.messages?.[0]?.document?.url ||
      (ev?.payload as any)?.messages?.[0]?.image?.url || "",
    );
    const enc = encodeURIComponent(urlWebhook);

    const caminhos = [
      `/v1/ext/plugin/whatsapp/${plugin}/media?url=${enc}`,
      `/v1/ext/plugin/whatsapp/${plugin}/api/v24.0/media?url=${enc}`,
      `/v1/ext/plugin/whatsapp/${plugin}/download?url=${enc}`,
      `/v1/ext/plugin/whatsapp/media/${media_id}`,
      `/v1/ext/plugin/whatsapp/${plugin}/messages/media/${media_id}`,
      `/v1/media/${media_id}`,
      `/v1/ext/plugin/whatsapp/${plugin}/api/v24.0/${pnid}/media`,
      `/v1/ext/plugin/whatsapp/api/v24.0/${media_id}`,
      `/v1/ext/plugin/whatsapp/${plugin}/api/v24.0/${media_id}?phone_number_id=${pnid}`,
      `/v1/ext/plugin/whatsapp/api/v24.0/${media_id}?phone_number_id=${pnid}`,
      `/v1/ext/plugin/whatsapp/${plugin}/api/v24.0/${pnid}/media/${media_id}`,
      `/v1/ext/plugin/whatsapp/${plugin}/media/${media_id}`,
      `/v1/ext/plugin/whatsapp/${plugin}/api/v24.0/media/${media_id}`,
      `/v1/ext/plugin/whatsapp/${waba}/api/v24.0/${media_id}`,
      `/v1/ext/plugin/whatsapp/${plugin}/api/v24.0/${media_id}/download`,
      `/v1/ext/plugin/whatsapp/${plugin}/api/media/${media_id}`,
    ];

    const resultados: any[] = [];
    for (const caminho of caminhos) {
      try {
        const r = await fetch(`https://api.chakrahq.com${caminho}`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        const tipo = r.headers.get("content-type") || "";
        const amostra = tipo.includes("json") || tipo.includes("text")
          ? (await r.text()).slice(0, 200)
          : `[binário ${r.headers.get("content-length") || "?"} bytes]`;
        resultados.push({ caminho, status: r.status, tipo, amostra });
      } catch (e: any) {
        resultados.push({ caminho, erro: String(e?.message || e).slice(0, 120) });
      }
    }

    return json({ ok: true, plugin, phone_number_id: pnid, waba, resultados });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
