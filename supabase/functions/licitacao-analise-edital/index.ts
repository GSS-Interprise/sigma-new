// Análise de edital pelo modelo da Bianca (T6 do plano licitacoes-contratos-gss.md, 14/10).
//
// O modelo foi reconstruído das análises que a equipe já colava nos cards a partir do Gem do Gemini da
// Bianca (229 cards da GSS; a estrutura se repete: objeto, base de execução, regras da jornada, RQE,
// tabela por item/lote com o valor deliberado em branco, valor por hora, prazo de início, órgão
// pagador/vínculo e a análise de atração regional). A diferença pedida na reunião de 07/10 (50:49):
// cada informação diz de onde saiu no edital (item e página), e o que o edital não informa fica dito,
// nunca inventado. A análise regional vem do conhecimento geral da IA e sai marcada como estimativa.
//
// POST { licitacao_id, anexos?: [{bucket, path}] } com o usuário logado. Sem `anexos`, lê os PDFs do
// card (edital e termo de referência primeiro). Responde na hora com o id e grava o resultado em
// licitacao_analises em segundo plano: um edital grande passa de um minuto na IA.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const BUCKETS = new Set(["licitacoes-anexos", "editais-pdfs"]);
const LIMITE_TOTAL = 30 * 1024 * 1024; // soma dos PDFs mandados para a IA
const MAX_ARQUIVOS = 3;
const TEMPO_IA_MS = 125_000; // aborta antes do limite do servidor para gravar o erro

const INSTRUCOES = `Você é analista de licitações da GSS (Gestão de Serviços de Saúde), empresa que fornece médicos para
hospitais, UBS e prefeituras. Leia o edital e os anexos (termo de referência, planilhas) e escreva a análise no
MODELO DA GSS abaixo, em português, direto e objetivo, como a equipe de licitações escreve.

REGRA MAIS IMPORTANTE: toda informação tirada do edital termina com a fonte entre parênteses, no formato
<span class="fonte">(item 5.2.1 do TR, p. 12)</span>. "p." é a página do arquivo PDF (a primeira página do arquivo
é a p. 1). Se houver mais de um arquivo, diga qual: (Termo de Referência, item 4.1, p. 3). Se o documento não numera
os itens, use só a página. Nunca use informação de outro edital, da internet ou de memória para preencher dados do
edital. Se o edital não informa algo do modelo, escreva "Não consta no edital" naquele ponto e inclua em "faltou".

MODELO DA GSS (nesta ordem; use <h3> para os títulos em negrito):
1. Resumo do objeto (sem título): uma frase com especialidade, carga (horas/plantões/consultas), regime
   (presencial, remoto, sobreaviso) e local. Na linha seguinte, a modalidade (Pregão eletrônico, Pregão presencial,
   Credenciamento, Dispensa...).
2. <h3>BASE DE EXECUÇÃO</h3>: unidade, endereço, cidade/UF e forma de execução.
3. Regras da jornada em lista (<ul>): dias e horários, escala, visita diária, acionamento, metas de atendimento,
   o que for regra de trabalho do médico.
4. <h3>RQE</h3>: "OBRIGATÓRIO" ou "NÃO OBRIGATÓRIO / MÉDICO GENERALISTA", com a especialidade e a fonte. Se o edital
   não diz, "Não consta no edital".
5. Tabela (<table> com <thead>/<tbody>) com as colunas: Item / Lote | Descrição / Objeto | Qtd. semanal | Qtd. mensal
   ou anual | Un. | Valor de Referência (Máximo) | Valor Total Estimado | Valor Deliberado. Ajuste o nome das colunas de
   quantidade à unidade do edital (horas, plantões, consultas). Uma linha por item ou lote. A coluna "Valor
   Deliberado" fica SEMPRE vazia: é a equipe que preenche. Valores em R$ no formato brasileiro.
6. Linhas soltas, cada uma em <p>, quando o edital trouxer: "Valor por hora do profissional: R$ ..." (calcule a
   partir do valor de referência e da carga, e diga que é cálculo GSS). Regra da GSS para o mês: 4,5 semanas, ou seja,
   horas mensais = horas semanais × 4,5 (20 h semanais = 90 h no mês; 40 h = 180 h). Plantão de 12 h ou 24 h: valor do
   plantão dividido pelas horas do plantão. Consulta: informe o valor por consulta em vez do valor por hora; "Prazo para Início dos Serviços: ...";
   "ÓRGÃO PAGADOR: ..."; "Divisão com outros credenciados (regras do rodízio): ..."; "Forma de vínculo/contratação dos
   profissionais: ..." (CLT, sócio, PJ; o que é proibido); exigências de habilitação técnica que pesam para a GSS
   (atestados, registro no CRM do estado, visita técnica); prazo de vigência e reajuste.
7. <h3>Análise de Atração Regional (Mapeamento de Médicos)</h3>: a cidade base (porte, população aproximada, se tem
   faculdade de medicina) e 2 a 4 polos próximos de onde a GSS pode trazer médicos, cada um com distância e tempo de
   carro aproximados, população e faculdades de medicina, terminando na capital do estado. Esta parte NÃO vem do
   edital: comece com <p><i>Estimativa a partir de conhecimento geral, sem fonte no edital. Conferir antes de usar.</i></p>
   e não ponha fonte de edital nela.

Formato do HTML: só <h3>, <p>, <b>, <i>, <ul>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <span class="fonte">,
<br>. Sem estilos, sem imagens, sem markdown.

Responda SÓ com JSON: {"html": "<a análise em HTML>", "faltou": ["o que o edital não informa", ...]}.`;

