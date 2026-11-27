// Lê o texto dos PDFs anexados aos contratos e grava em contrato_texto_trechos, onde a IA dos contratos busca as
// cláusulas (ferramenta contratos_clausulas, _shared/agente/dominios/contratos.ts). PDF com texto: extração direta
// (unpdf). PDF escaneado (só imagem, menos de 200 caracteres): OCR pelo Gemini. Fila: RPC contratos_anexos_para_ler.
// Cron a cada 10 min, 3 por rodada. Só service role (cron) ou admin. { anexo_ids: [...] } relê anexos específicos.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cota diária do plano gratuito é por modelo. O gemini-3.5-flash-lite é da conversas-classificar (27/11 o OCR dos 36
// escaneados esgotou a cota dele e parou a classificação). OCR usa outros modelos, na ordem; 429 passa para o próximo.
const MODELOS_OCR = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-flash-lite-latest"];
const PADRAO = "contratos-documentos";
// Mesma lista de localDoAnexoContrato (ContratoDialogWithClient.tsx): há anexo "uuid/arquivo" em outros buckets.
const BUCKETS = [PADRAO, "licitacoes-anexos", "editais-pdfs", "contrato-rascunho-anexos", "ages-documentos"];
const TAM = 1500;
const MIN_TEXTO = 200;
// Files API aceita até 2 GB; o teto é para o OCR caber no tempo da rodada.
const MAX_BYTES_OCR = 50 * 1024 * 1024;

const PROMPT_OCR = `Transcreva todo o texto deste PDF exatamente como está escrito, em português, sem resumir, corrigir ou comentar.
Antes do texto de cada página escreva uma linha "=== PÁGINA N ===" (N = número da página, a partir de 1).
Tabela: uma linha de texto por linha da tabela, colunas separadas por " | ".
Ignore carimbos, rubricas e assinaturas manuscritas que não tenham texto legível.`;

function local(url: string): { bucket: string; key: string } {
  if (url.startsWith("http")) {
    for (const b of BUCKETS) {
      const m = `/${b}/`;
      const i = url.indexOf(m);
      if (i !== -1) return { bucket: b, key: url.substring(i + m.length).split("?")[0] };
    }
    return { bucket: PADRAO, key: "" };
  }
  for (const b of BUCKETS) if (url.startsWith(`${b}/`)) return { bucket: b, key: url.substring(b.length + 1) };
  return { bucket: /^[0-9a-f-]{36}\//i.test(url) ? "licitacoes-anexos" : PADRAO, key: url };
}

// Trechos de até ~1.500 caracteres, quebrando em parágrafo ou linha que começa título/cláusula. Mesmo corte do
// backfill de 27/11, para os trechos novos ficarem iguais aos antigos.
export function trechos(paginas: string[]): { pagina: number; texto: string }[] {
  const out: { pagina: number; texto: string }[] = [];
  let buf = "";
  let pagIni: number | null = null;
  paginas.forEach((bruto, i) => {
    const txt = bruto.replace(/[ \t]+/g, " ");
    for (let par of txt.split(/\n\s*\n|\n(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][^\n]{0,60}\n)/)) {
      par = par.replace(/\s*\n\s*/g, " ").trim();
      if (!par) continue;
      if (pagIni === null) pagIni = i + 1;
      if (buf && buf.length + par.length + 1 > TAM) { out.push({ pagina: pagIni, texto: buf }); buf = ""; pagIni = i + 1; }
      while (par.length > TAM) { out.push({ pagina: i + 1, texto: par.slice(0, TAM) }); par = par.slice(TAM); }
      buf = (buf + " " + par).trim();
    }
  });
  if (buf) out.push({ pagina: pagIni ?? 1, texto: buf });
  return out;
}

// Resposta do OCR em páginas, pelo marcador "=== PÁGINA N ===". Sem marcador: tudo na página 1.
export function paginasDoOcr(txt: string): string[] {
  const partes = txt.split(/^\s*=+\s*P[ÁA]GINA\s+\d+\s*=+\s*$/im).map((p) => p.trim());
  if (partes.length > 1 && !partes[0]) partes.shift();
  return partes.filter((p, i) => p || i < partes.length - 1);
}

const G = "https://generativelanguage.googleapis.com";
// 429 do Gemini (cota por minuto, a mesma da conversas-classificar): não conta como tentativa, volta na próxima rodada.
class CotaGemini extends Error {}

