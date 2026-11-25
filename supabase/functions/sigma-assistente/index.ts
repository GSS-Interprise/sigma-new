// Assistente de IA dentro do Sigma (docs/arquitetura/assistente-ia-sigma.md, 21/11/2026).
// POST { mensagem, conversa_id?, pagina?, campanha_id? } com o login da pessoa (JWT do Supabase).
// - Só para a lista nominal de assistente_liberados (403 para o resto). pagina = rota com a busca; a campanha aberta
//   (campanha_id ou ?campanha= na rota) muda o recorte: pergunta sem campanha citada é sobre ela.
// - Responde com o MESMO registro de domínios do sigma-mcp (_shared/agente): mesmo fato que o Claude dos sócios.
// - Domínio liberado = a pessoa vê o módulo da tela (pode_modulo); as ferramentas de leitura usam o service role
//   porque a permissão já foi checada aqui (mesmo contrato do sigma-mcp).
// - Escrita: só PROPOSTA (assistente_propostas). Quem grava é assistente_confirmar, chamada pelo front com o JWT da
//   pessoa no clique do cartão. As prévias (campanha_assistente_editar com p_aplicar=false, prévia de leads) rodam com
//   o JWT da pessoa, então as checagens de permissão das RPCs valem já na hora de propor.
// Motor: o Claude da GSS (Hermes na VPS, rotina ia_claude_robo_sigma) quando a conta Max está conectada; a edge segue
// dona do laço de ferramentas e o Claude só decide o próximo passo em JSON (desenho em claude.ts). Sem login, erro ou
// demora: Gemini com function calling (GEMINI_API_KEY), exatamente o caminho de antes.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hashResultado, renderizar } from "../_shared/agente/protocolo.ts";
import { acessosDoUsuario, DOMINIOS, exposto } from "../_shared/agente/registro.ts";
import { acharCampanhas } from "../_shared/agente/dominios/campanhas.ts";
import { semAcento } from "../_shared/agente/tempo.ts";
import { ErroFerramenta } from "../_shared/agente/tipos.ts";
import {
  campanhaDaPagina, type Cartao, cartaoEdicao, esquemaGemini, historico, instrucoes, MODULO_DO_DOMINIO, type Mudanca, roboLiberado, veContratos,
} from "../_shared/assistente.ts";
import { claudeLigado, ERRO_DESISTIU, pedirAoClaude } from "../_shared/motor-ia.ts";
import { type Chamada, instrucoesClaude, lerPasso, pedidoClaude, type Rodada } from "./claude.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

const MODELOS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
const MAX_FERRAMENTAS = 6;
const TETO_MS = 40_000;
const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

type Ferr = { nome: string; descricao: string; esquema: unknown; rodar: (args: Record<string, unknown>) => Promise<string> };
type Estado = { svc: SupabaseClient; usr: SupabaseClient; userId: string; conversaId: string; proposta: { id: string; tipo: string; resumo: Cartao } | null };

// ---- ferramentas de campanha (só para quem pode) -------------------------------------------------------------

async function opcoesCriacao(e: Estado): Promise<string> {
  const [{ data: modelos, error: e1 }, { data: numeros, error: e2 }] = await Promise.all([
    e.usr.rpc("campanha_assistente_modelos"), e.usr.rpc("campanha_assistente_numeros"),
  ]);
  if (e1 || e2) throw new Error((e1 || e2)!.message);
  const ms = ((modelos ?? []) as { friendly_name: string; body: string; variables: Record<string, string> | null }[])
    .filter((m) => Object.keys(m.variables || {}).length <= 3)
    .map((m) => `- **${m.friendly_name}**: "${m.body.replace(/\s+/g, " ").slice(0, 160)}"`);
  const ns = ((numeros ?? []) as { phone_e164: string; display_name: string | null; disponibilidade: string | null; templates: string[] }[])
    .map((n) => `- ${n.display_name || n.phone_e164} (${n.phone_e164}): ${n.disponibilidade ?? "sem teste"}; modelos: ${n.templates.join(", ") || "nenhum"}`);
  return `Modelos aprovados (variáveis: {{1}} nome do médico, {{2}} especialidade, {{3}} cidade ou região):\n${ms.join("\n") || "- nenhum"}\n\nNúmeros oficiais:\n${ns.join("\n") || "- nenhum"}`;
}

