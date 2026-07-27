// =====================================================================
// pncp-anexos - baixa os documentos do edital direto do PNCP para os cards
// do BOARD DO ROBO.
//
// POR QUE EXISTE: o board do robo subiu em 27/07 com o objeto completo (a
// Effecti manda 84% dos cards sem descricao nenhuma), mas SEM anexo. E sem o
// edital em si a Sarah nao consegue avaliar de verdade - ela compararia um
// board com PDF contra um board sem, e o feedback viria enviesado a favor da
// Effecti por um motivo que nao tem nada a ver com a qualidade da captacao.
//
// Descoberta que ajuda: o PNCP devolve o nome do arquivo LEGIVEL e com
// extensao ("CREDENCIAMENTO_052026_EDITAL.PDF"). E a Effecti que repassa o
// nome URL-encoded e sem extensao - o defeito que quebrou a abertura de anexo
// em 27/07. Indo direto na fonte, o nome ja chega bom.
//
// ESCOPO: toca SOMENTE cards com board='robo'. Nao existe caminho neste
// arquivo que escreva em card do board da Effecti.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const API = "https://pncp.gov.br/api/pncp/v1";
const BUCKET = "editais-pdfs";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 30 req/min e o limite REAL medido do PNCP por IP; acima disso vem 429 e
// depois blackhole TCP do IP inteiro. 2000ms entre chamadas = 30/min exatos.
const PACING = 2000;

// Nome do storage: o titulo do PNCP e legivel mas pode ter caractere que
// quebra chave de objeto. Preserva a extensao, que e o que faz o arquivo
// abrir com duplo clique depois de baixado.
function nomeSeguro(titulo: string, seq: number): string {
  const limpo = (titulo || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const m = limpo.match(/^(.*?)(\.[A-Za-z0-9]{2,5})?$/);
  const base = (m?.[1] || `documento_${seq}`).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 90);
  const ext = (m?.[2] || ".pdf").toLowerCase();
  return `${base || `documento_${seq}`}${ext}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const t0 = Date.now();
  const DEADLINE = t0 + 110_000;

  try {
    const body = await req.json().catch(() => ({}));
    const maxCards = Math.min(Number(body?.max_cards) || 10, 40);

    // Só cards do robô que ainda não têm nenhum anexo.
    const { data: cards, error: erroCards } = await supabase
      .from("licitacoes")
      .select("id, licitacao_codigo, titulo")
      .eq("board", "robo")
      .not("licitacao_codigo", "is", null)
      .limit(200);
    if (erroCards) return json({ ok: false, error: erroCards.message }, 500);

    const ids = (cards || []).map((c: any) => c.id);
    const jaTem = new Set<string>();
    for (let k = 0; k < ids.length; k += 100) {
      const { data: ax } = await supabase
        .from("licitacoes_anexos")
        .select("licitacao_id")
        .in("licitacao_id", ids.slice(k, k + 100));
      (ax || []).forEach((a: any) => jaTem.add(a.licitacao_id));
    }
    const pendentes = (cards || []).filter((c: any) => !jaTem.has(c.id)).slice(0, maxCards);

    let cardsOk = 0, arquivos = 0, semDocumento = 0, falhas = 0;
    let cortado = false;

    for (const card of pendentes) {
      if (Date.now() > DEADLINE) { cortado = true; break; }

      // numero_controle_pncp = "CNPJ-1-SEQUENCIAL/ANO"
      const m = String(card.licitacao_codigo).match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
      if (!m) { falhas++; continue; }
      const [, cnpj, seqRaw, ano] = m;
      const seq = String(parseInt(seqRaw, 10)); // a API recusa zeros a esquerda

      const lista = await fetch(`${API}/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      await sleep(PACING);

      if (!lista || !lista.ok) { falhas++; continue; }
      const docs = await lista.json().catch(() => null);
      if (!Array.isArray(docs) || docs.length === 0) { semDocumento++; continue; }

      let gravouAlgum = false;
      for (const doc of docs) {
        if (Date.now() > DEADLINE) { cortado = true; break; }
        if (doc?.statusAtivo === false) continue;

        const bin = await fetch(doc.url || doc.uri, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
        await sleep(PACING);
        if (!bin || !bin.ok) continue;

        const nome = nomeSeguro(doc.titulo, doc.sequencialDocumento);
        const caminho = `${card.id}/${nome}`;
        const bytes = new Uint8Array(await bin.arrayBuffer());

        const { error: erroUp } = await supabase.storage
          .from(BUCKET)
          .upload(caminho, bytes, {
            contentType: bin.headers.get("content-type") || "application/pdf",
            upsert: true,
          });
        if (erroUp) continue;

        // A LINHA e obrigatoria, nao o arquivo. Arquivo no bucket sem linha em
        // licitacoes_anexos e orfao invisivel - o front lista pela tabela. Foi
        // assim que 107 editais sumiram em 24/07. Por isso o bucket vai
        // gravado na linha, e nao deduzido do nome da pasta.
        const { error: erroLinha } = await supabase.from("licitacoes_anexos").insert({
          licitacao_id: card.id,
          arquivo_nome: nome,
          arquivo_url: caminho,
          bucket: BUCKET,
          usuario_nome: "Robo PNCP",
        });
        if (erroLinha) continue;

        arquivos++;
        gravouAlgum = true;
      }
      if (gravouAlgum) cardsOk++;
    }

    // Batimento: uma rodada saudavel pode gravar 0 (tudo ja baixado), mas se
    // as chamadas comecarem a FALHAR em massa o contrato da API mudou.
    await supabase.rpc("crawl_health_registrar", {
      p_fonte: "pncp-anexos",
      p_chave: "-",
      p_observado: pendentes.length - falhas,
      p_esperado_min: null,
      p_detalhe: { cards_ok: cardsOk, arquivos, sem_documento: semDocumento, falhas, cortado },
    }).then(() => null).catch(() => null);

    return json({
      ok: true,
      cards_pendentes: pendentes.length,
      cards_com_anexo: cardsOk,
      arquivos_baixados: arquivos,
      sem_documento: semDocumento,
      falhas,
      cortado_por_tempo: cortado,
      ms: Date.now() - t0,
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
