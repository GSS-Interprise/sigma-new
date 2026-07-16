// =====================================================================
// pncp-classificar — estágio de PRECISÃO da relevância (IA gpt-4o).
//
// O filtro keyword (pncp_relevantes) tem recall alto mas precisão ~55%
// (deixa passar "curso de psicologia", "locação de imóvel de UBS", compra de
// reagente). Aqui a IA lê o objeto e decide se é DE FATO uma oportunidade
// para uma empresa que aloca médicos/profissionais de saúde a hospitais.
//
// Classifica em batch (1 chamada p/ N objetos → barato). Grava em pncp_triagem
// com status ia_aprovado / ia_rejeitado. Só toca candidatos ainda sem triagem.
//
// Input: { perfil?: 'gss-saude', limite?: 40, batch?: 10 }
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ ok: false, error: "OPENAI_API_KEY ausente" }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const perfil = body?.perfil || "gss-saude";
    const limite = Math.min(Number(body?.limite) || 40, 120);
    const batchSize = Math.min(Number(body?.batch) || 10, 20);

    // contexto do perfil (o que o cliente considera relevante) — vem do banco
    const { data: perfilRow } = await supabase
      .from("licitacao_captura_perfis").select("nome, cliente").eq("slug", perfil).maybeSingle();
    const contextoCliente = perfilRow?.nome || perfil;

    // candidatos do estágio recall que ainda NÃO têm triagem
    const { data: candidatos } = await supabase
      .rpc("pncp_relevantes", { p_slug: perfil })
      .select("numero_controle_pncp, objeto_compra, modalidade_nome, orgao_razao_social, municipio, uf")
      .limit(limite);

    if (!candidatos?.length) return json({ ok: true, msg: "sem candidatos", classificados: 0 });

    const ncps = candidatos.map((c: any) => c.numero_controle_pncp);
    const { data: jaTriados } = await supabase
      .from("pncp_triagem").select("numero_controle_pncp").eq("perfil_slug", perfil).in("numero_controle_pncp", ncps);
    const triadoSet = new Set((jaTriados || []).map((t: any) => t.numero_controle_pncp));
    const novos = candidatos.filter((c: any) => !triadoSet.has(c.numero_controle_pncp));

    if (!novos.length) return json({ ok: true, msg: "todos já triados", classificados: 0 });

    let classificados = 0, aprovados = 0, erros = 0;
    const debugErros: string[] = [];

    for (let i = 0; i < novos.length; i += batchSize) {
      const lote = novos.slice(i, i + batchSize);
      const listaObjetos = lote.map((c: any, idx: number) =>
        `${idx}. Objeto: "${(c.objeto_compra || "").slice(0, 400)}" | Modalidade: ${c.modalidade_nome || "?"} | Órgão: ${c.orgao_razao_social || "?"}`
      ).join("\n");

      const prompt = `Você classifica licitações públicas para "${contextoCliente}" — uma empresa que PRESTA SERVIÇOS MÉDICOS: aloca médicos e profissionais de saúde para hospitais/unidades, plantões, credenciamento de profissionais, gestão de unidades de saúde.

RELEVANTE = contratação de PRESTAÇÃO DE SERVIÇO médico/saúde (plantão, mão de obra médica, credenciamento de profissionais de saúde, gestão de unidade, serviços hospitalares).
NÃO RELEVANTE = compra de material/medicamento/equipamento, alimentação/refeição, locação de imóvel, obra/reforma, cursos, serviços não-médicos (limpeza, transporte, TI), ou serviço de saúde não-médico (psicologia isolada, veterinária).

Para cada item, responda se é uma oportunidade real para essa empresa.

${listaObjetos}

Responda APENAS JSON: {"resultados":[{"i":0,"relevante":true,"motivo":"curto"},...]}`;

      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "gpt-4o", temperature: 0, max_tokens: 1500,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (!resp.ok) { erros++; debugErros.push(`openai ${resp.status}: ${(await resp.text()).slice(0,150)}`); continue; }
        const data = await resp.json();
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
        const resultados: any[] = parsed?.resultados || [];

        const rows = lote.map((c: any, idx: number) => {
          const r = resultados.find((x) => x.i === idx) || {};
          const relevante = r.relevante === true;
          if (relevante) aprovados++;
          return {
            numero_controle_pncp: c.numero_controle_pncp,
            perfil_slug: perfil,
            ia_relevante: relevante,
            ia_motivo: (r.motivo || "").slice(0, 300),
            ia_modelo: "gpt-4o",
            ia_classificado_em: new Date().toISOString(),
            status: relevante ? "ia_aprovado" : "ia_rejeitado",
          };
        });
        const { error } = await supabase.from("pncp_triagem").upsert(rows, { onConflict: "numero_controle_pncp,perfil_slug" });
        if (error) { erros++; debugErros.push(`upsert: ${error.message}`); } else classificados += rows.length;
      } catch (e: any) { erros++; debugErros.push(`catch: ${String(e?.message || e).slice(0,150)}`); }
    }

    return json({ ok: true, candidatos_novos: novos.length, classificados, aprovados, rejeitados: classificados - aprovados, erros, debug: debugErros.slice(0, 5) });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