// duas análises reais da equipe (Gem da Bianca), só como referência de estilo e de profundidade
const EXEMPLOS = `EXEMPLO 1 (cardiologia, sobreaviso, Dourados/MS):
Sobreaviso 24h Cardiologia para atendimento em regime de plantão de sobreaviso de 24 horas no Hospital da Vida - FUNSAUD, em Dourados/MS.
BASE DE EXECUÇÃO: Hospital da Vida de Dourados - FUNSAUD, Rua Toshinobu Katayama, nº 949, Jardim Caramuru, Dourados/MS. Atendimento presencial para intercorrências, visitas diárias e avaliações a partir do acionamento do sobreaviso de 24 horas.
RQE: OBRIGATÓRIO. Conforme o item 5.2.1 do Termo de Referência, a contratada deverá manter profissionais com RQE em Cardiologia.
Tabela: 01 | Serviços médicos especializados em Cardiologia, sobreaviso de 24h, Hospital da Vida | 7 plantões | 365 plantões | Plantão 24h | R$ 1.310,79 | R$ 478.438,35 | (vazio)
A Visita Diária Fixa (Obrigatória): o médico da escala vai presencialmente ao hospital todos os dias pela manhã para a visita aos internados da Cardiologia, evoluções e prescrições, até as 11h00.
O Acionamento de Emergência (Sob Demanda): após a rotina da manhã fica em regime remoto e só volta se houver urgência, intercorrência ou parecer de risco cirúrgico.
Forma de Vínculo/Contratação dos Profissionais: CLT, sócios no contrato social ou PJ com contrato civil individualizado (itens 5.2.4.3 e 8.12 do TR); proibido SCP ou contratação oculta (item 5.2.4.2 do TR).
Análise de Atração Regional: Dourados (MS) - Cidade Base: cerca de 243 mil habitantes, polo de saúde do sul do estado, faculdades de Medicina (UFGD e UEMS). Ponta Porã (MS): ~120 km (~1h40), cerca de 90 mil habitantes, polo universitário de fronteira. Campo Grande (MS) - Capital: ~230 km (~3h00), mais de 900 mil habitantes, UFMS, Uniderp, UEMS.

EXEMPLO 2 (clínico geral 20h, UBS, David Canabarro/RS):
Clínico geral (20 horas semanais), com capacitação para inserção e retirada de implanon, presencial na UBS de David Canabarro/RS.
BASE DE EXECUÇÃO: UBS de David Canabarro - RS, Rua Ernesto Rissato, nº 265; ambulatorial em sala de pequenos procedimentos do município.
Jornada: 20 horas semanais dedicadas ao planejamento reprodutivo; dias e horários definidos pela Secretaria de Saúde; consulta de elegibilidade, procedimento e acompanhamento pós-procedimento.
RQE: NÃO OBRIGATÓRIO / MÉDICO GENERALISTA.
Tabela: 1 | Médico clínico geral 20h com capacitação para implanon | 20 horas | 12 meses (90 horas mensais) | Mês | R$ 11.122,43 | R$ 133.469,16 | (vazio)
Valor por hora do profissional: R$ 123,58
Prazo para Início dos Serviços: 5 dias corridos após a finalização do processo para apresentar o profissional habilitado.
Análise de Atração Regional: David Canabarro (RS) - Cidade Base: cerca de 4.000 habitantes, sem faculdade de medicina. Passo Fundo (RS): ~50 km (~45 min), cerca de 206 mil habitantes, UPF e UFFS, núcleo ideal de captação. Porto Alegre (RS) - Capital: ~280 km (~3h45), UFRGS, UFCSPA, PUC-RS.`;

