// TESTE PNCP × Effecti — captura licitações de saúde do PNCP (Portal Nacional de
// Contratações Públicas, Lei 14.133, API pública gratuita) pra medir se o PNCP cobre
// tudo que a Effecti traz (sem perder oportunidade) antes de cortar a Effecti.
//
// Grava em `licitacoes_pncp_staging` (NÃO toca `licitacoes` de produção).
//
// REESCRITO 14/07 (v2) pra usar a API de BUSCA (/api/search/) em vez do endpoint
// /consulta/v1/contratacoes/publicacao. Motivo (validado em campo):
//   - O endpoint /consulta só varria ~400 por janela → sub-captura crônica.
//   - A /api/search é a mesma que o portal usa: full-text, filtrável, e traz
//     `tem_resultado`/`valor_global`/`situacao` (insumo do BI de vencedores).
//   - `ordenacao=-data` NÃO é cronológica confiável (datas embaralhadas na página),
//     então NÃO paginamos por "janela de dias": capturamos top-N por query e
//     ACUMULAMOS via upsert (dedup por numero_controle_pncp) ao longo dos runs 3x/dia.
//   - A API derruba conexão sob carga → retry com backoff é obrigatório, e uma
//     falha de página NÃO aborta o run (só conta erro e segue).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SEARCH = "https://pncp.gov.br/api/search/";

// Queries temáticas de SERVIÇO de saúde (a busca é fuzzy e expande cada termo).
// Rodamos todas e unimos por numero_controle_pncp. O classificador de keyword
// abaixo faz o corte fino de relevância no título+objeto de cada resultado.
const QUERIES = [
  "prestacao de servicos medicos",
  "plantao medico hospitalar",
  "servicos de saude mao de obra",
  "credenciamento profissionais de saude",
  "gestao de unidade de saude",
  "atencao basica saude da familia",
  "servicos medicos especializados",
];

// Classificador de relevância (mesmo do filtro alargado): confirma que o edital é
// da área de saúde/serviço, cortando o off-topic que a busca fuzzy arrasta.
//  - PREFIX: casa início de palavra (pega plurais/derivações: "enfermag"→enfermagem).
//  - WORD: palavra inteira, pros acrônimos curtos (evita "uti" dentro de "gratuito").
const KW_PREFIX = [
  "servico medic", "servicos medic", "prestacao de servico medic", "mao de obra medic",
  "plantao", "plantonista", "plantoes", "escala medic", "profissional medic", "profissionais medic",
  "atendimento medic", "consulta medic", "clinica medic", "pronto atendimento", "pronto-socorro", "pronto socorro",
  "medico especialista", "especialidade medic", "assistencia medic", "servico hospitalar", "servicos hospitalar",
  "radiolog", "telemedicina", "telessaude", "laudo", "exame de imagem", "tomografia", "ressonancia",
  "ultrassonograf", "ultrassom", "anestesiolog", "cirurg", "terapia intensiva",
  "servico de saude", "servicos de saude", "prestacao de servicos de saude",
  "atencao basica", "atencao primaria", "saude da familia", "estrategia saude",
  "profissional de saude", "profissionais de saude", "profissionais da saude",
  "equipe multiprofissional", "equipe de saude", "agente comunitario",
  "enfermag", "enfermeir", "tecnico de enfermagem",
  "hospital", "ambulator", "posto de saude", "unidade basica", "unidade de saude", "unidade de pronto",
  "gestao em saude", "gestao de saude", "gerenciamento de unidade", "recursos humanos em saude",
  "credenciamento de", "assistencia a saude",
];
const KW_WORD = ["uti", "upa", "ubs", "esf", "samu", "ubsf", "caps"];

