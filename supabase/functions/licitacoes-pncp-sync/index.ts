// TESTE DE 2 DIAS (13-15/07): captura licitações do PNCP (Portal Nacional de Contratações
// Públicas — API pública gratuita da Lei 14.133) pra rodar EM PARALELO com a Effecti e medir
// se o PNCP cobre as mesmas oportunidades (sem perder nada) antes de cortar a Effecti.
//
// Não toca na tabela `licitacoes` de produção — grava em `licitacoes_pncp_staging`.
// Filtra pelo que a GSS realmente faz (serviços médicos), não "saúde" genérico.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const PNCP = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";

// Modalidades que trazem serviços médicos: 4=Concorrência-Elet, 6=Pregão-Elet, 8=Dispensa,
// 9=Inexigibilidade, 12=Credenciamento (muito usado em saúde).
const MODALIDADES = [4, 6, 8, 9, 12];

// Palavras-chave do que a GSS presta (normalizadas: minúsculas, sem acento).
const KEYWORDS = [
  "servico medico", "servicos medicos", "prestacao de servico medico", "mao de obra medica",
  "plantao", "plantonista", "escala medica", "profissional medico", "profissionais medicos",
  "atendimento medico", "consulta medica", "clinica medica", "pronto atendimento", "pronto-socorro",
  "radiologia", "telemedicina", "laudo", "exame de imagem", "tomografia", "ressonancia",
  "ultrassonografia", "ultrassom", "anestesiolog", "cirurgia", "uti", "terapia intensiva",
  "medico especialista", "especialidade medica", "gestao em saude", "recursos humanos em saude",
];

const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// match de PALAVRA INTEIRA (evita "uti" casar dentro de "gratuito"/"restituicao").
const KW_RE = KEYWORDS.map((k) => ({ k, re: new RegExp(`(^|[^a-z0-9])${esc(k)}([^a-z0-9]|$)`) }));
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const dias = Math.min(Number(body?.dias) || 3, 10);
    const maxPaginas = Math.min(Number(body?.maxPaginas) || 6, 15);
    const hoje = new Date();
    const ini = new Date(hoje); ini.setDate(hoje.getDate() - dias);
    const dataInicial = ymd(ini), dataFinal = ymd(hoje);

    let varridas = 0, casadas = 0, inseridas = 0, erros = 0;
    const registros: any[] = [];

    for (const mod of MODALIDADES) {
      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        try {
          const url = `${PNCP}?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${mod}&pagina=${pagina}&tamanhoPagina=50`;
          const r = await fetch(url, { headers: { Accept: "application/json" } });
          if (!r.ok) break;
          const j = await r.json().catch(() => ({}));
          const data: any[] = j?.data ?? [];
          if (data.length === 0) break;
          varridas += data.length;

          for (const x of data) {
            const objeto = x?.objetoCompra || "";
            const alvo = norm(objeto);
            const match = KW_RE.filter((x) => x.re.test(alvo)).map((x) => x.k);
            if (match.length === 0) continue;
            casadas++;
            registros.push({
              numero_controle_pncp: x?.numeroControlePNCP || null,
              objeto,
              orgao: x?.orgaoEntidade?.razaoSocial || x?.orgaoEntidade?.razaosocial || null,
              cnpj_orgao: x?.orgaoEntidade?.cnpj || null,
              uf: x?.unidadeOrgao?.ufSigla || null,
              municipio: x?.unidadeOrgao?.municipioNome || null,
              valor_estimado: x?.valorTotalEstimado ?? null,
              modalidade: x?.modalidadeNome || String(mod),
              data_abertura: x?.dataAberturaProposta || null,
              data_encerramento: x?.dataEncerramentoProposta || null,
              url_pncp: x?.numeroControlePNCP ? `https://pncp.gov.br/app/editais/${x.numeroControlePNCP}` : null,
              palavras_match: match,
              raw: x,
            });
          }
          if (data.length < 50) break; // última página
        } catch (_e) { erros++; }
      }
    }

    // Upsert em lote (dedup por numero_controle_pncp).
    for (let i = 0; i < registros.length; i += 200) {
      const lote = registros.slice(i, i + 200).filter((r) => r.numero_controle_pncp);
      if (!lote.length) continue;
      const { error } = await supabase.from("licitacoes_pncp_staging")
        .upsert(lote, { onConflict: "numero_controle_pncp", ignoreDuplicates: false });
      if (error) erros++; else inseridas += lote.length;
    }

    return json({ ok: true, periodo: `${dataInicial}-${dataFinal}`, varridas, casadas_keyword: casadas, upsertadas: inseridas, erros });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
