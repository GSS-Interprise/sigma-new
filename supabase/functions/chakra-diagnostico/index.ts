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

async function post(key: string, path: string, data: unknown) {
  try {
    const r = await fetch(`https://api.chakrahq.com${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
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

  // Chamado no suporte da Chakra pela conta da GSS (22/11/2026: ninguém da Pulse tem login nessa conta).
  // Mesma API do botão "Raise a Ticket" do painel: POST /internal-ticket (criar) e /internal-ticket/list.
  if (input.acao === "chamado_ver" && contas.gss) {
    const id = String(input.id ?? "").replace(/[^a-f0-9-]/gi, "");
    return json({ ok: true, comentarios: await post(contas.gss, `/internal-ticket/${id}/list-comments`, {}),
      chamado: await get(contas.gss, `/internal-ticket/${id}`) });
  }
  if (input.acao === "chamado_responder" && contas.gss) {
    const id = String(input.id ?? "").replace(/[^a-f0-9-]/gi, "");
    const paragrafos = String(input.texto ?? "").split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
    if (!id || !paragrafos.length) return json({ ok: false, error: "id e texto obrigatorios" }, 400);
    // O painel da Chakra grava o comentário no formato do Editor.js (blocos de parágrafo).
    const description = { time: Date.now(), blocks: paragrafos.map((t, i) => ({ id: `p${i}`, type: "paragraph", data: { text: t.replace(/\n/g, "<br>") } })), version: "2.28.2" };
    return json({ ok: true, resposta: await post(contas.gss, `/internal-ticket/${id}/comment`, { id: crypto.randomUUID(), description, attachmentIds: [] }) });
  }
  if (input.acao === "chamados_listar" || input.acao === "chamado_criar") {
    const key = contas.gss;
    if (!key) return json({ ok: false, error: "CHAKRA_API_KEY_GSS ausente" }, 500);
    if (input.acao === "chamados_listar") return json({ ok: true, resposta: await post(key, "/internal-ticket/list", input.filtro ?? {}) });
    const titulo = String(input.titulo ?? "").trim(), descricao = String(input.descricao ?? "").trim();
    if (!titulo || !descricao) return json({ ok: false, error: "titulo e descricao obrigatorios" }, 400);
    return json({ ok: true, resposta: await post(key, "/internal-ticket", { id: crypto.randomUUID(), title: titulo, description: descricao, attachmentIds: [] }) });
  }
  // Config de um plugin WhatsApp da GSS (23/11/2026, chamado #2224: os números migraram para o plugin 49a435de e o
  // eco do celular parou). plugin_atualizar manda só os campos pedidos; a resposta crua volta para conferir.
  if ((input.acao === "plugin_ver" || input.acao === "plugin_atualizar") && contas.gss) {
    const id = String(input.id ?? "").replace(/[^a-f0-9-]/gi, "");
    if (!id) return json({ ok: false, error: "id obrigatorio" }, 400);
    const caminho = `/v1/ext/plugin/whatsapp/${id}/config`;
    if (input.acao === "plugin_ver") return json({ ok: true, config: await get(contas.gss, caminho) });
    if (!input.config || typeof input.config !== "object") return json({ ok: false, error: "config obrigatoria" }, 400);
    const metodo = input.metodo === "PUT" || input.metodo === "PATCH" ? input.metodo : "POST";
    const r = await fetch(`https://api.chakrahq.com${caminho}`, {
      method: metodo, headers: { Authorization: `Bearer ${contas.gss}`, "Content-Type": "application/json" }, body: JSON.stringify(input.config),
    });
    const t = await r.text();
    return json({ ok: r.ok, http: r.status, metodo, resposta: t.slice(0, 3000), depois: await get(contas.gss, caminho) });
  }
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