const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const KW_RE = [
  ...KW_PREFIX.map((k) => ({ k, re: new RegExp(`(^|[^a-z0-9])${esc(k)}`) })),
  ...KW_WORD.map((k) => ({ k, re: new RegExp(`(^|[^a-z0-9])${esc(k)}([^a-z0-9]|$)`) })),
];
const matchKeywords = (texto: string) => {
  const alvo = norm(texto);
  return KW_RE.filter((x) => x.re.test(alvo)).map((x) => x.k);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// fetch com retry/backoff — a API do PNCP derruba conexão sob carga.
async function fetchJson(url: string, tries = 3): Promise<any | null> {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "gss-licitacoes/2.0" } });
      if (!r.ok) { if (t === tries - 1) return null; await sleep(700 * (t + 1)); continue; }
      return await r.json();
    } catch (_e) {
      if (t === tries - 1) return null;
      await sleep(700 * (t + 1));
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const paginas = Math.min(Number(body?.paginas) || 4, 12);      // páginas por query
    const tamPagina = Math.min(Number(body?.tamPagina) || 100, 100);
    const queries: string[] = Array.isArray(body?.queries) && body.queries.length ? body.queries : QUERIES;

    const t0 = Date.now();
    const DEADLINE = t0 + 110_000; // orçamento rígido: Edge Runtime derruba em 150s
    // dedup entre queries por numero_controle_pncp
    const unicos = new Map<string, any>();
    let fetched = 0, erros = 0;
    const porQuery: Record<string, number> = {};
    for (const q of queries) porQuery[q] = 0;
    // queries que já acabaram (última página) — param de repetir varredura
    const exauridas = new Set<string>();
    let cortadoPorTempo = false;

    // BREADTH-FIRST (página-major): dá 1 página a cada query antes de ir pra pág. 2.
    // Se o deadline cortar, todas as queries já pegaram as páginas de topo (cobertura larga).
    paginacao:
    for (let pagina = 1; pagina <= paginas; pagina++) {
      for (const q of queries) {
        if (exauridas.has(q)) continue;
        if (Date.now() > DEADLINE) { cortadoPorTempo = true; break paginacao; }
        const url = `${SEARCH}?q=${encodeURIComponent(q)}&tipos_documento=edital&ordenacao=-data&pagina=${pagina}&tam_pagina=${tamPagina}`;
        const j = await fetchJson(url);
        if (!j) { erros++; await sleep(300); continue; }
        const items: any[] = j?.items ?? [];
        if (items.length === 0) { exauridas.add(q); continue; }
        fetched += items.length;

        for (const it of items) {
          const ncp = it?.numero_controle_pncp;
          if (!ncp || unicos.has(ncp)) continue;
          const texto = `${it?.title || ""} ${it?.description || ""}`;
          const match = matchKeywords(texto);
          if (match.length === 0) continue; // corta off-topic da busca fuzzy
          porQuery[q]++;
          unicos.set(ncp, {
            numero_controle_pncp: ncp,
            objeto: it?.description || it?.title || null,
            orgao: it?.orgao_nome || null,
            cnpj_orgao: it?.orgao_cnpj || null,
            uf: it?.uf || null,
            municipio: it?.municipio_nome || null,
            valor_estimado: it?.valor_global ?? null,
            modalidade: it?.modalidade_licitacao_nome || null,
            situacao: it?.situacao_nome || null,
            data_publicacao: it?.data_publicacao_pncp || null,
            tem_resultado: it?.tem_resultado ?? null,
            url_pncp: it?.item_url ? `https://pncp.gov.br${it.item_url}` : null,
            palavras_match: match,
            raw: it,
          });
        }
        if (items.length < tamPagina) exauridas.add(q); // última página desta query
        await sleep(200); // gentileza com a API instável
      }
      if (exauridas.size === queries.length) break; // tudo varrido
    }

    const registros = [...unicos.values()];
    let upsertadas = 0;
    for (let i = 0; i < registros.length; i += 200) {
      const lote = registros.slice(i, i + 200);
      const { error } = await supabase.from("licitacoes_pncp_staging")
        .upsert(lote, { onConflict: "numero_controle_pncp", ignoreDuplicates: false });
      if (error) erros++; else upsertadas += lote.length;
    }

    return json({
      ok: true,
      endpoint: "search",
      queries: queries.length,
      paginas_por_query: paginas,
      cortado_por_tempo: cortadoPorTempo,
      itens_varridos: fetched,
      relevantes_unicos: registros.length,
      upsertadas,
      erros,
      por_query: porQuery,
      segundos: Math.round((Date.now() - t0) / 1000),
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
