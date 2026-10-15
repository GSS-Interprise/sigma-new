// Análise de edital pelo modelo da Bianca (T6 do plano licitacoes-contratos-gss.md, 14/10).
//
// Modelo do Gem da Bianca (15/10: ela indicou o card do PE 55/2026 de Quedas do Iguaçu como referência; as
// análises dos cards arquivados eram de outra ferramenta). Cinco partes: dados do edital (com precificação e
// qualificação técnica), tabela de precificação com as colunas "proposto GSS" a deliberar, análise geográfica,
// análise crítica com alertas e apontamentos para esclarecimento ou impugnação. A diferença pedida na reunião de 07/10 (50:49):
// cada informação diz de onde saiu no edital (item e página), e o que o edital não informa fica dito,
// nunca inventado. A análise regional vem do conhecimento geral da IA e sai marcada como estimativa.
//
// POST { licitacao_id, anexos?: [{bucket, path}] } com o usuário logado. Sem `anexos`, lê os PDFs do
// card (edital e termo de referência primeiro). Responde na hora com o id e grava o resultado em
// licitacao_analises em segundo plano: um edital grande passa de um minuto na IA.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const BUCKETS = new Set(["licitacoes-anexos", "editais-pdfs"]);
const LIMITE_TOTAL = 30 * 1024 * 1024; // soma dos PDFs mandados para a IA
const MAX_ARQUIVOS = 3;
const TEMPO_IA_MS = 340_000; // aborta antes do limite do servidor (400 s em segundo plano) para gravar o erro

const INSTRUCOES = `Você é especialista em licitações da GSS (Gestão de Serviços de Saúde), empresa que fornece médicos
(contratados como PJ) para hospitais, UBS e prefeituras. Leia o edital e os anexos (termo de referência, minuta, planilhas)
e escreva a análise no MODELO DA GSS abaixo (o mesmo do Gem da Bianca), em português, técnico e objetivo.

REGRA MAIS IMPORTANTE: toda informação tirada do edital termina com a fonte entre parênteses, no formato
<span class="fonte">(item 5.2.1 do TR, p. 12)</span>. "p." é a página do arquivo PDF (a primeira página do arquivo é a p. 1).
Se houver mais de um arquivo, diga qual (Edital, Termo de Referência, Minuta). Se o documento não numera os itens, use só a
página. Nunca use informação de outro edital, da internet ou de memória para preencher dados do edital. O que o edital não
informa fica "Não consta no edital" e entra em "faltou". Cálculos (prazos, valor por hora, volumetria) são permitidos e
devem dizer que são cálculo.

MODELO (nesta ordem; títulos em <h3>):

<h3>1. Dados do edital</h3> — uma <table> de duas colunas (Campo | Informação), com estas linhas, nesta ordem:
Modalidade; Órgão e Cidade Licitante; Objeto; Data limite para envio da proposta; Data prevista para a disputa; Tipo de
julgamento; Modo de disputa [diga se é aberto, fechado ou aberto-fechado, a duração e a prorrogação dos lances e o intervalo mínimo]; Haverá
tempo randômico?; Onde será executado o serviço; Valor Estimado [total e média mensal]; Portal ou local da sessão;
Distância até local com mais de 150 mil habitantes [população da cidade e polos próximos com distância e tempo; isto vem de
conhecimento geral, então termine com "(estimativa, conferir)"]; Data limite para esclarecimentos e impugnações [calcule:
3 dias úteis antes da abertura, salvo outro prazo no edital, e diga o dia da semana]; Vigência contratual; Exigência de
visita técnica; Data prevista para início dos serviços; Exigência de garantia; Legislação específica.
Depois uma linha de seção (<tr><td colspan="2"><b>REQUISITOS DE PRECIFICAÇÃO</b></td></tr>) e: Unidade de medida utilizada;
Volumetria total prevista; Volumetria mensal (aproximada) [diga quantos médicos por dia isso representa]; Volumetria anual;
Necessidade de retorno (consultas); Necessidade de equipamentos/materiais.
Depois a seção <b>QUALIFICAÇÃO TÉCNICA</b> e: Exige atestado de capacidade técnica; Médicos precisam de RQE; Médico
responsável técnico com RQE; Contratação exige vínculo CLT [a GSS trabalha com médicos PJ: diga se PJ é aceito];
CNDs exigidas; Exige CNES; Outros documentos para qualificação técnica [na habilitação e para o início da execução].
Por fim a seção <b>OBSERVAÇÕES</b>, com o que for relevante e não coube acima.

<h3>2. Precificação</h3> — uma <table> com as colunas: Item | Descrição do Serviço / Especialidade | Carga Horária Unitária |
Qtd. Mensal (Média) | Qtd. Anual | Valor Unitário Máximo Edital (R$) | Valor Máximo por Hora Edital (R$) | Valor Mensal
Estimado Edital (R$) | Valor Anual Total Estimado Edital (R$) | Valor Hora Mínimo Proposto GSS (R$) | Valor Unitário Proposto
GSS (R$) | Valor Total Anual Proposto GSS (R$). Uma linha por item ou lote; as três colunas "Proposto GSS" ficam "(A deliberar)";
última linha TOTAL. Valores no formato brasileiro. Valor por hora = valor unitário ÷ horas do serviço; jornada semanal vira
mensal com 4,5 semanas (20 h semanais = 90 h no mês). Abaixo da tabela, "Nota de cálculo da carga horária" em lista
simples (sem fórmulas LaTeX), com as horas por item e o total de horas presenciais e de sobreaviso.

<h3>3. Análise geográfica e demográfica (cidade licitante e logística)</h3> — comece com
<p><i>Estimativa a partir de conhecimento geral, sem fonte no edital. Conferir antes de usar.</i></p> e traga, em lista:
população local; distância aos polos médicos com mais de 100 mil e 150 mil habitantes (distância, tempo de viagem, se tem
faculdade de medicina e aeroporto); centros regionais secundários; e o impacto logístico para a GSS (de onde recrutar os
médicos, quantos médicos por dia a escala exige, necessidade de alojamento ou ajuda de deslocamento).

<h3>4. Análise crítica e alertas de risco</h3> — em lista, com fonte quando vier do edital:
escopo exclusivo de serviços médicos (se o objeto mistura enfermagem ou outras áreas, apontar a necessidade de impugnar para
desmembrar); modelo de contratação dos médicos (PJ x CLT); atratividade dos valores (compare o valor por hora do edital com
a faixa de mercado da região e marque essa faixa como "referência de mercado aproximada"); e os alertas críticos numerados
("Alerta Crítico 1 – título (item X do TR)"), cada um com o risco e o que a GSS precisa fazer.

<h3>5. Apontamentos para pedidos de esclarecimento ou impugnação</h3> — para cada ponto: <b>Fato:</b> (com fonte) e
<b>Ação recomendada:</b> (o que perguntar ou impugnar, com o fundamento da Lei 14.133/2021 quando couber). Se não houver
nada, diga que o edital não apresenta pontos que justifiquem pedido.

O que está entre colchetes [ ] é orientação para você: na primeira coluna da tabela vai só o nome do campo, sem os colchetes.

Formato do HTML: só <h3>, <p>, <b>, <i>, <ul>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td colspan>, <span class="fonte">,
<br>. Sem estilos, sem imagens, sem markdown.

Responda com a análise em HTML puro (sem cercas de código). Depois da análise, uma linha exatamente "### FALTOU" e, abaixo
dela, uma linha começando com "- " para cada informação que o edital não traz.`;

