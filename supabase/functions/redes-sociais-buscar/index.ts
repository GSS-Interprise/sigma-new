// Fase 9.3: acha o LinkedIn e o Instagram do médico do lead.
// 1) Busca na web: Serper (Google), Brave ou SearXNG da VPS, nessa ordem; o Gemini escolhe entre os resultados
//    (a Unipile não busca pessoa por nome no Instagram; a busca Google do próprio Gemini não tem cota na conta bi@).
// 2) Com conta da Unipile conectada (LinkedIn/Instagram), lê o perfil achado e confere nome/CRM/especialidade.
// Grava em leads só com confiança >= 70; abaixo disso guarda o candidato em redes_candidatos para a equipe confirmar.
// Entrada: { lead_id } ou { campanha_id, limite? (padrão 20, máx. 100) }. Só usuário logado ou service_role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { unipile } from "../_shared/unipile.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GEMINI_CHAT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODELOS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
const MINIMO = 70;

type Achado = { url: string | null; handle?: string | null; confianca: number; evidencia: string };

type Resultado = { url: string; titulo: string; trecho: string };

// Especialidade do CFM vem como "&PEDIATRIA - RQE Nº: 1234 (Áreas de atuação: ...)": fica só o nome.
const espCurta = (e: string | null) => String(e || "").replace(/^&/, "").split(/ - RQE|\(/)[0].trim().toLowerCase();

// Ordem: Serper (Google, 2.500 créditos únicos), Brave (2.000/mês grátis), SearXNG da VPS (grátis, sem limite).
// Cai para o próximo quando um falha ou acaba o crédito.
async function buscar(q: string): Promise<{ fonte: string; resultados: Resultado[] }> {
  const serper = Deno.env.get("SERPER_API_KEY");
  if (serper) {
    try {
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST", headers: { "X-API-KEY": serper, "Content-Type": "application/json" },
        body: JSON.stringify({ q, gl: "br", hl: "pt-br", num: 10 }),
      });
      if (r.ok) {
        const d = await r.json();
        return { fonte: "serper", resultados: (d.organic || []).map((o: any) => ({ url: o.link, titulo: o.title ?? "", trecho: o.snippet ?? "" })) };
      }
      console.warn("[redes] serper", r.status, (await r.text()).slice(0, 200));
    } catch (e: any) { console.warn("[redes] serper", e.message); }
  }
  const brave = Deno.env.get("BRAVE_SEARCH_API_KEY");
  if (brave) {
    try {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?country=BR&search_lang=pt-br&count=10&q=${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json", "X-Subscription-Token": brave },
      });
      if (r.ok) {
        const d = await r.json();
        return { fonte: "brave", resultados: (d.web?.results || []).map((o: any) => ({ url: o.url, titulo: o.title ?? "", trecho: o.description ?? "" })) };
      }
      console.warn("[redes] brave", r.status, (await r.text()).slice(0, 200));
    } catch (e: any) { console.warn("[redes] brave", e.message); }
  }
  const base = Deno.env.get("SEARXNG_URL"), auth = Deno.env.get("SEARXNG_AUTH");
  if (!base || !auth) throw new Error("sem buscador (SERPER_API_KEY e SEARXNG_URL ausentes ou falhando)");
  const r = await fetch(`${base}/search?format=json&language=pt-BR&q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Basic ${btoa(auth)}` },
  });
  if (!r.ok) throw new Error(`searxng ${r.status}`);
  const d = await r.json();
  return { fonte: "searxng", resultados: (d.results || []).slice(0, 12).map((o: any) => ({ url: o.url, titulo: o.title ?? "", trecho: o.content ?? "" })) };
}

