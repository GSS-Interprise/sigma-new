// =====================================================================
// crawl-bll — captura o BLL Compras, a fonte que fecha a cauda fora do PNCP.
//
// POR QUE EXISTE: a validação de 10 dias mostrou que ~99% do que a Effecti
// entrega está no PNCP de graça. O que sobra são municípios pequenos que
// publicam SÓ em portal privado — e é essa cauda que ainda justifica pagar
// a Effecti. Dois casos confirmados ao vivo (Santana dos Garrotes/PB,
// Arenápolis/MT). "BLL COMPRAS" aparece como etiqueta nos próprios cards
// que a Effecti entrega, então é o portal com maior retorno.
//
// COMO FUNCIONA (verificado ao vivo em 25/07):
//   - Listagem pública `/Process/ProcessSearchPublic?param1=0` devolve os
//     100 editais mais recentes em HTML, SEM auth e SEM reCAPTCHA. Cada
//     linha traz órgão, número, modalidade, MUNICÍPIO-UF, situação e datas.
//   - O OBJETO não vem na listagem: só na página de detalhe (ProcessView).
//     Como o classificador depende do objeto, é obrigatório buscar detalhe
//     — mas só dos editais AINDA NÃO conhecidos, senão a cada rodada seriam
//     100 requisições inúteis.
//
// Grava em pncp_mirror com portal='bll' e numero_controle_pncp='bll:<token>'.
// Assim score_gss (trigger), triagem, comparativo e promote funcionam sem
// nenhuma mudança — a mesma máquina, outra fonte.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const LIST = "https://bllcompras.com/Process/ProcessSearchPublic?param1=0";
const DETAIL = "https://bllcompras.com/Process/ProcessView?param1=";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// O BLL devolve entidades HTML decimais (&#199; = Ç) em vez de UTF-8.
// Sem decodificar, o classificador receberia "CONTRATA&#199;&#195;O" e o
// imm_unaccent não teria o que normalizar.
function decodeEnt(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}
const semTags = (s: string) => decodeEnt(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// "25/07/2026 17:59" -> ISO. Sem timezone explícito o BLL usa horário de
// Brasília; -03:00 evita que a data de disputa escorregue um dia.
function dataBr(s: string | undefined): string | null {
  const m = (s || "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] || "00"}:${m[5] || "00"}:00-03:00`;
}

async function pega(url: string, tries = 3): Promise<string | null> {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.text();
    } catch (_e) { /* retry */ }
    await sleep(800 * (t + 1));
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const t0 = Date.now();
  const DEADLINE = t0 + 110_000;

  try {
    const body = await req.json().catch(() => ({}));
    const maxDetalhes = Math.min(Number(body?.max_detalhes) || 40, 100);

    const html = await pega(LIST);
    if (!html) return json({ ok: false, error: "listagem do BLL nao respondeu" }, 502);

    // cada <tr> com link de ProcessView é um edital
    const linhas = (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []).filter((r) => r.includes("ProcessView"));
    const itens: any[] = [];
    for (const linha of linhas) {
      const tok = linha.match(/ProcessView\?param1=([^"'>\s]+)/)?.[1];
      if (!tok) continue;
      const td = (linha.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(semTags);
      // [1]=órgão [2]=número [3]=modalidade [4]=MUNICIPIO-UF [5]=situação [6]/[7]=datas
      const munUf = td[4] || "";
      const mUf = munUf.match(/^(.*)-([A-Z]{2})$/);
      itens.push({
        token: tok,
        orgao: td[1] || null,
        numero: td[2] || null,
        modalidade: td[3] || null,
        municipio: mUf ? mUf[1].trim() : (munUf || null),
        uf: mUf ? mUf[2] : null,
        situacao: td[5] || null,
        encerramento: dataBr(td[6]),
        abertura: dataBr(td[7]),
      });
    }
    if (!itens.length) return json({ ok: false, error: "nenhuma linha extraida - layout do BLL pode ter mudado" }, 502);

    // Só busca detalhe do que ainda não conhecemos. Sem este corte, cada
    // rodada gastaria 100 requisições pra redescobrir o mesmo objeto.
    const ids = itens.map((i) => `bll:${i.token}`);
    const { data: existentes } = await supabase
      .from("pncp_mirror").select("numero_controle_pncp").in("numero_controle_pncp", ids);
    const conhecidos = new Set((existentes || []).map((e: any) => e.numero_controle_pncp));
    const novos = itens.filter((i) => !conhecidos.has(`bll:${i.token}`)).slice(0, maxDetalhes);

    let gravados = 0, semObjeto = 0, cortado = false;
    for (const it of novos) {
      if (Date.now() > DEADLINE) { cortado = true; break; }
      const det = await pega(DETAIL + it.token);
      await sleep(400); // gentileza: portal privado, sem limite documentado
      if (!det) { semObjeto++; continue; }

      const txt = semTags(det.replace(/<script[\s\S]*?<\/script>/g, ""));
      // o rótulo "OBJETO" precede o texto; corta no próximo rótulo em caixa alta
      const mo = txt.match(/OBJETO[:\s]+(.{20,1200}?)(?:\s{2,}[A-ZÀ-Ú][A-ZÀ-Ú\s]{6,}:|$)/);
      const objeto = mo ? mo[1].trim() : null;
      if (!objeto) { semObjeto++; continue; }

      const { error } = await supabase.from("pncp_mirror").upsert({
        numero_controle_pncp: `bll:${it.token}`,
        portal: "bll",
        orgao_razao_social: it.orgao,
        municipio: it.municipio,
        uf: it.uf,
        modalidade_nome: it.modalidade,
        objeto_compra: objeto,
        data_publicacao: it.encerramento,          // melhor proxy disponível
        data_encerramento_proposta: it.abertura,   // a disputa é a data final
        link_sistema_origem: DETAIL + it.token,
        // raw é NOT NULL no espelho; guarda o que a listagem deu
        raw: { fonte: "bll", numeroCompra: it.numero, situacao: it.situacao, token: it.token },
      }, { onConflict: "numero_controle_pncp" });
      if (error) { semObjeto++; continue; }
      gravados++;
    }

    return json({
      ok: true, listados: itens.length, ja_conhecidos: conhecidos.size,
      novos_com_detalhe: novos.length, gravados, sem_objeto: semObjeto,
      cortado_por_tempo: cortado, ms: Date.now() - t0,
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