async function especialidadesPorNome(e: Estado, nomes: string[]) {
  const { data } = await e.svc.from("especialidades").select("id, nome").eq("ativo", true).order("nome").order("id");
  const todas = (data ?? []) as { id: string; nome: string }[];
  const out: { id: string; nome: string }[] = [];
  for (const n of nomes) {
    const achadas = acharCampanhas(todas, n);
    const exata = achadas.find((x) => semAcento(x.nome) === semAcento(n));
    if (exata || achadas.length === 1) out.push(exata ?? achadas[0]);
    else if (!achadas.length) throw new ErroFerramenta(`especialidade não encontrada: "${n}". Pergunte o nome certo.`);
    else throw new ErroFerramenta(`"${n}" casa com várias especialidades: ${achadas.slice(0, 8).map((x) => x.nome).join("; ")}. Pergunte qual.`);
  }
  return out;
}

async function proporCriacao(e: Estado, a: Record<string, unknown>): Promise<string> {
  const esp = await especialidadesPorNome(e, (Array.isArray(a.especialidades) ? a.especialidades : []).map(String).filter(Boolean));
  if (!esp.length) throw new ErroFerramenta("informe ao menos uma especialidade");
  const ufs = (Array.isArray(a.ufs) ? a.ufs : []).map((u) => String(u).trim().toUpperCase());
  const ufErrada = ufs.find((u) => !UFS.includes(u));
  if (ufErrada) throw new ErroFerramenta(`UF inválida: ${ufErrada}`);
  const modelo = String(a.modelo ?? "").trim();
  if (!modelo) throw new ErroFerramenta("informe o modelo da mensagem (veja campanhas_opcoes_criacao)");
  const { data: numerosV, error } = await e.usr.rpc("campanha_assistente_numeros");
  if (error) throw new Error(error.message);
  const numeros = (numerosV ?? []) as { sender_id: string; phone_e164: string; display_name: string | null; disponibilidade: string | null; templates: string[] }[];
  const pedidos = (Array.isArray(a.numeros) ? a.numeros : []).map((x) => semAcento(String(x)).replace(/\D/g, "") || semAcento(String(x)));
  const comModelo = numeros.filter((n) => n.templates.includes(modelo) && n.disponibilidade !== "indisponivel");
  const escolhidos = pedidos.length
    ? comModelo.filter((n) => pedidos.some((p) => n.phone_e164.replace(/\D/g, "").endsWith(p) || semAcento(n.display_name || "").includes(p)))
    : comModelo;
  if (!escolhidos.length) throw new ErroFerramenta(`nenhum número disponível tem o modelo "${modelo}" aprovado. Veja campanhas_opcoes_criacao.`);
  const vaga = (a.vaga && typeof a.vaga === "object" ? a.vaga : {}) as Record<string, unknown>;
  const cidade = String(vaga.cidade ?? "").trim();
  const limite = Math.max(1, Math.min(250, Number(a.limite_por_numero) || 50));
  const nome = String(a.nome ?? "").trim() || [esp[0].nome, cidade].filter(Boolean).join(" — ");
  const conversa = a.conversa === "equipe" ? "manual" : "ia";
  const comecar = a.comecar === true;
  // Mesmo payload do assistente de tela (NovaCampanhaAssistente.tsx) para a campanha nascer igual.
  const payload = {
    nome, especialidade_ids: esp.map((x) => x.id), ufs, lista_id: null, template_name: modelo,
    template_variables: { "1": "{{lead.nome}}", "2": esp[0].nome, "3": cidade },
    sender_ids: escolhidos.map((n) => n.sender_id), tipo_envio: conversa, primeiro_contato: "sigma", texto_celular: null,
    alerta_destinos: [], limite_por_numero: limite, comecar,
    briefing: {
      nome_servico: esp[0].nome, hospital: String(vaga.hospital ?? "").trim(), cidade,
      locais: [{ hospital: String(vaga.hospital ?? "").trim(), cidade, uf: ufs[0] || "" }],
      tipo_servico: String(vaga.tipo_servico ?? "").trim(), valor_min: vaga.valor_min ?? null, valor_max: vaga.valor_max ?? null,
      valor_por: String(vaga.valor_por ?? "").trim(), contratacao: "PJ",
    },
  };
  const { data: previa } = await e.usr.rpc("campanha_assistente_previa", { p_especialidade_ids: payload.especialidade_ids, p_ufs: ufs.length ? ufs : null });
  const entram = Number((previa as { entram?: number } | null)?.entram ?? 0);
  const resumo: Cartao = {
    titulo: `Criar a campanha ${nome}`,
    linhas: [
      { rotulo: "Público", antes: null, depois: `${esp.map((x) => x.nome).join(", ")} · ${ufs.length ? ufs.join(", ") : "Brasil todo"}` },
      { rotulo: "Médicos que entram", antes: null, depois: entram.toLocaleString("pt-BR") },
      { rotulo: "Mensagem", antes: null, depois: modelo },
      { rotulo: "Números", antes: null, depois: escolhidos.map((n) => n.display_name || n.phone_e164).join(", ") },
      { rotulo: "Envios por número por dia", antes: null, depois: String(limite) },
      { rotulo: "Depois do 1º contato", antes: null, depois: conversa === "ia" ? "A IA conversa" : "A equipe conversa" },
      { rotulo: "Começa", antes: null, depois: comecar ? "Já disparando (7h às 17h, dias úteis)" : "Pausada; você liga quando quiser" },
    ],
    aviso: entram === 0 ? "Nenhum médico entra com esse público: confira especialidade e estado." : undefined,
  };
  return await gravarProposta(e, "criar_campanha", null, payload, resumo);
}

