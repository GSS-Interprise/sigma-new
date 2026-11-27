// Lê o texto dos PDFs anexados aos contratos e grava em contrato_texto_trechos, onde a IA dos contratos busca as
// cláusulas (ferramenta contratos_clausulas, _shared/agente/dominios/contratos.ts). PDF com texto: extração direta
// (unpdf). PDF escaneado (só imagem, menos de 200 caracteres): OCR pelo Gemini. Fila: RPC contratos_anexos_para_ler.
// Cron a cada 10 min, 3 por rodada. Só service role (cron) ou admin. { anexo_ids: [...] } relê anexos específicos.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MODELO = "gemini-3.5-flash-lite";
const PADRAO = "contratos-documentos";
// Mesma lista de localDoAnexoContrato (ContratoDialogWithClient.tsx): há anexo "uuid/arquivo" em outros buckets.
const BUCKETS = [PADRAO, "licitacoes-anexos", "editais-pdfs", "contrato-rascunho-anexos", "ages-documentos"];
const TAM = 1500;
const MIN_TEXTO = 200;
// Pedido inline ao Gemini vai até 20 MB; base64 cresce 1/3.
const MAX_BYTES_OCR = 14 * 1024 * 1024;

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

async function ocr(chave: string, pdf: Uint8Array, tentativa = 0): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: "application/pdf", data: encodeBase64(pdf) } }, { text: PROMPT_OCR }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 65536 },
    }),
    signal: AbortSignal.timeout(110_000),
  });
  const corpo = await r.json().catch(() => ({}));
  if ((r.status === 429 || r.status === 503) && tentativa < 1) { await espera(20_000); return ocr(chave, pdf, tentativa + 1); }
  if (!r.ok) throw new Error(`gemini ${corpo?.error?.status || r.status}: ${String(corpo?.error?.message || "").slice(0, 160)}`);
  return corpo.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
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
    const { data: ant } = await svc.from("contrato_anexo_leitura").select("tentativas").eq("anexo_id", a.id).maybeSingle();
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
      const bytes = new Uint8Array(await arq.arrayBuffer());

      const doc = await getDocumentProxy(new Uint8Array(bytes));
      const { totalPages, text } = await extractText(doc, { mergePages: false });
      let paginas = (text as string[]).map((t) => t ?? "");
      let metodo = "texto";
      if (paginas.join("").replace(/\s/g, "").length < MIN_TEXTO) {
        if (!chave) { await gravar({ status: "sem_texto", paginas: totalPages, caracteres: 0, metodo: "texto" }); resultado.push({ id: a.id, status: "sem_texto" }); continue; }
        if (bytes.length > MAX_BYTES_OCR) throw new Error(`escaneado grande demais para OCR (${Math.round(bytes.length / 1048576)} MB)`);
        paginas = paginasDoOcr(await ocr(chave, bytes));
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
      await gravar({ status: "erro", erro, tentativas: (ant?.tentativas ?? 0) + 1 });
      resultado.push({ id: a.id, status: "erro", erro });
    }
  }
  return json({ ok: true, lidos: resultado.length, resultado });
});
