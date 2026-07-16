// =====================================================================
// pncp-mirror-sync — ESPELHO COMPLETO do PNCP (todas modalidades, Brasil)
//
// Estratégia (garante cobertura 100%, sem depender da busca fuzzy):
//   Varre o endpoint OFICIAL de sincronização /consulta/.../publicacao por
//   DATA × MODALIDADE × PÁGINA (tam 50 — tamanhos maiores retornam vazio às
//   vezes). NÃO filtra por tema: guarda tudo cru em `pncp_mirror`.
//
//   Checkpoint em `pncp_mirror_sync_state` (1 linha por data×modalidade):
//   grava a última página feita. O Edge Runtime derruba em ~150s, então o run
//   tem deadline de 110s e PARA; o próximo run retoma exatamente de onde parou.
//   Idempotente: re-rodar a mesma janela só faz upsert (dedup por controle PNCP).
//
//   A API do PNCP é instável (derruba conexão / 500 no banco deles) → retry com
//   backoff, e falha de página NÃO aborta o run (marca erro e segue).
//
// Input (todos opcionais):
//   { dias_backfill?: number,  // default 30 — enfileira D-0..D-N
//     data_inicio?: 'YYYY-MM-DD', data_fim?: 'YYYY-MM-DD',  // janela explícita
//     modalidades?: number[] } // default 1..13
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const BASE = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const TAM_PAGINA = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

// fetch com retry/backoff — API do PNCP derruba conexão e dá 500 sob carga.
async function fetchPncp(dataYmd: string, modalidade: number, pagina: number, tries = 4): Promise<any | null> {
  const url = `${BASE}?dataInicial=${dataYmd}&dataFinal=${dataYmd}&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${TAM_PAGINA}`;
  for (let t = 0; t < tries; t++) {
    try {
      // timeout explícito: a API do PNCP às vezes aceita a conexão e TRAVA sem
      // responder (visto em outage). Sem abort, a request pendura e come o
      // deadline do run inteiro. 8s corta rápido e deixa o run seguir.
      const r = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "gss-pncp-mirror/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 204) return { data: [], totalPaginas: 0 }; // sem registros nesse dia/modalidade
      if (!r.ok) { if (t === tries - 1) return null; await sleep(600 * (t + 1)); continue; }
      return await r.json();
    } catch (_e) {
      if (t === tries - 1) return null;
      await sleep(600 * (t + 1));
    }
  }
  return null;
}

