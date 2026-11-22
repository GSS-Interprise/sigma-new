// Currículo do médico (ficha do Corpo Clínico; 22/11/2026). Regras em _shared/curriculo.ts.
//   { acao: "importar" }                         (cron, service_role) — currículos que chegaram pelo WhatsApp viram linhas em
//                                                 medico_curriculos ligadas ao lead (conversa ou telefone); depois lê os pendentes.
//   { acao: "ler", id }                          (usuário) — lê de novo um currículo (botão "Ler de novo").
//   { acao: "enviar", lead_id, path, nome, mime } (usuário) — arquivo enviado na ficha (bucket lead-anexos) entra e é lido.
// A IA é o Gemini (GEMINI_API_KEY), com o arquivo em inline_data (PDF e imagem) ou o texto do .docx. Nada é inventado:
// a instrução manda extrair só o que está escrito.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { comoLer, ESQUEMA_CURRICULO, foneDoContato, INSTRUCAO_CURRICULO, normalizarCurriculo, pareceCurriculo, textoDocx } from "../_shared/curriculo.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELOS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
const MAX_BYTES = 15 * 1024 * 1024; // inline_data do Gemini aceita até ~20 MB
const POR_RODADA = 5; // cada leitura leva ~10-20 s; a edge tem teto de tempo

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function lerComIa(url: string, mime: string | null, nome: string | null) {
  const modo = comoLer(mime, nome);
  if (modo === "nao_suportado") return { status: "nao_suportado" as const, erro: "Formato que a IA não lê (ex.: .doc antigo). Peça o PDF." };
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`arquivo ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > MAX_BYTES) return { status: "erro" as const, erro: "Arquivo grande demais para a IA (mais de 15 MB)." };
  let parte: Record<string, unknown>;
  if (modo === "docx") {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return { status: "erro" as const, erro: "Arquivo Word sem texto." };
    parte = { text: textoDocx(xml).slice(0, 60_000) };
  } else {
    parte = { inline_data: { mime_type: (mime || "application/pdf").split(";")[0], data: base64(bytes) } };
  }
  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) throw new Error("GEMINI_API_KEY ausente");
  let erro = "";
  for (const modelo of MODELOS) {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INSTRUCAO_CURRICULO }] },
          contents: [{ role: "user", parts: [parte, { text: "Extraia os dados deste currículo." }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: ESQUEMA_CURRICULO },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const corpo = await resp.json().catch(() => ({}));
      if (!resp.ok) { erro = `${modelo}: ${resp.status} ${JSON.stringify(corpo).slice(0, 200)}`; continue; }
      const txt = (corpo?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text || "").join("");
      const dados = normalizarCurriculo(JSON.parse(txt));
      return { status: "lido" as const, dados, resumo: dados.resumo };
    } catch (e) { erro = `${modelo}: ${(e as Error).message}`; }
  }
  throw new Error(erro || "IA indisponível");
}

async function processar(svc: any, id: string) {
  const { data: c } = await svc.from("medico_curriculos").select("id, arquivo_url, mime, arquivo_nome").eq("id", id).maybeSingle();
  if (!c) return { id, erro: "nao_encontrado" };
  try {
    const r = await lerComIa(c.arquivo_url, c.mime, c.arquivo_nome);
    await svc.from("medico_curriculos").update({
      status: r.status, dados: "dados" in r ? r.dados : null, resumo: "resumo" in r ? r.resumo : null, erro: "erro" in r ? r.erro : null,
      lido_em: new Date().toISOString(),
    }).eq("id", id);
    // Sem lead (contato @lid do WhatsApp): liga pelo nome lido no currículo, se for um só lead com esse nome.
    if (r.status === "lido") await svc.rpc("curriculo_ligar_por_nome", { p_id: id });
    return { id, status: r.status };
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 300);
    // IA sobrecarregada ou fora do ar (429/503/tempo): o currículo fica na fila e a próxima rodada tenta de novo.
    if (/(429|500|502|503|504)|UNAVAILABLE|RESOURCE_EXHAUSTED|timed out|aborted/i.test(msg)) return { id, status: "pendente", erro: msg };
    await svc.from("medico_curriculos").update({ status: "erro", erro: msg, lido_em: new Date().toISOString() }).eq("id", id);
    return { id, status: "erro", erro: msg };
  }
}

/** Currículos do WhatsApp ainda não importados: documento recebido com nome ou legenda de currículo. */
async function importar(svc: any) {
  const { data: docs, error } = await svc.from("sigzap_messages")
    .select("id, conversation_id, media_url, media_filename, media_caption, message_text, media_mime_type, sent_at, conversa:conversation_id(lead_id, contato:contact_id(contact_phone, contact_jid))")
    .eq("from_me", false).eq("message_type", "document").not("media_url", "is", null)
    // Filtro largo no banco (a API devolve no máximo 1000 linhas); o filtro fino é pareceCurriculo.
    .or("media_filename.ilike.%curr%,media_filename.ilike.%cv%,media_filename.ilike.%lattes%,media_filename.ilike.%resum%,message_text.ilike.%curr%,message_text.ilike.%cv%,message_text.ilike.%lattes%,media_caption.ilike.%curr%,media_caption.ilike.%cv%")
    .order("sent_at", { ascending: false }).limit(1000);
  if (error) throw error;
  const candidatos = (docs ?? []).filter((m: any) => pareceCurriculo(m.media_filename || m.message_text, m.media_caption));
  const ids = candidatos.map((m: any) => m.id);
  const { data: ja } = ids.length ? await svc.from("medico_curriculos").select("mensagem_id").in("mensagem_id", ids) : { data: [] };
  const feitos = new Set((ja ?? []).map((x: any) => x.mensagem_id));
  let novos = 0, semLead = 0;
  for (const m of candidatos) {
    if (feitos.has(m.id)) continue;
    let leadId: string | null = m.conversa?.lead_id ?? null;
    if (!leadId) {
      const fone = foneDoContato(m.conversa?.contato?.contact_phone, m.conversa?.contato?.contact_jid);
      if (fone) leadId = ((await svc.rpc("find_lead_by_phone", { p_phone: fone })).data as string | null) || null;
    }
    if (!leadId) semLead++;
    const { error: e } = await svc.from("medico_curriculos").insert({
      lead_id: leadId, origem: "whatsapp", mensagem_id: m.id, arquivo_url: m.media_url,
      arquivo_nome: m.media_filename || m.message_text?.replace(/^\[Documento:\s*|\]$/g, "") || "currículo", mime: m.media_mime_type, recebido_em: m.sent_at,
    });
    if (!e) novos++;
  }
  const { data: pend } = await svc.from("medico_curriculos").select("id").eq("status", "pendente").order("recebido_em", { ascending: false }).limit(POR_RODADA);
  const lidos = [];
  for (const p of pend ?? []) lidos.push(await processar(svc, p.id));
  return { candidatos: candidatos.length, novos, sem_lead: semLead, lidos };
}

function ehServiceRole(auth: string) {
  try { return JSON.parse(atob(auth.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.role === "service_role"; } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const body = await req.json().catch(() => ({}));
  try {
    if (body.acao === "importar") {
      if (!ehServiceRole(auth)) return json({ ok: false, error: "service_role_only" }, 403);
      return json({ ok: true, ...(await importar(svc)) });
    }
    const { data: { user } } = auth ? await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth) : { data: { user: null } };
    if (!user) return json({ ok: false, error: "sem_permissao" }, 401);
    const { data: pode } = await svc.rpc("curriculo_pode_ver", { p_uid: user.id });
    if (!pode) return json({ ok: false, error: "sem_permissao" }, 403);

    if (body.acao === "ler") return json({ ok: true, ...(await processar(svc, String(body.id || ""))) });
    if (body.acao === "enviar") {
      const leadId = String(body.lead_id || ""), path = String(body.path || "");
      if (!leadId || !path.startsWith(`curriculos/${leadId}/`)) return json({ ok: false, error: "arquivo_invalido" }, 400);
      const { data: pub } = svc.storage.from("lead-anexos").getPublicUrl(path);
      const { data: linha, error } = await svc.from("medico_curriculos").insert({
        lead_id: leadId, origem: "upload", arquivo_url: pub.publicUrl, arquivo_nome: String(body.nome || "currículo").slice(0, 200),
        mime: String(body.mime || "") || null, criado_por: user.id,
      }).select("id").single();
      if (error) throw error;
      return json({ ok: true, ...(await processar(svc, linha.id)) });
    }
    return json({ ok: false, error: "acao" }, 400);
  } catch (e) {
    console.error("[medico-curriculo]", e);
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
