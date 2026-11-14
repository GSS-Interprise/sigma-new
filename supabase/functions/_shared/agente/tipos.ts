// Tipos do protocolo do agente do Sigma (docs/arquitetura/protocolo-agente-sigma.md §3b).
// Um domínio (escalas, campanhas, contratos...) é um módulo em dominios/<id>.ts que exporta um `Dominio`.
// O núcleo (protocolo.ts, registro.ts) não conhece nenhum domínio por dentro: só este contrato.

/** O que a edge entrega para a ferramenta. `svc` é o cliente do Supabase com service role (ignora RLS:
 * a permissão já foi checada antes de chegar aqui). `agora` é fixado por chamada para o "hoje" ser um só. */
export type Ctx = { svc: any; userId: string; agora: Date };

/** De onde veio o dado e de quando ele é. `atualizado_em` null = a fonte nunca sincronizou. */
export type Fonte = { nome: string; atualizado_em: string | null };

/**
 * O que toda ferramenta devolve. O servidor monta o fato; o Claude só redige.
 * - `resumo`: 1ª linha da resposta, com os números principais já contados.
 * - `corpo`: o detalhe em markdown, colado logo depois do resumo (o domínio controla a quebra de linha inicial).
 * - `dados`: o fato em forma de dado; é o que entra no hash de consistência (mesmo dado = mesmo hash).
 * - `totais`: os números que vão também no structuredContent (pequeno, para cliente que só lê o estruturado).
 * - `cortado`: a lista passou do limite; `dica` diz como pedir menos.
 */
export type Resultado = {
  resumo: string;
  corpo?: string;
  dados: unknown;
  totais?: Record<string, number | string | null>;
  cortado?: { mostrados: number; dica: string };
  fonte: Fonte;
};

/** Erro que o usuário entende (argumento inválido, nome não achado). Volta ao Claude como isError para ele corrigir. */
export class ErroFerramenta extends Error {}

export type Ferramenta = {
  /** Sempre com o prefixo do domínio (`escalas_`, `campanhas_`...), exceto as transversais `sigma_`. */
  nome: string;
  titulo: string;
  descricao: string;
  inputSchema: Record<string, unknown>;
  executar: (ctx: Ctx, args: Record<string, unknown>) => Promise<Resultado>;
};

/** Pergunta frequente com roteiro fixo: os 4 sócios que usam o mesmo prompt seguem as mesmas ferramentas. */
export type PromptPadrao = {
  nome: string;
  titulo: string;
  descricao: string;
  argumentos?: { name: string; description: string; required?: boolean }[];
  texto: (args: Record<string, string>) => string;
};

/** O guia que o agente lê antes de responder sobre o domínio (ferramenta sigma_guia, resource e aba de admin). */
export type GuiaDominio = {
  proposito: string;
  glossario: { termo: string; definicao: string }[];
  /** "Para esta pergunta, chame esta ferramenta." */
  rotas: { pergunta: string; ferramenta: string; observacao?: string }[];
  regras: string[];
  /** O que o domínio ainda não responde: o agente diz que não sabe em vez de inventar. */
  limites: string[];
};

export type Dominio = {
  id: string;
  titulo: string;
  /** Muda quando muda uma definição ou ferramenta deste domínio; entra na PROTOCOLO_VERSAO. */
  versao: string;
  status: "ativo" | "em_breve";
  /** Uma linha para o mapa da constituição. */
  resumo: string;
  guia: GuiaDominio;
  ferramentas: Ferramenta[];
  prompts: PromptPadrao[];
  /** Hora do último dado da fonte, para o sigma_dominios e o aviso de dado parado. */
  frescor?: (ctx: Ctx) => Promise<Fonte>;
};
