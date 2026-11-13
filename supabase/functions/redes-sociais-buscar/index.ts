// Fase 9.3: acha o LinkedIn e o Instagram do médico do lead.
// 1) Busca na web pelo Gemini com Google Search (a Unipile não busca pessoa por nome no Instagram).
// 2) Com conta da Unipile conectada (LinkedIn/Instagram), lê o perfil achado e confere nome/CRM/especialidade.
// Grava em leads só com confiança >= 70; abaixo disso guarda o candidato em redes_candidatos para a equipe confirmar.
// Entrada: { lead_id } ou { campanha_id, limite? (padrão 20, máx. 100) }. Só usuário logado ou service_role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { unipile } from "../_shared/unipile.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELOS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
const MINIMO = 70;

type Achado = { url: string | null; handle?: string | null; confianca: number; evidencia: string };

async function buscarNaWeb(lead: any): Promise<{ linkedin: Achado; instagram: Achado }> {
  const quem = [
    `Nome: ${lead.nome}`,
    lead.especialidade ? `Especialidade: ${String(lead.especialidade).replace(/^&/, "").slice(0, 120)}` : "",
    lead.crm ? `CRM: ${lead.crm}${lead.uf ? `/${lead.uf}` : ""}` : "",
    lead.cidade ? `Cidade: ${lead.cidade}${lead.uf ? ` - ${lead.uf}` : ""}` : lead.uf ? `UF: ${lead.uf}` : "",
  ].filter(Boolean).join("\n");
  const prompt = `Você procura os perfis PROFISSIONAIS públicos de um médico brasileiro para uma empresa de escalas médicas.
${quem}

Pesquise no Google o perfil do LinkedIn (linkedin.com/in/...) e o perfil do Instagram dele(a).
Regras:
- Só aceite um perfil se houver evidência de que é a MESMA pessoa: nome compatível E (especialidade, CRM, cidade/UF ou hospital batendo).
- Médico costuma pôr "Dr./Dra.", a especialidade e o CRM na bio do Instagram: isso é evidência forte.
- Homônimo sem outra evidência: confiança baixa (< 50). Não invente URL.
Responda SÓ com JSON, sem texto fora dele:
{"linkedin":{"url":null,"confianca":0,"evidencia":""},"instagram":{"url":null,"handle":null,"confianca":0,"evidencia":""}}
confianca de 0 a 100; evidencia em até 140 caracteres dizendo o que bateu.`;
  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) throw new Error("GEMINI_API_KEY ausente");
  let ultimoErro = "";
  for (const modelo of MODELOS) {
    const r = await fetch(`${GEMINI}/${modelo}:generateContent?key=${chave}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.1 } }),
    });
    if (!r.ok) { ultimoErro = `${modelo} ${r.status} ${(await r.text()).replace(/s+/g, " ").slice(0, 900)}`; if ([404, 429, 500, 503].includes(r.status)) continue; break; }
    const d = await r.json();
    const texto = (d?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    const m = texto.match(/\{[\s\S]*\}/);
    if (!m) { ultimoErro = "sem_json"; continue; }
    const j = JSON.parse(m[0]);
    return { linkedin: normalizar(j.linkedin, "linkedin"), instagram: normalizar(j.instagram, "instagram") };
  }
  throw new Error(`gemini: ${ultimoErro}`);
}

function normalizar(a: any, rede: "linkedin" | "instagram"): Achado {
  let url = typeof a?.url === "string" ? a.url.trim() : null;
  let handle: string | null = null;
  if (rede === "linkedin" && url && !/linkedin\.com\/in\/[^/?#]+/i.test(url)) url = null;
  if (rede === "instagram") {
    const h = (url?.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1] ?? a?.handle ?? "").replace(/^@/, "").trim();
    handle = /^[A-Za-z0-9._]{1,30}$/.test(h) && !["p", "reel", "explore", "accounts"].includes(h.toLowerCase()) ? h : null;
    url = handle ? `https://www.instagram.com/${handle}/` : null;
  }
  const confianca = url ? Math.max(0, Math.min(100, Math.round(Number(a?.confianca) || 0))) : 0;
  return { url, handle, confianca, evidencia: String(a?.evidencia ?? "").slice(0, 200) };
}

