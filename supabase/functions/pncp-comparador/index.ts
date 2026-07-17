// =====================================================================
// pncp-comparador — CANÁRIO de cobertura Effecti × espelho PNCP.
//
// Prova (ou refuta) que podemos cortar a Effecti. Pra cada licitação que a
// Effecti trouxe (fonte='n8n' em licitacoes), verifica se está no espelho.
//
// Dados da Effecti são POBRES e SUJOS (sem controle PNCP/CNPJ, objeto vazio,
// data de disputa corrompida). Só dá pra casar por: município + número do
// edital (extraído do título) + modalidade. Sem data.
//
// 3 buckets:
//   casado   = muni + número + modalidade batem no espelho  → coberto
//   incerto  = muni existe no espelho mas número não bateu   → casamento duvidoso (revisar)
//   ausente  = muni nem aparece no espelho na janela         → CANDIDATO A FONTE EXTERNA
// O bucket `ausente` é o ponto 2 (fontes fora do PNCP) — o número que decide.
//
// Input: { desde?: 'YYYY-MM-DD' (default 8d), gravar?: true }
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// "Pregão Eletrônico" → codigoModalidade PNCP
const MOD: Record<string, number> = {
  "Pregão Eletrônico": 6, "Pregão Presencial": 7, "Credenciamento": 12,
  "Concorrência": 4, "Dispensa": 8, "Inexigibilidade": 9, "Concurso": 3,
  "Edital Chamamento": 12, "Chamamento": 12, "Leilão": 1,
};

// só tira a UF e o sufixo — o casamento fuzzy (pg_trgm) tolera o encoding
// corrompido da Effecti, então NÃO reduzimos a ASCII aqui (perderia sinal).
const limpaMuni = (s: string) =>
  (s || "").replace(/\s*-\s*[A-Za-z]{2}\s*$/, "").split("/")[0].trim();

// número + ano do edital: "DL 24/2026"→{24,2026}; "DL 3312026"→{331,2026}; "PE 30"→{30,null}
const extraiNum = (titulo: string): { num: string | null; ano: number | null } => {
  const t = titulo || "";
  let m = t.match(/(\d+)\s*\/\s*(\d{4})/);                 // 24/2026
  if (m) return { num: String(parseInt(m[1], 10)), ano: parseInt(m[2], 10) };
  m = t.match(/\b(\d{1,6})(20\d{2})\b/);                   // 3312026 (colado)
  if (m) return { num: String(parseInt(m[1], 10)), ano: parseInt(m[2], 10) };
  m = t.match(/\b[A-Za-z]{2,5}\s+(\d+)\b/);                // "DL 24" sem ano
  if (m) return { num: String(parseInt(m[1], 10)), ano: null };
  return { num: null, ano: null };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const gravar = body?.gravar !== false;
    const desde = body?.desde || new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);

    // Effecti da janela (usa created_at — data_disputa está corrompida)
    const { data: effs } = await supabase
      .from("licitacoes").select("titulo, municipio_uf, subtipo_modalidade")
      .eq("fonte", "n8n").gte("created_at", desde);

    if (!effs?.length) return json({ ok: true, msg: "sem Effecti na janela", desde });

    // normaliza cada Effecti → (muni, num, ano, mod)
    const linhas = effs.map((e: any) => {
      const n = extraiNum(e.titulo || "");
      return { titulo: e.titulo, muni: limpaMuni(e.municipio_uf || ""), num: n.num, ano: n.ano, mod: MOD[e.subtipo_modalidade] ?? null };
    });

    let casados = 0, provaveis = 0, incertos = 0, ausentes = 0, semParse = 0;
    const ausentesLista: string[] = [];

    // casa cada Effecti no espelho via RPC (fuzzy muni + numeroCompra/sequencial + ano)
    for (const l of linhas) {
      if (!l.muni || !l.num) { semParse++; continue; }
      const { data: veredito } = await supabase.rpc("pncp_casa_effecti", { p_muni: l.muni, p_num: l.num, p_mod: l.mod, p_ano: l.ano });
      if (veredito === "casado") casados++;
      else if (veredito === "provavel") provaveis++;
      else if (veredito === "incerto") incertos++;
      else { ausentes++; if (ausentesLista.length < 25) ausentesLista.push(l.titulo); }
    }

    const denom = linhas.length - semParse;
    // cobertura efetiva = número bate OU órgão comprovadamente presente no PNCP
    const pct = denom > 0 ? Math.round(((casados + provaveis) / denom) * 1000) / 10 : null;

    const relatorio = {
      janela_desde: desde, janela_ate: new Date().toISOString().slice(0, 10),
      total_effecti: linhas.length, casados, provaveis, incertos, ausentes, sem_parse: semParse,
      pct_cobertura: pct, ausentes_amostra: ausentesLista,
    };

    if (gravar) {
      await supabase.from("licitacao_cobertura_diaria").upsert({
        data_ref: new Date().toISOString().slice(0, 10),
        ...relatorio, medido_em: new Date().toISOString(),
      }, { onConflict: "data_ref" });
    }

    return json({ ok: true, ...relatorio });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