async function buscarNaWeb(lead: any): Promise<{ linkedin: Achado; instagram: Achado; fonte: string }> {
  const esp = espCurta(lead.especialidade);
  const lugar = lead.cidade || lead.uf || "";
  const [li, ig] = await Promise.all([
    buscar(`"${lead.nome}" ${esp} site:linkedin.com/in`),
    buscar(`${lead.nome} ${esp} ${lugar} instagram`),
  ]);
  const quem = [
    `Nome: ${lead.nome}`, esp ? `Especialidade: ${esp}` : "",
    lead.crm ? `CRM: ${lead.crm}${lead.uf ? `/${lead.uf}` : ""}` : "",
    lugar ? `Cidade/UF: ${[lead.cidade, lead.uf].filter(Boolean).join(" - ")}` : "",
  ].filter(Boolean).join("\n");
  const lista = (rs: Resultado[]) => rs.map((r, k) => `${k + 1}. ${r.url}\n   ${r.titulo} — ${r.trecho}`.slice(0, 400)).join("\n") || "(nenhum)";
  const prompt = `Você confere perfis PROFISSIONAIS públicos de um médico brasileiro para uma empresa de escalas médicas.
${quem}

Resultados da busca do LinkedIn:
${lista(li.resultados)}

Resultados da busca do Instagram:
${lista(ig.resultados)}

Escolha, entre os resultados, o perfil pessoal do LinkedIn (linkedin.com/in/...) e o perfil do Instagram (instagram.com/<usuario>) DESTE médico.
Regras:
- Só escolha se houver evidência de que é a MESMA pessoa: nome compatível E (especialidade, CRM, cidade/UF ou hospital batendo).
- Bio de médico costuma ter "Dr./Dra.", especialidade e CRM: evidência forte. Perfil de clínica, hospital, grupo ou post de terceiros NÃO serve.
- Homônimo sem outra evidência: confiança < 50. Nunca invente URL fora da lista.
Responda só JSON: {"linkedin":{"url":null,"confianca":0,"evidencia":""},"instagram":{"url":null,"handle":null,"confianca":0,"evidencia":""}}
confianca de 0 a 100; evidencia em até 140 caracteres.`;
  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) throw new Error("GEMINI_API_KEY ausente");
  let ultimoErro = "";
  for (const modelo of MODELOS) {
    // Mesmo caminho da IA das campanhas (endpoint compatível com OpenAI, raciocínio baixo): o nativo com
    // thinkingConfig levava ~1 min por lead e devolvia 503 em horário de pico.
    let r: Response;
    try {
      r = await fetch(GEMINI_CHAT, {
        method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${chave}` },
        signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({ model: modelo, reasoning_effort: "low", temperature: 0.1,
          response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
      });
    } catch (e: any) { ultimoErro = `${modelo} ${e.message}`; continue; }
    if (!r.ok) { ultimoErro = `${modelo} ${r.status}`; if ([404, 429, 500, 503].includes(r.status)) continue; break; }
    const d = await r.json();
    const texto = String(d?.choices?.[0]?.message?.content ?? "");
    const m = texto.match(/\{[\s\S]*\}/);
    if (!m) { ultimoErro = "sem_json"; continue; }
    const j = JSON.parse(m[0]);
    // A URL escolhida tem de estar entre os resultados (o modelo não pode inventar perfil).
    const urls = new Set([...li.resultados, ...ig.resultados].map((x) => x.url.replace(/\/+$/, "").toLowerCase()));
    const naLista = (u: any) => typeof u === "string" && urls.has(u.replace(/\/+$/, "").toLowerCase());
    if (!naLista(j.linkedin?.url)) j.linkedin = { url: null, confianca: 0, evidencia: j.linkedin?.url ? "fora da lista" : "" };
    if (!naLista(j.instagram?.url)) j.instagram = { url: null, handle: null, confianca: 0, evidencia: j.instagram?.url ? "fora da lista" : "" };
    return { linkedin: normalizar(j.linkedin, "linkedin"), instagram: normalizar(j.instagram, "instagram"), fonte: `${li.fonte}+${ig.fonte}` };
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
    // v2: /{account_id}/users/{public_identifier} (doc "LinkedIn fetch users profiles").
    const p = await unipile(`/${encodeURIComponent(conta.gateway_account_id)}/users/${encodeURIComponent(ident)}${rede === "linkedin" ? "?variant=linkedin_classic" : ""}`);
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

  // Cada lead leva ~10-20 s (2 buscas + Gemini + conferência). Três por vez; lote de campanha roda em segundo plano
  // (o limite de uma chamada de edge é 150 s).
  const processar = async (lead: any) => {
    try {
      const web = await buscarNaWeb(lead);
      const li = await conferir(admin, "linkedin", web.linkedin, lead);
      const ig = await conferir(admin, "instagram", web.instagram, lead);
      const upd: Record<string, unknown> = { redes_buscado_em: new Date().toISOString(), redes_candidatos: { fonte: web.fonte, linkedin: li, instagram: ig } };
      // Não sobrescreve o que a equipe já cadastrou à mão.
      if (li.url && li.confianca >= MINIMO && !lead.linkedin_url) { upd.linkedin_url = li.url; upd.linkedin_confianca = li.confianca; }
      if (ig.handle && ig.confianca >= MINIMO && !lead.instagram_handle) { upd.instagram_handle = ig.handle; upd.instagram_confianca = ig.confianca; }
      await admin.from("leads").update(upd).eq("id", lead.id);
      return { lead_id: lead.id, fonte: web.fonte, linkedin: li, instagram: ig, gravou: { linkedin: !!upd.linkedin_url, instagram: !!upd.instagram_handle } };
    } catch (e: any) {
      return { lead_id: lead.id, erro: e.message };
    }
  };
  const todos = async () => {
    const out: any[] = [];
    for (let k = 0; k < leads.length; k += 3) out.push(...await Promise.all(leads.slice(k, k + 3).map(processar)));
    return out;
  };
  if (body.campanha_id && !body.esperar) {
    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    EdgeRuntime.waitUntil(todos().then((r) => console.log("[redes] lote", body.campanha_id, r.length, "leads")));
    return json({ ok: true, em_segundo_plano: true, leads: leads.length });
  }
  const resultados = await todos();
  return json({ ok: true, buscados: resultados.length, resultados });
});