async function proporEdicao(e: Estado, a: Record<string, unknown>): Promise<string> {
  const busca = String(a.campanha ?? "").trim();
  if (!busca) throw new ErroFerramenta("informe a campanha (nome ou parte do nome)");
  const { data: lista } = await e.svc.from("campanhas").select("id, nome, status").eq("tipo_campanha", "prospeccao")
    .not("status", "in", "(finalizada,arquivada)").order("nome").order("id");
  const achadas = acharCampanhas((lista ?? []) as { id: string; nome: string; status: string }[], busca);
  if (achadas.length !== 1) {
    throw new ErroFerramenta(achadas.length
      ? `"${busca}" casa com ${achadas.length} campanhas: ${achadas.slice(0, 8).map((c) => `${c.nome.trim()} (${c.status})`).join("; ")}. Pergunte qual.`
      : `nenhuma campanha em andamento casa com "${busca}".`);
  }
  const mud = (a.mudancas && typeof a.mudancas === "object" ? a.mudancas : {}) as Record<string, unknown>;
  // Números chegam por telefone ou nome: a RPC quer os ids.
  if (Array.isArray(mud.numeros)) {
    const { data: ns } = await e.usr.rpc("campanha_assistente_numeros");
    const todos = (ns ?? []) as { sender_id: string; phone_e164: string; display_name: string | null }[];
    mud.sender_ids = (mud.numeros as unknown[]).map((x) => {
      const p = String(x).replace(/\D/g, "");
      const n = todos.find((t) => (p && t.phone_e164.replace(/\D/g, "").endsWith(p)) || semAcento(t.display_name || "") === semAcento(String(x)));
      if (!n) throw new ErroFerramenta(`número não encontrado: ${x}`);
      return n.sender_id;
    });
    delete mud.numeros;
  }
  const { data, error } = await e.usr.rpc("campanha_assistente_editar", { p_campanha_id: achadas[0].id, p: mud, p_aplicar: false });
  if (error) throw new ErroFerramenta(`a mudança não passa: ${error.message}`);
  const r = data as { nome: string; mudancas: Mudanca[] };
  if (!r.mudancas.length) return "Nada muda: a campanha já está assim. Diga isso à pessoa.";
  return await gravarProposta(e, "editar_campanha", achadas[0].id, mud, cartaoEdicao(r.nome, r.mudancas));
}