// PDF escaneado vai pela Files API (upload resumable, corpo binário). Inline em base64 estourava o limite de CPU e
// memória da edge (546) nos PDFs de 5 MB para cima e não aceita arquivo acima de 20 MB.
async function subirPdf(chave: string, pdf: Blob): Promise<{ uri: string; name: string }> {
  const ini = await fetch(`${G}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": chave, "Content-Type": "application/json", "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(pdf.size),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
    },
    body: JSON.stringify({ file: { display_name: "contrato.pdf" } }),
  });
  const destino = ini.headers.get("x-goog-upload-url");
  if (!ini.ok || !destino) throw new Error(`gemini upload ${ini.status}: ${(await ini.text()).slice(0, 160)}`);
  const up = await fetch(destino, {
    method: "POST",
    headers: { "Content-Length": String(pdf.size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: pdf,
  });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j?.file?.uri) throw new Error(`gemini upload ${up.status}: ${JSON.stringify(j).slice(0, 160)}`);
  let f = j.file;
  for (let i = 0; i < 10 && f.state === "PROCESSING"; i++) {
    await espera(2_000);
    f = await (await fetch(`${G}/v1beta/${f.name}`, { headers: { "x-goog-api-key": chave } })).json();
  }
  if (f.state && f.state !== "ACTIVE") throw new Error(`gemini arquivo ${f.state}`);
  return { uri: f.uri, name: f.name };
}

async function ocr(chave: string, pdf: Blob): Promise<string> {
  const arq = await subirPdf(chave, pdf);
  try {
    let ultimo = "";
    let cota = false;
    for (const modelo of MODELOS_OCR) {
    const r = await fetch(`${G}/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ file_data: { mime_type: "application/pdf", file_uri: arq.uri } }, { text: PROMPT_OCR }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 65536 },
      }),
      signal: AbortSignal.timeout(110_000),
    });
    const corpo = await r.json().catch(() => ({}));
    // Em 429 o nome da cota (por minuto, por dia, tokens) vem em details[].violations[].quotaId.
    const cotas = (corpo?.error?.details ?? []).flatMap((d: any) => d?.violations ?? []).map((v: any) => v?.quotaId).filter(Boolean);
    const msg = `gemini ${corpo?.error?.status || r.status}${cotas.length ? ` [${cotas.join(", ")}]` : ""}: ${String(corpo?.error?.message || "").slice(0, 120)}`;
    if (r.status === 429) { ultimo = msg; cota = true; continue; }
    // 503 (pico de demanda) e resposta vazia (finishReason RECITATION/SAFETY em transcrição literal): tenta o próximo.
    if (r.status === 503) { ultimo = msg; continue; }
    if (!r.ok) throw new Error(msg);
    const c = corpo.candidates?.[0];
    const txt = c?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    if (txt.replace(/\s/g, "").length >= MIN_TEXTO) return txt;
    ultimo = `ocr vazio (${modelo}: ${c?.finishReason || corpo?.promptFeedback?.blockReason || "sem motivo"})`;
    }
    if (cota) throw new CotaGemini(ultimo);
    throw new Error(ultimo);
  } finally {
    // Arquivo some sozinho em 48 h; apaga antes para o contrato não ficar guardado no Google.
    await fetch(`${G}/v1beta/${arq.name}`, { method: "DELETE", headers: { "x-goog-api-key": chave } }).catch(() => {});
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(url, serviceKey);

  // Mesmo critério de conversas-classificar: o JWT do cron pode não ser a env (self-hosted).
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let ok = !!auth && auth === serviceKey;
  if (!ok && auth) {
    const { data, error } = await createClient(url, auth, { auth: { persistSession: false } }).from("integracao_segredos").select("nome").limit(1);
    ok = !error && Array.isArray(data);
  }
  if (!ok && auth) {
    const { data: { user } } = await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth);
    if (user) {
      const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      ok = (papeis ?? []).some((p: any) => p.role === "admin");
    }
  }
  if (!ok) return json({ ok: false, error: "sem_permissao" }, 401);

  const chave = Deno.env.get("GEMINI_API_KEY") || "";
  const body = await req.json().catch(() => ({}));
  // Diagnóstico: modelos que a chave aceita (cada modelo tem a sua cota diária no plano gratuito).
  if (body?.modelos === true && chave) {
    const m = await (await fetch(`${G}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": chave } })).json();
    return json({ ok: true, modelos: (m?.models ?? []).filter((x: any) => x.supportedGenerationMethods?.includes("generateContent")).map((x: any) => x.name) });
  }
  const limite = Math.min(Math.max(Number(body?.limite) || 3, 1), 10);
  const ids: string[] = Array.isArray(body?.anexo_ids) ? body.anexo_ids.slice(0, 10) : [];

  let fila: any[] = [];
  if (ids.length) {
    const { data, error } = await svc.from("contrato_anexos").select("id, contrato_id, arquivo_url, arquivo_nome").in("id", ids);
    if (error) return json({ ok: false, error: error.message }, 500);
    fila = data ?? [];
  } else {
    const { data, error } = await svc.rpc("contratos_anexos_para_ler", { p_limite: limite, p_ocr: !!chave });
    if (error) return json({ ok: false, error: error.message }, 500);
    fila = data ?? [];
  }

  const inicio = Date.now();
  const resultado: any[] = [];
  for (const a of fila) {
    // Rodada do cron tem 150 s; OCR leva até ~110 s. Sobrou pouco tempo: o resto fica para a próxima.
    if (Date.now() - inicio > 30_000) break;
    const { data: ant } = await svc.from("contrato_anexo_leitura").select("status, metodo, tentativas").eq("anexo_id", a.id).maybeSingle();
    // Já se sabe que é escaneado: vai direto ao OCR, sem abrir o PDF aqui (pdf.js em escaneado pesado dava 546).
    const diretoOcr = !!chave && (ant?.status === "sem_texto" || ant?.metodo === "ocr");
    const gravar = (campos: Record<string, unknown>) =>
      svc.from("contrato_anexo_leitura").upsert({
        anexo_id: a.id, contrato_id: a.contrato_id, lido_em: new Date().toISOString(),
        paginas: null, caracteres: null, erro: null, metodo: null, ...campos,
      }, { onConflict: "anexo_id" });
    try {
      const { bucket, key: bruto } = local(a.arquivo_url || "");
      // Nomes gravados com %20: o objeto no Storage tem espaço.
      let key = bruto;
      try { key = decodeURIComponent(bruto); } catch { /* nome com % solto: usa como está */ }
      let arq: Blob | null = null;
      for (const b of [bucket, ...BUCKETS.filter((x) => x !== bucket)]) {
        const { data } = await svc.storage.from(b).download(key);
        if (data) { arq = data; break; }
      }
      if (!arq) throw new Error(`arquivo não achado no Storage (${bucket})`);

      let paginas: string[] = [];
      let totalPages: number | null = null;
      let metodo = "ocr";
      if (!diretoOcr) {
        const doc = await getDocumentProxy(new Uint8Array(await arq.arrayBuffer()));
        const ext = await extractText(doc, { mergePages: false });
        totalPages = ext.totalPages;
        paginas = (ext.text as string[]).map((t) => t ?? "");
        metodo = "texto";
      }
      if (paginas.join("").replace(/\s/g, "").length < MIN_TEXTO) {
        if (!chave) { await gravar({ status: "sem_texto", paginas: totalPages, caracteres: 0, metodo: "texto" }); resultado.push({ id: a.id, status: "sem_texto" }); continue; }
        if (arq.size > MAX_BYTES_OCR) throw new Error(`escaneado grande demais para OCR (${Math.round(arq.size / 1048576)} MB)`);
        paginas = paginasDoOcr(await ocr(chave, arq));
        totalPages ??= paginas.length;
        metodo = "ocr";
      }
      const ts = trechos(paginas).map((t) => ({ ...t, texto: t.texto.replace(/\u0000/g, "") }));
      const total = ts.reduce((s, t) => s + t.texto.length, 0);
      const { error: eDel } = await svc.from("contrato_texto_trechos").delete().eq("anexo_id", a.id);
      if (eDel) throw new Error(eDel.message);
      if (total < MIN_TEXTO) {
        await gravar({ status: "sem_texto", paginas: totalPages, caracteres: total, metodo });
        resultado.push({ id: a.id, status: "sem_texto", metodo });
        continue;
      }
      const linhas = ts.map((t, i) => ({ anexo_id: a.id, contrato_id: a.contrato_id, ordem: i, pagina: t.pagina, texto: t.texto }));
      for (let j = 0; j < linhas.length; j += 200) {
        const { error } = await svc.from("contrato_texto_trechos").insert(linhas.slice(j, j + 200));
        if (error) throw new Error(error.message);
      }
      await gravar({ status: "ok", paginas: totalPages, caracteres: total, metodo });
      resultado.push({ id: a.id, status: "ok", metodo, trechos: linhas.length });
    } catch (e) {
      const erro = String((e as Error)?.message || e).slice(0, 300);
      const cota = e instanceof CotaGemini;
      // metodo "ocr" no erro: na volta vai direto ao OCR. Cota estourada não gasta tentativa e encerra a rodada.
      await gravar({ status: "erro", erro, metodo: diretoOcr || cota ? "ocr" : null, tentativas: (ant?.tentativas ?? 0) + (cota ? 0 : 1) });
      resultado.push({ id: a.id, status: "erro", erro });
      if (cota) break;
    }
  }
  return json({ ok: true, lidos: resultado.length, resultado });
});