// trecho real do Gem da Bianca (PE 55/2026 de Quedas do Iguaçu/PR, 15/10), como referência de estilo e profundidade
const EXEMPLOS = `EXEMPLO (trechos, Gem da Bianca):
1. Dados do edital: Modalidade: Pregão Eletrônico nº 055/2026. Data limite para envio da proposta: 28/10/2026 até 08h59.
Data prevista para a disputa: 28/10/2026 às 09h00. Tipo de julgamento: Menor Preço por Item (Edital, item 10.10). Modo de
disputa: Aberto (Lei 14.133/2021, art. 56, I); lances de 10 minutos com prorrogações de 2 minutos; intervalo mínimo 1,00%.
Haverá tempo randômico? Não, o modo é aberto. Portal: Bolsa Nacional de Compras (BNC). Distância até local com mais de 150 mil
habitantes: Quedas do Iguaçu tem cerca de 30.735 habitantes; Cascavel/PR (348 mil) a 135 km, cerca de 2h. Data limite para
esclarecimentos e impugnações: 3 dias úteis antes da abertura (art. 164 da Lei 14.133/2021), ou seja 23/10/2026 (sexta-feira).
Exigência de garantia: isenta (Minuta, Cláusula Décima). REQUISITOS DE PRECIFICAÇÃO: Unidade de medida: plantão de 12h (item
01), plantão de 6h (item 02), 1 hora de consulta (item 03), plantão de 12h em sobreaviso (item 04). Volumetria mensal: 155
plantões de 12h/mês (4 a 5 médicos por dia). QUALIFICAÇÃO TÉCNICA: Médicos precisam de RQE: Não, mas para a urgência do
hospital é preciso 3 meses de experiência em emergência ou ACLS (item 6.9.2 do TR). Contratação exige vínculo CLT: Não, aceita
contrato social, CLT ou PJ (item 8.1.3 do Edital), atendendo à prática da GSS.
2. Precificação: 01 | Clínica Geral, plantão presencial de 12h | 12h | 155,00 | 1.860 | 1.813,37 | 151,11 | 281.072,35 |
3.372.868,20 | (A deliberar) | (A deliberar) | (A deliberar).
4. Alerta Crítico 1 – Tempo de resposta do sobreaviso (item 6.12 do TR): o médico tem 15 minutos para chegar após o
acionamento, o que obriga a GSS a manter o médico dentro da cidade (alojamento local).
5. Fato: o edital fala em menor preço por item (item 10.10), mas o TR agrupa os itens como "LOTE 01" (p. 3). Ação
recomendada: pedir esclarecimento no BNC para confirmar a disputa item a item (art. 47, II da Lei 14.133/2021).`;

