// =====================================================================
// pncp-comparador — CANÁRIO de cobertura Effecti × espelho PNCP.
//
// Prova (ou refuta) que podemos cortar a Effecti. Pra cada licitação que a
// Effecti trouxe (fonte='n8n' em licitacoes), verifica se está no espelho.
//
// A lógica toda vive no SQL (pncp_cobertura_medir → resolve_municipio_ibge
// → pncp_casa_effecti_ibge). Aqui só agenda e grava. Isso é de propósito:
// dá pra auditar o número rodando a função à mão, e foi assim que os
// defeitos do critério anterior apareceram.
//
// Buckets:
//   casado    = nº do edital + ano + modalidade batem no espelho
//   provavel  = nº + ano batem, modalidade diverge (a Effecti classifica
//               modalidade de forma inconsistente; o número manda)
//   incerto   = município ESTÁ no PNCP mas o número não foi achado →
//               revisar (parse do título ou edital fora do PNCP)
//   ausente   = município sem NENHUM registro no espelho → único sinal
//               real de fonte fora do PNCP. É o número que decide o corte.
//   sem_parse = município não resolve pro IBGE (consórcio, cotação
//               estadual sem município) → fora do denominador
//
// Histórico: a versão anterior casava município por similarity de nome e
// dava 'provavel' sem olhar o número do edital, o que inflava a cobertura
// pra 100%. Ver docs/arquitetura/licitacoes-espelho-pncp.md.
//
// Input: { desde?: 'YYYY-MM-DD' (default 8d), gravar?: true }
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const gravar = body?.gravar !== false;
    const desde = body?.desde || new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
    const hoje = new Date().toISOString().slice(0, 10);

    const { data: rel, error } = await supabase.rpc("pncp_cobertura_medir", { p_desde: desde });
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!rel) return json({ ok: true, msg: "sem Effecti na janela", desde });

    const relatorio = { janela_desde: desde, janela_ate: hoje, ...rel };

    if (gravar) {
      const { error: e2 } = await supabase.from("licitacao_cobertura_diaria").upsert({
        data_ref: hoje, ...relatorio, medido_em: new Date().toISOString(),
      }, { onConflict: "data_ref" });
      if (e2) return json({ ok: false, error: e2.message }, 500);
    }

    return json({ ok: true, ...relatorio });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