// só o HTML combinado: tira script/estilo/eventos caso a IA devolva algo fora do formato
function limparHtml(h: string): string {
  return String(h || "")
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
}

// edital e termo de referência primeiro; ata, proposta e recibo por último
function prioridade(nome: string): number {
  const n = nome.toLowerCase();
  if (/(^|[^a-z])(tr|termo)([^a-z]|$)|termo.?de.?refer/.test(n)) return 0;
  if (/edital/.test(n)) return 1;
  if (/anexo|planilha/.test(n)) return 2;
  if (/(ata|proposta|recibo|impugna|esclarec|resposta)/.test(n)) return 4;
  return 3;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // usuário logado (a função não fica pública); chave de serviço só para teste
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth);
  let servico = false;
  if (!user && auth) {
    const { data, error } = await createClient(supabaseUrl, auth, { auth: { persistSession: false } }).from("integracao_segredos").select("nome").limit(1);
    servico = !error && Array.isArray(data);
  }
  if (!user && !servico) return json({ ok: false, error: "Faça login de novo no Sigma." }, 401);

  try {
    const body = await req.json();
    const licitacaoId = String(body.licitacao_id || "");
    const { data: card } = await svc.from("licitacoes").select("id, numero_edital, orgao, municipio_uf, objeto_resumo, titulo").eq("id", licitacaoId).maybeSingle();
    if (!card) return json({ ok: false, error: "Card não encontrado." }, 404);

    // arquivos: os escolhidos na tela ou os PDFs do card, na ordem de prioridade
    let escolhidos: { bucket: string; path: string; nome: string }[] = [];
    if (Array.isArray(body.anexos) && body.anexos.length) {
      escolhidos = body.anexos
        .filter((a: any) => BUCKETS.has(a?.bucket) && typeof a?.path === "string" && a.path.startsWith(`${licitacaoId}/`) && /\.pdf$/i.test(a.nome || a.path))
        .map((a: any) => ({ bucket: a.bucket, path: a.path, nome: a.nome || a.path.split("/").pop() }));
    } else {
      const { data: anexos } = await svc.from("licitacoes_anexos").select("arquivo_nome, arquivo_url, bucket").eq("licitacao_id", licitacaoId);
      escolhidos = (anexos ?? [])
        .filter((a: any) => /\.pdf$/i.test(a.arquivo_nome || a.arquivo_url || "") && BUCKETS.has(a.bucket || "licitacoes-anexos"))
        .map((a: any) => ({ bucket: a.bucket || "licitacoes-anexos", path: a.arquivo_url, nome: a.arquivo_nome || a.arquivo_url.split("/").pop() }))
        .sort((a, b) => prioridade(a.nome) - prioridade(b.nome));
    }
    if (!escolhidos.length) return json({ ok: false, error: "Anexe o edital em PDF no card antes de pedir a análise." }, 400);

    const { data: linha, error: eIns } = await svc.from("licitacao_analises")
      .insert({ licitacao_id: licitacaoId, status: "processando", criado_por: user?.id ?? null, anexos: [] })
      .select("id").single();
    if (eIns) throw eIns;

    const trabalho = (async () => {
      try {
        // baixa até 3 PDFs dentro do limite total
        // A função não lê nem converte o PDF: manda um link temporário e a IA baixa o arquivo. Converter um
        // edital grande (12,5 MB da PM-SP, 14/10) estourava o limite de processamento da função e a tarefa
        // morria sem gravar erro. O tamanho vem dos metadados do Storage, sem baixar o arquivo.
        const docs: any[] = []; const usados: any[] = []; const avisos: string[] = []; let total = 0;
        for (const a of escolhidos) {
          if (usados.length >= MAX_ARQUIVOS) break;
          const pasta = a.path.split("/").slice(0, -1).join("/");
          const nomeArq = a.path.split("/").pop()!;
          const { data: lista } = await svc.storage.from(a.bucket).list(pasta, { search: nomeArq, limit: 5 });
          const tam = Number((lista ?? []).find((o: any) => o.name === nomeArq)?.metadata?.size ?? 0);
          if (!tam) continue;
          if (total + tam > LIMITE_TOTAL) { avisos.push(`${a.nome}: ficou de fora para não passar de 30 MB no total.`); continue; }
          const { data: link } = await svc.storage.from(a.bucket).createSignedUrl(a.path, 60 * 30);
          if (!link?.signedUrl) continue;
          total += tam;
          const n = usados.length + 1;
          docs.push({ type: "text", text: `ARQUIVO ${n}: ${a.nome}` });
          docs.push({ type: "image_url", image_url: { url: link.signedUrl } });
          usados.push({ bucket: a.bucket, path: a.path, nome: a.nome });
        }
        if (!usados.length) throw new Error(avisos[0] || "Nenhum PDF do card pôde ser aberto.");

        // ajustes da equipe sem novo deploy (ex.: o texto do Gem da Bianca, se ela mandar)
        const { data: cfg } = await svc.from("config_lista_items").select("valor").eq("campo_nome", "licitacao_analise_instrucoes").maybeSingle();
        const extra = cfg?.valor ? `\n\nINSTRUÇÕES ADICIONAIS DA EQUIPE:\n${cfg.valor}` : "";

        const modelo = "google/gemini-2.5-pro";
        const parar = new AbortController();
        const relogio = setTimeout(() => parar.abort(), TEMPO_IA_MS);
        const contexto = `Card: ${card.titulo || ""} · Edital ${card.numero_edital || "?"} · ${card.orgao || ""} · ${card.municipio_uf || ""}`;
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          signal: parar.signal,
          headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelo,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: `${INSTRUCOES}${extra}\n\n${EXEMPLOS}` },
              { role: "user", content: [{ type: "text", text: `${contexto}\nFaça a análise deste edital no modelo da GSS.` }, ...docs] },
            ],
          }),
        });
        clearTimeout(relogio);
        if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const resp = await r.json();
        const txt = String(resp.choices?.[0]?.message?.content || "{}").replace(/^```(?:json)?\s*|\s*```$/g, "");
        const lido = JSON.parse(txt);
        if (!lido?.html) throw new Error("A IA não devolveu a análise.");
        await svc.from("licitacao_analises").update({
          status: "pronta", html: limparHtml(lido.html), faltou: [...avisos, ...(Array.isArray(lido.faltou) ? lido.faltou : [])],
          anexos: usados, modelo: modelo.replace("google/", ""), concluido_em: new Date().toISOString(),
        }).eq("id", linha.id);
      } catch (e: any) {
        console.error("analise", e?.message || e);
        const msg = e?.name === "AbortError" ? "a IA demorou demais para ler o edital. Tente de novo; se repetir, anexe só o termo de referência." : String(e?.message || e);
        await svc.from("licitacao_analises").update({ status: "erro", erro: msg.slice(0, 500), concluido_em: new Date().toISOString() }).eq("id", linha.id);
      }
    })();
    // responde já; a IA termina em segundo plano
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(trabalho); else await trabalho;
    return json({ ok: true, analise_id: linha.id });
  } catch (e: any) {
    console.error(e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
