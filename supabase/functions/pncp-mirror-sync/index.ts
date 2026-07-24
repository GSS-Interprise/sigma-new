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
// Só sela um dia como "completo" depois que ele parou de receber
// publicação. Antes disso o dia é re-varrido a cada passe do cron.
const DIAS_ATE_SELAR = 2;

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

    // ── 2. Pega o lote pendente — RODÍZIO pelo menos-recentemente-tocado. ──
    // "Mais recente primeiro" + re-varredura de dia vivo fazia cada passe
    // gastar o orçamento inteiro nos dias 22-23 e NUNCA chegar no backlog:
    // o buraco do congelamento (16-20/07) ficou 24h sem drenar. Ordenar por
    // atualizado_em asc alterna naturalmente entre buraco e dia vivo — o
    // dia vivo atrasa uns minutos por ciclo, o que não afeta paridade com
    // a Effecti; o backlog deixa de morrer de fome.
    const { data: pendentes } = await supabase
      .from("pncp_mirror_sync_state")
      .select("data_ref, modalidade_id, ultima_pagina, total_paginas, atualizado_em")
      .neq("status", "completo")
      .order("atualizado_em", { ascending: true })
      .limit(400);

    let paginasFeitas = 0, registrosUpsert = 0, unidadesCompletas = 0, erros = 0;
    let cortadoPorTempo = false;

    for (const p of pendentes ?? []) {
      if (Date.now() > DEADLINE) { cortadoPorTempo = true; break; }

      // Dia vivo re-varre no máximo a cada 30 min. Re-varredura a cada passe
      // (3 min) consumia ~200 páginas/ciclo do orçamento de rate-limit do
      // PNCP e o backlog morria de fome mesmo com o rodízio (16-20/07
      // estagnou 1h30 em 23/07). A API rejeita tamanhoPagina > 50 (HTTP
      // 400), então economizar requisição é a única alavanca de vazão.
      const idadeDiaRef = Math.floor((Date.now() - new Date(p.data_ref + "T00:00:00Z").getTime()) / 864e5);
      const tocadoHaMs = p.atualizado_em ? Date.now() - new Date(p.atualizado_em).getTime() : Infinity;
      if (idadeDiaRef < DIAS_ATE_SELAR && tocadoHaMs < 30 * 60_000) continue;
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

        // Fim do lote = acabaram as páginas DESTE instante. Não confundir
        // com "o dia acabou": um dia ainda em curso recebe publicação nova
        // o tempo todo.
        //
        // `totalPaginas` é a ÚNICA autoridade de fim (o PNCP devolve confiável:
        // testado, 121 registros = 3 páginas). NÃO usar `items.length <
        // TAM_PAGINA`: sob carga o PNCP devolve página TRUNCADA (30 de 50 itens,
        // HTTP 200), o `30 < 50` disparava fim e selava o dia no meio — 18/07
        // selou com 232 de ~6.000, 19/07 com 37. `items.length === 0` (página
        // vazia = genuinamente após o fim) é o único fallback seguro quando
        // totalPaginas vem nulo.
        const fimDoLote = totalPaginas === 0
          || (totalPaginas != null && pagina >= totalPaginas)
          || items.length === 0;

        // O selo depende da IDADE do dia, nunca do fim do lote. Selar cedo
        // congela o espelho: o lote só busca status <> 'completo', então
        // dia selado nunca mais é revisitado. Foi o que travou a ingestão
        // por 5 dias — o cron criava o dia à meia-noite, o PNCP respondia
        // 204 (nada publicado ainda), totalPaginas=0 selava o dia vazio.
        // Mesmo defeito, versão silenciosa: dia varrido ao meio-dia selava
        // com metade dos registros (16/07 pegou 1.162 de ~6.000).
        const idadeDias = Math.floor(
          (Date.now() - new Date(p.data_ref + "T00:00:00Z").getTime()) / 864e5,
        );
        const completo = fimDoLote && idadeDias >= DIAS_ATE_SELAR;

        await supabase.rpc("pncp_sync_bump", {
          p_data: p.data_ref, p_mod: p.modalidade_id,
          // Checkpoint: SÓ o dia vivo volta pra página 1 (publicação nova
          // desloca a paginação, retomar de ultima_pagina+1 pularia registro;
          // o upsert é idempotente, re-varrer não duplica).
          //
          // Dia histórico PRECISA guardar a página, senão cada passe recomeça
          // do 1, re-busca as mesmas páginas iniciais, queima o rate-limit e
          // nunca alcança as páginas do fim: 16-22/07 ficaram presos com
          // ultima_pagina=0 e total_paginas=57, acumulando 22k registros
          // repetidos num dia que tem ~3k. Zerar aqui era o que impedia o
          // backfill de fechar.
          p_pagina: (!completo && idadeDias < DIAS_ATE_SELAR) ? 0 : pagina,
          p_total: totalPaginas, p_delta: items.length, p_completo: completo,
        });

        if (fimDoLote) { if (completo) unidadesCompletas++; break; }
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
