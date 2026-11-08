// Vínculos do médico no CNES (onde trabalha, CBO, carga horária) pela API pública do CNES.
// Chamado pelo botão "Buscar no CNES" da ficha. Grava em medico_cnes.
//   { lead_id }        → busca pelo nome do lead; homônimos são filtrados pela UF do CRM
//   { lead_id, cns }   → a pessoa escolheu entre homônimos: busca direto pelo CNS
// A VPS da GSS não alcança cnes.datasus.gov.br (timeout); daqui (Supabase) responde normal.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const CNES = "https://cnes.datasus.gov.br/services/";
const MAX_CANDIDATOS = 6;

type Candidato = { id: string; nome: string; cns: string };
type Detalhe = { nome: string; cns: string; cmptAtual?: string; vinculos?: any[] };

async function cnes(caminho: string) {
  const r = await fetch(CNES + caminho, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://cnes.datasus.gov.br/", Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`cnes_${r.status}`);
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}

// Só o que a ficha mostra; o CNES devolve ~25 campos por vínculo.
const vinculo = (v: any) => ({
  estabelecimento: v.noFant, cnes: v.cnes, municipio: v.noMun, uf: v.estado, cbo: v.dsCbo,
  sus: v.tpSusNaoSus === "S", vinculacao: v.vinculacao, ch_amb: v.chAmb ?? 0, ch_hosp: v.chHosp ?? 0, ch_outros: v.chOutros ?? 0,
  natureza: v.dsNatJur,
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = auth ? await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth) : { data: { user: null } };
  if (!user) return json({ ok: false, error: "sem_permissao" }, 401);

  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const leadId = String(body.lead_id || "");
  const cnsEscolhido = String(body.cns || "").replace(/\D/g, "");
  if (!leadId) return json({ ok: false, error: "lead_id" }, 400);

  const { data: lead } = await svc.from("leads").select("nome, crm, uf").eq("id", leadId).maybeSingle();
  if (!lead?.nome) return json({ ok: false, error: "lead_nao_encontrado" }, 404);
  const uf = String(String(lead.crm || "").split("/")[1] || lead.uf || "").toUpperCase();

  const gravar = async (linha: Record<string, unknown>) => {
    const { error } = await svc.from("medico_cnes").upsert({
      lead_id: leadId, cns: null, nome_cnes: null, competencia: null, vinculos: [], candidatos: [], erro: null,
      ...linha, consultado_em: new Date().toISOString(), consultado_por: user.id,
    });
    if (error) throw error;
  };

  try {
    const lista: Candidato[] = cnsEscolhido
      ? (await cnes(`profissionais?cns=${cnsEscolhido}`)) || []
      : (await cnes(`profissionais?nome=${encodeURIComponent(String(lead.nome).trim().toUpperCase())}`)) || [];

    if (lista.length === 0) {
      await gravar({ status: "nao_encontrado" });
      return json({ ok: true, status: "nao_encontrado" });
    }

    const detalhes: Detalhe[] = [];
    for (const c of lista.slice(0, MAX_CANDIDATOS)) detalhes.push({ ...(await cnes(`profissionais/${c.id}`)), cns: c.cns });

    // Homônimo: fica quem tem vínculo na UF do CRM. Sobrou um só (ou só existia um), é ele.
    const naUf = uf ? detalhes.filter((d) => (d.vinculos || []).some((v) => v.estado === uf)) : [];
    const escolhido = detalhes.length === 1 ? detalhes[0] : naUf.length === 1 ? naUf[0] : null;

    if (escolhido) {
      const vinculos = (escolhido.vinculos || []).map(vinculo);
      await gravar({
        status: "ok", cns: escolhido.cns, nome_cnes: escolhido.nome,
        competencia: String(escolhido.cmptAtual || "").replace(/^[-\s]*Competência\s*/i, "") || null, vinculos,
      });
      return json({ ok: true, status: "ok", vinculos: vinculos.length });
    }

    const candidatos = (naUf.length > 1 ? naUf : detalhes).map((d) => ({
      cns: d.cns, nome: d.nome,
      locais: [...new Set((d.vinculos || []).map((v) => `${v.noMun}-${v.estado}`))].slice(0, 3),
    }));
    await gravar({ status: "ambiguo", candidatos });
    return json({ ok: true, status: "ambiguo", candidatos: candidatos.length });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await gravar({ status: "erro", erro }).catch(() => {});
    return json({ ok: false, error: erro }, 502);
  }
});
