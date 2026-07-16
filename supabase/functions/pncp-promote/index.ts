// =====================================================================
// pncp-promote — leva os aprovados da triagem pro Sigma (substitui a Effecti).
//
// Pega da pncp_triagem os status aprovados (auto/humano) ainda não promovidos,
// insere na tabela `licitacoes` (fonte='pncp', dedup por licitacao_codigo =
// numero_controle_pncp), cria a tarefa na worklist, e baixa os PDFs do edital
// (/arquivos → bucket editais-pdfs, o mesmo que a UI lê). Marca a triagem como
// promovida. Idempotente: re-rodar não duplica (dedup + promovido_licitacao_id).
//
// Input: { perfil?: 'gss-saude', limite?: 20 }
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, tries = 3): Promise<any | null> {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (r.ok) return await r.json();
    } catch (_e) { /* retry */ }
    await sleep(500 * (t + 1));
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const perfil = body?.perfil || "gss-saude";
    const limite = Math.min(Number(body?.limite) || 20, 50);

    // aprovados ainda não promovidos
    const { data: aprovados } = await supabase
      .from("pncp_triagem")
      .select("numero_controle_pncp")
      .eq("perfil_slug", perfil)
      .in("status", ["auto_aprovado", "humano_aprovado"])
      .is("promovido_licitacao_id", null)
      .limit(limite);

    if (!aprovados?.length) return json({ ok: true, msg: "nada a promover", promovidos: 0 });

    const ncps = aprovados.map((a: any) => a.numero_controle_pncp);
    const { data: mirror } = await supabase.from("pncp_mirror").select("*").in("numero_controle_pncp", ncps);
    const byNcp = new Map((mirror || []).map((m: any) => [m.numero_controle_pncp, m]));

    let promovidos = 0, pulados = 0, comPdf = 0, erros = 0;

    for (const ncp of ncps) {
      const m: any = byNcp.get(ncp);
      if (!m) { erros++; continue; }
      try {
        // dedup: já existe card com esse controle PNCP?
        const { data: existe } = await supabase.from("licitacoes").select("id").eq("licitacao_codigo", ncp).maybeSingle();
        if (existe) {
          await supabase.from("pncp_triagem").update({ promovido_licitacao_id: existe.id, status: "promovido" })
            .eq("numero_controle_pncp", ncp).eq("perfil_slug", perfil);
          pulados++; continue;
        }

        const numeroCompra = String(m.raw?.numeroCompra || m.sequencial || "").trim();
        const numeroEdital = numeroCompra ? `${numeroCompra}/${m.ano}` : `${m.sequencial}/${m.ano}`;
        const titulo = `${m.modalidade_nome || "Licitação"} ${numeroEdital} - ${m.municipio || ""}/${m.uf || ""}`;
        const dataDisputa = m.data_encerramento_proposta || m.data_abertura_proposta || null;

        const { data: nova, error: insErr } = await supabase.from("licitacoes").insert({
          titulo,
          numero_edital: numeroEdital,
          orgao: m.orgao_razao_social || "Não informado",
          objeto: m.objeto_compra || titulo,
          licitacao_codigo: ncp,
          fonte: "pncp",
          municipio_uf: m.municipio && m.uf ? `${m.municipio} - ${m.uf}` : (m.municipio || null),
          subtipo_modalidade: m.modalidade_nome || null,
          cnpj_orgao: m.cnpj_orgao || null,
          valor_estimado: m.valor_estimado ?? null,
          data_disputa: dataDisputa,
          status: "captacao_edital",
          tipo_licitacao: "GSS",
        }).select("id").single();
        if (insErr || !nova) { erros++; continue; }
        const licId = nova.id;

        // tarefa na worklist (mesmo padrão do create manual)
        const diasAteDisputa = dataDisputa ? Math.ceil((new Date(dataDisputa).getTime() - Date.now()) / 864e5) : 99;
        await supabase.from("worklist_tarefas").insert({
          modulo: "licitacoes",
          titulo: `Captação de edital – ${titulo}`,
          descricao: (m.objeto_compra || "").slice(0, 300),
          status: "captacao_edital",
          prioridade: diasAteDisputa <= 10 ? "alta" : "media",
          data_limite: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10),
          licitacao_id: licId,
        }).then(() => null).catch(() => null);

        // baixa PDFs do edital (/arquivos → bucket editais-pdfs, o que a UI lê)
        const arqUrl = `https://pncp.gov.br/api/pncp/v1/orgaos/${m.cnpj_orgao}/compras/${m.ano}/${m.sequencial}/arquivos?pagina=1&tamanhoPagina=20`;
        const arqs = await fetchJson(arqUrl);
        if (Array.isArray(arqs) && arqs.length) {
          for (const a of arqs.slice(0, 10)) {
            try {
              const dl = await fetch(a.url || a.uri, { signal: AbortSignal.timeout(20000) });
              if (!dl.ok) continue;
              const buf = new Uint8Array(await dl.arrayBuffer());
              const nome = (a.titulo || `edital_${a.sequencialDocumento || 1}.pdf`).replace(/[^a-zA-Z0-9._-]/g, "_");
              const path = `${licId}/${nome}`;
              const up = await supabase.storage.from("editais-pdfs").upload(path, buf, { contentType: "application/pdf", upsert: true });
              if (!up.error) comPdf++;
            } catch (_e) { /* pula anexo que falhou */ }
          }
        }

        await supabase.from("pncp_triagem").update({ promovido_licitacao_id: licId, status: "promovido" })
          .eq("numero_controle_pncp", ncp).eq("perfil_slug", perfil);
        promovidos++;
      } catch (_e) { erros++; }
    }

    return json({ ok: true, promovidos, pulados_dedup: pulados, anexos_baixados: comPdf, erros });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