async function gravarProposta(e: Estado, tipo: string, campanhaId: string | null, payload: unknown, resumo: Cartao) {
  const { data, error } = await e.svc.from("assistente_propostas").insert({
    conversa_id: e.conversaId, user_id: e.userId, tipo, campanha_id: campanhaId, payload, resumo,
  }).select("id").single();
  if (error) throw new Error(error.message);
  e.proposta = { id: data.id, tipo, resumo };
  return `Proposta pronta (${resumo.titulo}). O cartão "Confere?" já aparece para a pessoa: ela confere e clica em Confirmar. Não está gravado ainda.`;
}

const ESQ_CRIAR = {
  type: "object",
  properties: {
    especialidades: { type: "array", items: { type: "string" }, description: "Nomes das especialidades (ex.: Pediatria)" },
    ufs: { type: "array", items: { type: "string" }, description: "Siglas dos estados (ex.: RS). Vazio = Brasil todo" },
    modelo: { type: "string", description: "Nome do modelo aprovado (campanhas_opcoes_criacao)" },
    numeros: { type: "array", items: { type: "string" }, description: "Números ou nomes dos números; vazio = todos os disponíveis com o modelo" },
    nome: { type: "string", description: "Nome da campanha; vazio = especialidade e cidade" },
    limite_por_numero: { type: "integer", description: "Envios por número por dia, 1 a 250 (padrão 50)" },
    conversa: { type: "string", enum: ["ia", "equipe"], description: "Quem conversa depois do 1º contato" },
    comecar: { type: "boolean", description: "true = já começa disparando; false = nasce pausada (padrão)" },
    vaga: {
      type: "object",
      properties: {
        hospital: { type: "string" }, cidade: { type: "string" }, tipo_servico: { type: "string", description: "Plantão, Ambulatório, Vaga fixa ou Sobreaviso" },
        valor_min: { type: "number" }, valor_max: { type: "number" }, valor_por: { type: "string", description: "ex.: por plantão de 12 h" },
      },
    },
  },
  required: ["especialidades", "modelo"],
};

const ESQ_EDITAR = {
  type: "object",
  properties: {
    campanha: { type: "string", description: "Nome ou parte do nome da campanha" },
    mudancas: {
      type: "object",
      description: "Só o que muda",
      properties: {
        nome: { type: "string" },
        status: { type: "string", enum: ["ativa", "pausada"] },
        limite_por_numero: { type: "integer", description: "1 a 250" },
        numeros: { type: "array", items: { type: "string" }, description: "Lista completa de números que ficam (telefone ou nome)" },
        template_name: { type: "string", description: "Novo modelo aprovado" },
        briefing: {
          type: "object",
          properties: {
            hospital: { type: "string" }, cidade: { type: "string" }, tipo_servico: { type: "string" },
            valor_min: { type: "number" }, valor_max: { type: "number" }, valor_por: { type: "string" },
            instrucoes_especiais: { type: "string", description: "Regra curta para a IA que conversa com o médico" },
            ia_informa_valor: { type: "boolean" },
          },
        },
      },
    },
  },
  required: ["campanha", "mudancas"],
};

// ---- Gemini ----------------------------------------------------------------------------------------------

type Parte = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } };
type Conteudo = { role: "user" | "model"; parts: Parte[] };

async function gemini(sistema: string, contents: Conteudo[], ferrs: Ferr[], restante: number) {
  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) throw new Error("GEMINI_API_KEY ausente");
  let erro = "";
  for (const modelo of MODELOS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents,
          tools: ferrs.length ? [{ functionDeclarations: ferrs.map((f) => ({ name: f.nome, description: f.descricao, parameters: esquemaGemini(f.esquema) })) }] : undefined,
          generationConfig: { temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(Math.max(5_000, restante)),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) { erro = `${modelo}: ${r.status} ${JSON.stringify(corpo).slice(0, 200)}`; continue; }
      const partes = (corpo?.candidates?.[0]?.content?.parts ?? []) as Parte[];
      return { modelo, partes };
    } catch (e) { erro = `${modelo}: ${(e as Error).message}`; }
  }
  throw new Error(`IA indisponível agora (${erro})`);
}