// mapeia o item cru do PNCP → colunas do espelho (mantém raw completo)
function mapItem(it: any) {
  const org = it?.orgaoEntidade ?? {};
  const uni = it?.unidadeOrgao ?? {};
  return {
    numero_controle_pncp: it?.numeroControlePNCP,
    ano: it?.anoCompra ?? null,
    sequencial: it?.sequencialCompra ?? null,
    cnpj_orgao: org?.cnpj ?? null,
    orgao_razao_social: org?.razaoSocial ?? null,
    uf: uni?.ufSigla ?? null,
    municipio: uni?.municipioNome ?? null,
    codigo_ibge: uni?.codigoIbge ?? null,
    esfera: org?.esferaId ?? null,
    poder: org?.poderId ?? null,
    modalidade_id: it?.modalidadeId ?? null,
    modalidade_nome: it?.modalidadeNome ?? null,
    objeto_compra: it?.objetoCompra ?? null,
    valor_estimado: it?.valorTotalEstimado ?? null,
    valor_homologado: it?.valorTotalHomologado ?? null,
    situacao_id: it?.situacaoCompraId ?? null,
    situacao_nome: it?.situacaoCompraNome ?? null,
    tem_resultado: typeof it?.valorTotalHomologado === "number" ? true : null,
    data_publicacao: it?.dataPublicacaoPncp ?? null,
    data_atualizacao: it?.dataAtualizacaoGlobal ?? it?.dataAtualizacao ?? null,
    data_abertura_proposta: it?.dataAberturaProposta ?? null,
    data_encerramento_proposta: it?.dataEncerramentoProposta ?? null,
    link_sistema_origem: it?.linkSistemaOrigem ?? null,
    raw: it,
    atualizado_em: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const t0 = Date.now();
  const DEADLINE = t0 + 110_000;

  // lease lock: se outra execução está rodando, sai (evita sobreposição do cron 3min)
  const { data: gotLock } = await supabase.rpc("pncp_acquire_lock", { p_job: "mirror-sync", p_secs: 130 });
  if (!gotLock) return json({ ok: true, skipped: "outra execução em andamento" });
  const soltarLock = () => supabase.from("pncp_job_lock").update({ locked_until: new Date().toISOString() }).eq("job", "mirror-sync");

  try {
    const body = await req.json().catch(() => ({}));

    // ── 1. Enfileira janela no checkpoint (idempotente) ──
    const modalidades: number[] = Array.isArray(body?.modalidades) && body.modalidades.length ? body.modalidades : MODALIDADES;
    const datas: string[] = [];
    if (body?.data_inicio && body?.data_fim) {
      for (let d = new Date(body.data_inicio + "T00:00:00Z"); iso(d) <= body.data_fim; d.setUTCDate(d.getUTCDate() + 1)) datas.push(iso(d));
    } else {
      const dias = Math.min(Number(body?.dias_backfill) || 30, 120);
      const hoje = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      for (let i = 0; i < dias; i++) { const d = new Date(hoje); d.setUTCDate(d.getUTCDate() - i); datas.push(iso(d)); }
    }
    const novasLinhas = datas.flatMap((data_ref) => modalidades.map((modalidade_id) => ({ data_ref, modalidade_id })));
    // insere só as que ainda não existem (não reseta progresso de quem já rodou)
    await supabase.from("pncp_mirror_sync_state").upsert(novasLinhas, { onConflict: "data_ref,modalidade_id", ignoreDuplicates: true });

    // ── 2. Pega o lote pendente (mais recente primeiro — cobre o "agora" antes do histórico) ──
    const { data: pendentes } = await supabase
      .from("pncp_mirror_sync_state")
      .select("data_ref, modalidade_id, ultima_pagina, total_paginas")
      .neq("status", "completo")
      .order("data_ref", { ascending: false })
      .limit(400);

    let paginasFeitas = 0, registrosUpsert = 0, unidadesCompletas = 0, erros = 0;
    let cortadoPorTempo = false;

    for (const p of pendentes ?? []) {
      if (Date.now() > DEADLINE) { cortadoPorTempo = true; break; }
      const dataYmd = p.data_ref.replaceAll("-", "");
      let pagina = (p.ultima_pagina ?? 0) + 1;
      let totalPaginas = p.total_paginas ?? null;

      while (true) {
        if (Date.now() > DEADLINE) { cortadoPorTempo = true; break; }
        const j = await fetchPncp(dataYmd, p.modalidade_id, pagina);
        if (j === null) {
          erros++;
          await supabase.from("pncp_mirror_sync_state").update({ status: "erro", erro_msg: `falha pág ${pagina}`, atualizado_em: new Date().toISOString() })
            .eq("data_ref", p.data_ref).eq("modalidade_id", p.modalidade_id);
          break; // deixa pra retomar no próximo run
        }
        totalPaginas = j?.totalPaginas ?? totalPaginas ?? 0;
        const items: any[] = j?.data ?? [];
        paginasFeitas++;

        if (items.length > 0) {
          const registros = items.map(mapItem).filter((r) => r.numero_controle_pncp);
          const { error } = await supabase.from("pncp_mirror").upsert(registros, { onConflict: "numero_controle_pncp", ignoreDuplicates: false });
          if (error) erros++; else registrosUpsert += registros.length;
        }

        // grava progresso a cada página (retomável). `registros` conta o
        // acumulado por unidade — soma incremental da página atual.
        const completo = totalPaginas === 0 || pagina >= totalPaginas || items.length < TAM_PAGINA;
        await supabase.rpc("pncp_sync_bump", {
          p_data: p.data_ref, p_mod: p.modalidade_id, p_pagina: pagina,
          p_total: totalPaginas, p_delta: items.length, p_completo: completo,
        });

        if (completo) { unidadesCompletas++; break; }
        pagina++;
        await sleep(150); // gentileza com a API instável
      }
    }

    // quanto ainda falta
    const { count: pendentesRestantes } = await supabase
      .from("pncp_mirror_sync_state").select("*", { count: "exact", head: true }).neq("status", "completo");

    await soltarLock();
    return json({
      ok: true,
      cortado_por_tempo: cortadoPorTempo,
      paginas_feitas: paginasFeitas,
      registros_upsert: registrosUpsert,
      unidades_completas: unidadesCompletas,
      erros,
      pendentes_restantes: pendentesRestantes ?? null,
      segundos: Math.round((Date.now() - t0) / 1000),
    });
  } catch (e: any) {
    await soltarLock().catch(() => null);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