// Conferência pela Unipile: lê o perfil com uma conta conectada da rede e sobe/desce a confiança.
async function conferir(admin: any, rede: "linkedin" | "instagram", achado: Achado, lead: any) {
  if (!achado.url) return achado;
  const { data: conta } = await admin.from("linkedin_contas").select("gateway_account_id")
    .eq("provedor", rede).eq("situacao", "conectada").limit(1).maybeSingle();
  if (!conta?.gateway_account_id) return achado;
  const ident = rede === "linkedin" ? achado.url.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] : achado.handle;
  if (!ident) return achado;
  try {
    const p = await unipile(`/accounts/${encodeURIComponent(conta.gateway_account_id)}/users/${encodeURIComponent(ident)}`);
    const texto = JSON.stringify(p).toLowerCase();
    const sobrenome = String(lead.nome || "").trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    const crm = String(lead.crm || "").replace(/\D/g, "");
    let ajuste = 0;
    if (sobrenome.length > 2 && texto.includes(sobrenome)) ajuste += 10; else ajuste -= 25;
    if (crm.length >= 4 && texto.includes(crm)) ajuste += 25;
    return { ...achado, confianca: Math.max(0, Math.min(100, achado.confianca + ajuste)), evidencia: `${achado.evidencia} · conferido na ${rede}` };
  } catch (e: any) {
    // 404 = perfil não existe: o Gemini errou a URL.
    if (e.status === 404) return { ...achado, url: null, handle: null, confianca: 0, evidencia: "perfil não existe" };
    return achado;
  }
}

// service_role por JWT (o cron e os scripts usam o do vault, que não é igual ao env): confere com uma leitura
// que só service_role faz sem erro.
async function ehServiceRole(token: string) {
  if (token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p?.role !== "service_role") return false;
  } catch { return false; }
  const { error } = await createClient(Deno.env.get("SUPABASE_URL")!, token, { auth: { persistSession: false } })
    .from("integracao_segredos").select("nome").limit(1);
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(await ehServiceRole(token))) {
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ ok: false, error: "sem_login" }, 401);
  }
  const body = await req.json().catch(() => ({}));

  let leads: any[] = [];
  const campos = "id,nome,especialidade,crm,uf,cidade,linkedin_url,instagram_handle,redes_buscado_em";
  if (body.lead_id) {
    const { data } = await admin.from("leads").select(campos).eq("id", body.lead_id).maybeSingle();
    if (data) leads = [data];
  } else if (body.campanha_id) {
    // Prioridade: quem respondeu primeiro; pula quem já foi buscado nos últimos 30 dias.
    const limite = Math.min(Number(body.limite) || 20, 100);
    const { data: cls } = await admin.from("campanha_leads").select("lead_id,status").eq("campanha_id", body.campanha_id)
      .in("status", ["quente", "em_conversa", "convertido", "contatado"]).limit(2000);
    const ordem: Record<string, number> = { quente: 0, em_conversa: 1, convertido: 2, contatado: 3 };
    const ids = (cls || []).sort((a: any, b: any) => ordem[a.status] - ordem[b.status]).map((c: any) => c.lead_id);
    const corte = new Date(Date.now() - 30 * 86_400_000).toISOString();
    for (let i = 0; i < ids.length && leads.length < limite; i += 200) {
      const { data } = await admin.from("leads").select(campos).in("id", ids.slice(i, i + 200))
        .or(`redes_buscado_em.is.null,redes_buscado_em.lt.${corte}`);
      const porId = Object.fromEntries((data || []).map((l: any) => [l.id, l]));
      for (const id of ids.slice(i, i + 200)) if (porId[id] && leads.length < limite) leads.push(porId[id]);
    }
  } else return json({ ok: false, error: "informe lead_id ou campanha_id" }, 400);

  const resultados = [];
  for (const lead of leads) {
    try {
      const web = await buscarNaWeb(lead);
      const li = await conferir(admin, "linkedin", web.linkedin, lead);
      const ig = await conferir(admin, "instagram", web.instagram, lead);
      const upd: Record<string, unknown> = { redes_buscado_em: new Date().toISOString(), redes_candidatos: { linkedin: li, instagram: ig } };
      // Não sobrescreve o que a equipe já cadastrou à mão.
      if (li.url && li.confianca >= MINIMO && !lead.linkedin_url) { upd.linkedin_url = li.url; upd.linkedin_confianca = li.confianca; }
      if (ig.handle && ig.confianca >= MINIMO && !lead.instagram_handle) { upd.instagram_handle = ig.handle; upd.instagram_confianca = ig.confianca; }
      await admin.from("leads").update(upd).eq("id", lead.id);
      resultados.push({ lead_id: lead.id, linkedin: li, instagram: ig, gravou: { linkedin: !!upd.linkedin_url, instagram: !!upd.instagram_handle } });
    } catch (e: any) {
      resultados.push({ lead_id: lead.id, erro: e.message });
    }
  }
  return json({ ok: true, buscados: resultados.length, resultados });
});