// ---- Claude da GSS (Hermes na VPS) ------------------------------------------------------------------------

const ROTINA_CLAUDE = "ia_claude_robo_sigma";
const MODELO_CLAUDE = "claude-sonnet (Hermes)";
// Cada passo é um pedido à fila: o worker pega em 2-8 s e o Hermes leva uns 10-20 s. Passado o teto, o Gemini
// responde do zero com o próprio teto (TETO_MS), e o total fica abaixo do limite da edge (150 s).
const TETO_CLAUDE_MS = 80_000;
// Se a VPS nem pegou o pedido neste tempo, o worker está parado: não adianta esperar o teto inteiro.
const PEGAR_MS = 20_000;
// Depois de a VPS não pegar um pedido, as próximas perguntas vão direto ao Gemini por este tempo.
const PAUSA_VPS_MS = 10 * 60_000;

async function usarClaude(svc: SupabaseClient): Promise<boolean> {
  try {
    if (!(await claudeLigado(svc))) return false;
    const { data } = await svc.from("rotina_pedidos").select("erro, concluido_em").eq("tipo", ROTINA_CLAUDE)
      .in("status", ["feito", "erro"]).order("concluido_em", { ascending: false }).limit(1).maybeSingle();
    const vpsParada = data?.erro === ERRO_DESISTIU && Date.now() - new Date(data.concluido_em).getTime() < PAUSA_VPS_MS;
    return !vpsParada;
  } catch {
    return false;
  }
}

/** Laço de ferramentas com o Claude decidindo cada passo. Devolve o texto final ou null (o Gemini assume). */
async function responderComClaude(
  svc: SupabaseClient, sistema: string, ferrs: Ferr[], anteriores: { papel: string; texto: string }[], mensagem: string,
  rodar: (nome: string, args: Record<string, unknown>) => Promise<string>,
): Promise<string | null> {
  const inicio = Date.now();
  const rodadas: Rodada[] = [];
  const decl = ferrs.map((f) => ({ nome: f.nome, descricao: f.descricao, esquema: f.esquema }));
  for (let volta = 0; volta <= MAX_FERRAMENTAS; volta++) {
    const restante = TETO_CLAUDE_MS - (Date.now() - inicio);
    if (restante < 5_000) return null;
    const podeFerramenta = volta < MAX_FERRAMENTAS;
    const r = await pedirAoClaude(svc, ROTINA_CLAUDE, {
      instrucoes: instrucoesClaude(sistema, podeFerramenta ? decl : [], podeFerramenta),
      pedido: pedidoClaude(anteriores, mensagem, rodadas),
    }, { limiteMs: restante, pegarMs: PEGAR_MS, limparResultado: true });
    const passo = lerPasso(r?.passo);
    if (!passo) return null;
    if (passo.tipo === "resposta") return passo.texto;
    if (!podeFerramenta) return null;
    const chamadas: Chamada[] = passo.chamadas;
    const resultados: string[] = [];
    for (const c of chamadas) resultados.push(await rodar(c.nome, c.args));
    rodadas.push({ chamadas, resultados });
  }
  return null;
}

