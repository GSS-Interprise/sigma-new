// Ponte para a API da Zenvia (25/11/2026), só com a chave de serviço. Usos:
//   { acao: "get", caminho: "/v2/..." }            — leitura (para descobrir envios/lotes e relatórios)
//   { acao: "reativar_webhooks" }                   — volta as assinaturas (webhooks) degradadas para ACTIVE
// O token fica no secret ZENVIA_API_TOKEN e nunca sai daqui.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "https://api.zenvia.com";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function servico(auth: string) {
  const chave = auth.replace(/^Bearer\s+/i, "").trim();
  if (!chave) return false;
  if (chave === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim()) return true;
  try {
    if (JSON.parse(atob(chave.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.role !== "service_role") return false;
  } catch { return false; }
  const { error } = await createClient(Deno.env.get("SUPABASE_URL")!, chave).from("integracao_segredos").select("nome").limit(1);
  return !error;
}

async function zenvia(caminho: string, init: RequestInit = {}) {
  const r = await fetch(API + caminho, {
    ...init,
    headers: { "X-API-TOKEN": Deno.env.get("ZENVIA_API_TOKEN") || "", "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const texto = await r.text();
  let corpo: unknown = texto;
  try { corpo = JSON.parse(texto); } catch { /* texto */ }
  return { status: r.status, corpo };
}

Deno.serve(async (req) => {
  if (!(await servico(req.headers.get("Authorization") || ""))) return json({ ok: false, error: "sem_permissao" }, 401);
  const b = await req.json().catch(() => ({}));
  if (b.acao === "get") {
    const caminho = String(b.caminho || "");
    if (!/^\/v2\/[A-Za-z0-9/_?=&.:-]+$/.test(caminho)) return json({ ok: false, error: "caminho_invalido" }, 400);
    return json({ ok: true, ...(await zenvia(caminho)) });
  }
  if (b.acao === "reativar_webhooks") {
    const lista = await zenvia("/v2/subscriptions");
    const subs = Array.isArray(lista.corpo) ? lista.corpo as Array<Record<string, unknown>> : [];
    const out = [];
    for (const s of subs) {
      const r = await zenvia(`/v2/subscriptions/${s.id}`, { method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }) });
      out.push({ id: s.id, tipo: (s.criteria as Record<string, unknown>)?.channel ?? null, antes: s.status, status_http: r.status, depois: (r.corpo as Record<string, unknown>)?.status ?? r.corpo });
    }
    return json({ ok: true, listagem_http: lista.status, assinaturas: out });
  }
  return json({ ok: false, error: "acao" }, 400);
});
