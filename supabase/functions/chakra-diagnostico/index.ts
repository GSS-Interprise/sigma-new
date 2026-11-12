// Diagnóstico dos números oficiais (Chakra → Meta), só leitura. Criado em 12/11/2026 para entender
// por que alguns números falham (erro 100/33 "Object does not exist", 141006 preso, webhook sem
// mensagens). Para cada número, nas duas contas Chakra (GSS e Pulse): o que a Chakra lista, o
// número na Graph API (status, nome, qualidade, saúde), a WABA (revisão, pagamento) e os apps
// inscritos no webhook da WABA. Só service_role chama (não tem tela).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 1), { status: s, headers: { "Content-Type": "application/json" } });

function ehServiceRole(auth: string) {
  try {
    const p = JSON.parse(atob(auth.replace(/^Bearer\s+/i, "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p?.role === "service_role";
  } catch {
    return false;
  }
}

async function get(key: string, path: string) {
  try {
    const r = await fetch(`https://api.chakrahq.com${path}`, { headers: { Authorization: `Bearer ${key}` } });
    const t = await r.text();
    let body: unknown = t;
    try { body = JSON.parse(t); } catch { /* texto */ }
    return { http: r.status, body };
  } catch (e) {
    return { http: 0, body: String(e) };
  }
}

Deno.serve(async (req) => {
  if (!ehServiceRole(req.headers.get("Authorization") || "")) return json({ ok: false, error: "service_role_only" }, 403);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const contas = { gss: Deno.env.get("CHAKRA_API_KEY_GSS")?.trim(), pulse: Deno.env.get("CHAKRA_API_KEY")?.trim() };
  const input = await req.json().catch(() => ({}));
  const so = input.phone ? String(input.phone) : null;

  const { data: conns } = await admin.from("whatsapp_chakra_connections")
    .select("phone_e164, phone_number_id, plugin_id, waba_id, status");

  const lista: Record<string, unknown> = {};
  for (const [nome, key] of Object.entries(contas)) {
    if (key) lista[nome] = await get(key, "/v1/ext/whatsapp-phone-number");
  }

  const campos = "id,display_phone_number,verified_name,name_status,new_name_status,quality_rating,status,code_verification_status,platform_type,throughput,messaging_limit_tier,is_official_business_account,health_status";
  const numeros = [];
  for (const c of conns || []) {
    if (so && !c.phone_e164?.includes(so)) continue;
    const r: Record<string, unknown> = { phone: c.phone_e164, phone_number_id: c.phone_number_id, plugin_id: c.plugin_id, waba_id: c.waba_id, status_sigma: c.status };
    for (const [nome, key] of Object.entries(contas)) {
      if (!key) continue;
      const graph = `/v1/ext/plugin/whatsapp/api/v24.0`;
      r[nome] = {
        // Rota da própria Chakra (a mesma do refresh_status): status, qualidade e healthStatus.
        numero: await get(key, `/v1/ext/whatsapp-phone-number/${c.phone_number_id}`),
        // Configuração do plugin: qual conta é dona do plugin e para onde vai o webhook.
        plugin: await get(key, `/v1/ext/plugin/whatsapp/${c.plugin_id}/config`),
        modelos: await get(key, `${graph}/${c.waba_id}/message_templates?limit=3&fields=name,status`),
        webhook: await get(key, `${graph}/${c.waba_id}/subscribed_apps`),
      };
    }
    numeros.push(r);
  }
  return json({ ok: true, lista_chakra: lista, numeros });
});