// ---- edge ------------------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const t0 = Date.now();
  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  const { data: u } = await svc.auth.getUser(jwt);
  if (!u?.user) return json({ error: "login_necessario" }, 401);
  const userId = u.user.id;
  const usr = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  if (!(await roboLiberado(svc, userId))) return json({ error: "sem_acesso_ao_assistente" }, 403);

  const body = await req.json().catch(() => ({}));
  const mensagem = String(body.mensagem ?? "").trim().slice(0, 2000);
  if (!mensagem) return json({ error: "mensagem_vazia" }, 400);

  // Permissão: cada domínio pelo módulo da tela; criar/editar campanha como hoje.
  const pode = async (modulo: string) => modulo === "todos" || !!(await svc.rpc("pode_modulo", { p_uid: userId, p_modulo: modulo, p_acao: "visualizar" })).data;
  const ids = Object.keys(MODULO_DO_DOMINIO);
  const flags = await Promise.all(ids.map((d) => pode(MODULO_DO_DOMINIO[d])));
  const liberados = new Set(ids.filter((_, i) => flags[i]));
  if (liberados.has("contratos")) {
    const { data: rs } = await svc.from("user_roles").select("role").eq("user_id", userId);
    if (!veContratos(((rs || []) as { role: string }[]).map((r) => String(r.role)))) liberados.delete("contratos");
  }
  const podeCriar = liberados.has("campanhas");
  const podeEditar = podeCriar && !!(await svc.rpc("pode_editar_campanha", { p_uid: userId })).data;
  const ac = acessosDoUsuario(DOMINIOS, liberados);
  const exp = exposto(ac);

  // Conversa: a da pessoa ou uma nova.
  let conversaId = String(body.conversa_id ?? "") || null;
  if (conversaId) {
    const { data } = await svc.from("assistente_conversas").select("id").eq("id", conversaId).eq("user_id", userId).maybeSingle();
    if (!data) conversaId = null;
  }
  if (!conversaId) {
    const { data, error } = await svc.from("assistente_conversas").insert({ user_id: userId, titulo: mensagem.slice(0, 80) }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    conversaId = data.id;
  }
  const { data: anteriores } = await svc.from("assistente_mensagens").select("papel, texto").eq("conversa_id", conversaId)
    .order("criado_em").order("id").limit(200);
  await svc.from("assistente_mensagens").insert({ conversa_id: conversaId, papel: "usuario", texto: mensagem });

  const e: Estado = { svc, usr, userId, conversaId: conversaId!, proposta: null };
  const ctx = () => ({ svc, userId, agora: new Date() });
  // sigma_guia e sigma_dominios ficam de fora: o guia dos domínios liberados já vai nas instruções, e chamá-los custava
  // uma volta inteira ao modelo (de 32 s para a metade no teste de 21/11).
  const ferrs: Ferr[] = exp.ferramentas.filter((f) => !f.nome.startsWith("sigma_")).map((f) => ({
    nome: f.nome, descricao: f.descricao, esquema: f.inputSchema,
    rodar: async (args) => renderizar(await f.executar(ctx(), args)),
  }));
  if (podeCriar) {
    ferrs.push({ nome: "campanhas_opcoes_criacao", descricao: "Modelos de mensagem aprovados e números oficiais disponíveis para criar ou editar campanha.", esquema: { type: "object", properties: {} }, rodar: () => opcoesCriacao(e) });
    ferrs.push({ nome: "campanhas_propor_criacao", descricao: "Monta a proposta de uma campanha de prospecção nova para a pessoa conferir e confirmar. Não grava nada.", esquema: ESQ_CRIAR, rodar: (a) => proporCriacao(e, a) });
  }
  if (podeEditar) {
    ferrs.push({ nome: "campanhas_propor_edicao", descricao: "Monta a proposta de mudança numa campanha em andamento (nome, pausar/retomar, limite, números, modelo, dados da vaga) para a pessoa conferir e confirmar. Não grava nada.", esquema: ESQ_EDITAR, rodar: (a) => proporEdicao(e, a) });
  }

  const pagina = String(body.pagina ?? "").slice(0, 500) || null;
  // Campanha aberta: lida com o login da pessoa, então só vira contexto se ela enxerga essa campanha.
  const campanhaId = campanhaDaPagina(body.campanha_id ? `?campanha=${body.campanha_id}` : pagina);
  const [{ data: perfil }, campanhaAberta] = await Promise.all([
    svc.from("profiles").select("nome_completo").eq("id", userId).maybeSingle(),
    campanhaId ? usr.from("campanhas").select("nome").eq("id", campanhaId).maybeSingle().then((r) => r.data as { nome: string } | null) : null,
  ]);
  const sistema = instrucoes(ac, {
    agora: new Date(), pagina, nome: perfil?.nome_completo ?? null, podeCriar, podeEditar, campanha: campanhaAberta?.nome ?? null,
  });
  const contents: Conteudo[] = [
    ...historico((anteriores ?? []) as { papel: string; texto: string }[]).map((m) => ({ role: m.papel === "usuario" ? "user" as const : "model" as const, parts: [{ text: m.texto }] })),
    { role: "user", parts: [{ text: mensagem }] },
  ];

  const usadas: Record<string, unknown>[] = [];
  // Roda uma chamada de ferramenta pedida pelo modelo (Gemini ou Claude): mesma checagem de "só o que a pessoa pode".
  const rodarFerramenta = async (nome: string, args: Record<string, unknown>) => {
    const t1 = Date.now();
    const f = ferrs.find((x) => x.nome === nome);
    let saida: string;
    let falhou: string | null = null;
    try {
      if (!f) throw new ErroFerramenta(`ferramenta indisponível para esta pessoa: ${nome}`);
      saida = await f.rodar(args);
    } catch (x) {
      falhou = x instanceof Error ? x.message : String(x);
      saida = `Erro: ${falhou}`;
    }
    usadas.push({ nome, args, ms: Date.now() - t1, erro: falhou, hash: await hashResultado(nome, saida) });
    return saida;
  };

  let texto = "";
  let modelo = "";
  let erro: string | null = null;

  // 1) Claude da GSS (Hermes na VPS), quando há login. Qualquer falha devolve null e o Gemini responde como sempre.
  let tGemini = t0;
  if (await usarClaude(svc)) {
    const c = await responderComClaude(svc, sistema, ferrs, historico((anteriores ?? []) as { papel: string; texto: string }[]), mensagem, rodarFerramenta)
      .catch((x) => { console.error("[sigma-assistente] claude", x); return null; });
    if (c) { texto = c; modelo = MODELO_CLAUDE; }
    tGemini = Date.now();
  }

  // 2) Gemini (o caminho de antes). Se o Claude já montou uma proposta e depois falhou, não pede outra: o cartão vale.
  if (!texto && e.proposta) { texto = "Preparei a proposta abaixo. Confira e clique em Confirmar."; modelo = MODELO_CLAUDE; }
  if (!texto) {
    try {
      for (let volta = 0; volta <= MAX_FERRAMENTAS; volta++) {
        const g = await gemini(sistema, contents, volta < MAX_FERRAMENTAS ? ferrs : [], TETO_MS - (Date.now() - tGemini));
        modelo = g.modelo;
        const chamadas = g.partes.filter((p) => p.functionCall);
        texto = g.partes.map((p) => p.text ?? "").join("").trim();
        if (!chamadas.length) break;
        contents.push({ role: "model", parts: g.partes });
        const respostas: Parte[] = [];
        for (const c of chamadas) {
          const nome = c.functionCall!.name;
          const saida = await rodarFerramenta(nome, c.functionCall!.args ?? {});
          respostas.push({ functionResponse: { name: nome, response: { resultado: saida } } });
        }
        contents.push({ role: "user", parts: respostas });
        if (Date.now() - tGemini > TETO_MS) { texto = "Demorei demais para juntar os dados. Pergunte de novo, de um jeito mais específico."; break; }
      }
      if (!texto) texto = e.proposta ? "Preparei a proposta abaixo. Confira e clique em Confirmar." : "Não consegui responder agora. Tente de novo.";
    } catch (x) {
      erro = (x as Error).message;
      texto = "A IA não respondeu agora. Tente de novo em instantes.";
    }
  }

  await svc.from("assistente_mensagens").insert({
    conversa_id: conversaId, papel: "assistente", texto, ferramentas: usadas, proposta_id: e.proposta?.id ?? null,
    modelo: modelo || null, ms: Date.now() - t0, erro,
  });
  await svc.from("assistente_conversas").update({ atualizada_em: new Date().toISOString() }).eq("id", conversaId);
  return json({ conversa_id: conversaId, texto, proposta: e.proposta, ferramentas: usadas.map((x) => x.nome), erro: !!erro });
});