// só o HTML combinado: tira script/estilo/eventos caso a IA devolva algo fora do formato
function limparHtml(h: string): string {
  return String(h || "")
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
}

// O tipo do arquivo nunca sai do nome: os anexos que vêm do Effecti/PNCP chegam sem extensão ("TR", "ETP",
// "AVISO"). Só descarta pelo nome o que com certeza não é documento; o tipo real vem do Storage (mimetype).
const NAO_DOC = /\.(png|jpe?g|gif|webp|zip|rar|7z|docx?|xlsx?|csv|txt|html?)$/i;

// edital e termo de referência primeiro; ata, proposta e recibo por último
function prioridade(nome: string): number {
  const n = nome.toLowerCase();
  if (/(^|[^a-z])(tr|termo)([^a-z]|$)|termo.?de.?refer/.test(n)) return 0;
  if (/edital|aviso|servi/.test(n)) return 1;
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
        .filter((a: any) => BUCKETS.has(a?.bucket) && typeof a?.path === "string" && a.path.startsWith(`${licitacaoId}/`) && !NAO_DOC.test(a.nome || a.path))
        .map((a: any) => ({ bucket: a.bucket, path: a.path, nome: a.nome || a.path.split("/").pop() }));
    } else {
      const { data: anexos } = await svc.from("licitacoes_anexos").select("arquivo_nome, arquivo_url, bucket").eq("licitacao_id", licitacaoId);
      escolhidos = (anexos ?? [])
        .filter((a: any) => !NAO_DOC.test(a.arquivo_nome || a.arquivo_url || "") && BUCKETS.has(a.bucket || "licitacoes-anexos"))
        .map((a: any) => ({ bucket: a.bucket || "licitacoes-anexos", path: a.arquivo_url, nome: a.arquivo_nome || a.arquivo_url.split("/").pop() }))
        .sort((a, b) => prioridade(a.nome) - prioridade(b.nome));
    }
    if (!escolhidos.length) return json({ ok: false, error: "Anexe o edital (PDF) no card antes de pedir a análise." }, 400);

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
        // O link é só para o que não cabe embutido: o Gemini falhou ao buscar links em 15/10 (URL_REJECTED, com e
        // sem ".pdf" no nome). Até 8 MB somados os arquivos vão embutidos, que a função converte sem estourar.
        const docs: any[] = []; const usados: any[] = []; const avisos: string[] = []; let total = 0; let embutido = 0;
        for (const a of escolhidos) {
          if (usados.length >= MAX_ARQUIVOS) break;
          const pasta = a.path.split("/").slice(0, -1).join("/");
          const nomeArq = a.path.split("/").pop()!;
          const { data: lista } = await svc.storage.from(a.bucket).list(pasta, { search: nomeArq, limit: 5 });
          const meta = (lista ?? []).find((o: any) => o.name === nomeArq)?.metadata ?? {};
          const tam = Number(meta.size ?? 0);
          // o Storage guarda o tipo real; sem tipo gravado, aceita (a IA recusa o que não for documento)
          if (!tam || (meta.mimetype && !/pdf|octet-stream/i.test(String(meta.mimetype)))) continue;
          if (total + tam > LIMITE_TOTAL) { avisos.push(`${a.nome}: ficou de fora para não passar de 30 MB no total.`); continue; }
          let url: string | null = null;
          if (embutido + tam <= 8 * 1024 * 1024) {
            const { data: arq } = await svc.storage.from(a.bucket).download(a.path);
            if (!arq) continue;
            embutido += tam;
            url = `data:application/pdf;base64,${encodeBase64(new Uint8Array(await arq.arrayBuffer()))}`;
          } else {
            const { data: link } = await svc.storage.from(a.bucket).createSignedUrl(a.path, 60 * 30);
            url = link?.signedUrl ?? null;
          }
          if (!url) continue;
          total += tam;
          const n = usados.length + 1;
          docs.push({ type: "text", text: `ARQUIVO ${n}: ${a.nome}` });
          docs.push({ type: "image_url", image_url: { url } });
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
            messages: [
              { role: "system", content: `${INSTRUCOES}${extra}\n\n${EXEMPLOS}` },
              { role: "user", content: [{ type: "text", text: `${contexto}\nFaça a análise deste edital no modelo da GSS.` }, ...docs] },
            ],
          }),
        });
        clearTimeout(relogio);
        if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const resp = await r.json();
        // HTML puro + "### FALTOU": a análise longa tem aspas demais nas tabelas para vir dentro de JSON
        // (o JSON quebrava na posição 6.561 no teste de 15/10)
        const bruto = String(resp.choices?.[0]?.message?.content || "").replace(/^\s*```(?:html)?\s*|\s*```\s*$/g, "");
        const [parteHtml, parteFaltou = ""] = bruto.split(/^\s*#{2,3}\s*FALTOU\s*$/m);
        const lido = {
          html: parteHtml.replace(/```(?:html)?/g, "").trim(),
          faltou: parteFaltou.split("\n").map((l) => l.replace(/^\s*[-*]\s*/, "").trim()).filter(Boolean),
        };
        if (lido.html.length < 200) throw new Error("A IA não devolveu a análise.");
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
