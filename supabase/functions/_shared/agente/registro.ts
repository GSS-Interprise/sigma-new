// Registro dos domínios do protocolo do agente (docs/arquitetura/protocolo-agente-sigma.md §3b, §3i).
// Domínio novo: criar dominios/<id>.ts pelo molde da §3i, trocar o stub "em_breve" abaixo pelo módulo e subir a
// PROTOCOLO_VERSAO. O sigma-mcp não muda. Testes: registro_test.ts.
import type { Ctx, Dominio, Ferramenta, Fonte, PromptPadrao, Resultado } from "./tipos.ts";
import { ErroFerramenta } from "./tipos.ts";
import { type AcessoDominio, guiaTexto, PROTOCOLO_VERSAO } from "./protocolo.ts";
import { escalas } from "./dominios/escalas.ts";

/** Domínio anunciado mas sem ferramenta: o agente sabe que existe e diz "ainda não disponível". */
function emBreve(id: string, titulo: string, resumo: string): Dominio {
  return {
    id, titulo, versao: "0.0.0", status: "em_breve", resumo, ferramentas: [], prompts: [],
    guia: { proposito: resumo, glossario: [], rotas: [], regras: [], limites: ["Domínio ainda não ligado ao agente."] },
  };
}

/** Ordem do roteiro (§3i). Campanhas, contratos, licitações e CRM entram pelo mesmo molde do de escalas. */
export const DOMINIOS: Dominio[] = [
  escalas,
  emBreve("campanhas", "Campanhas de prospecção", "campanhas ativas, funil, respostas e disparos por campanha."),
  emBreve("contratos", "Contratos", "contratos vigentes, vencimentos, aditivos e itens."),
  emBreve("licitacoes", "Licitações", "licitações em disputa, prazos, resultados e concorrentes."),
  emBreve("crm", "CRM geral", "ficha de médicos e hospitais, vagas abertas e histórico do lead."),
];

const PREFIXO_TRANSVERSAL = "sigma_";

/** Falha na carga da edge se um domínio quebrar o contrato: melhor não subir do que responder errado. */
export function validarRegistro(dominios: Dominio[]): void {
  const ids = new Set<string>();
  const nomes = new Set<string>();
  for (const d of dominios) {
    if (!/^[a-z]+$/.test(d.id)) throw new Error(`domínio com id inválido: ${d.id}`);
    if (ids.has(d.id)) throw new Error(`domínio repetido: ${d.id}`);
    ids.add(d.id);
    if (d.status === "em_breve" && d.ferramentas.length) throw new Error(`domínio em_breve com ferramenta: ${d.id}`);
    for (const f of d.ferramentas) {
      // As 4 de escala nasceram antes do protocolo com nomes sem o prefixo; o Claude do Heron já as conhece.
      const legado = d.id === "escalas" && ["plantoes_descobertos", "quem_esta_escalado"].includes(f.nome);
      if (!legado && !f.nome.startsWith(`${d.id}_`)) throw new Error(`ferramenta sem o prefixo do domínio: ${f.nome}`);
      if (f.nome.startsWith(PREFIXO_TRANSVERSAL)) throw new Error(`prefixo reservado: ${f.nome}`);
      if (nomes.has(f.nome)) throw new Error(`ferramenta repetida: ${f.nome}`);
      nomes.add(f.nome);
    }
    for (const p of d.prompts) {
      if (!p.nome.startsWith(`${d.id}_`)) throw new Error(`prompt sem o prefixo do domínio: ${p.nome}`);
      if (nomes.has(p.nome)) throw new Error(`prompt repetido: ${p.nome}`);
      nomes.add(p.nome);
    }
  }
}

/**
 * Quais domínios o usuário vê. O sigma-mcp passa em `liberados` o que a tabela agente_dominio_acessos (papel × domínio)
 * dá para os papéis dele; "todos" fica para teste. Domínio em_breve nunca é liberado, mesmo se a tabela tiver a linha.
 */
export function acessosDoUsuario(dominios: Dominio[], liberados: Set<string> | "todos"): AcessoDominio[] {
  return dominios.map((d) => ({ dominio: d, liberado: d.status === "ativo" && (liberados === "todos" || liberados.has(d.id)) }));
}

export type Exposto = { ferramentas: Ferramenta[]; prompts: PromptPadrao[]; dominioDe: Map<string, string> };

/** O que vai em tools/list e prompts/list: as transversais + as dos domínios liberados. */
export function exposto(acessos: AcessoDominio[]): Exposto {
  const ferramentas = [...transversais(acessos)];
  const prompts: PromptPadrao[] = [];
  const dominioDe = new Map<string, string>();
  for (const f of ferramentas) dominioDe.set(f.nome, "sigma");
  for (const a of acessos) {
    if (!a.liberado) continue;
    for (const f of a.dominio.ferramentas) { ferramentas.push(f); dominioDe.set(f.nome, a.dominio.id); }
    prompts.push(...a.dominio.prompts);
  }
  return { ferramentas, prompts, dominioDe };
}

/** Ferramenta de domínio que existe mas não está liberada: erro claro em vez de "desconhecida". */
export function dominioBloqueado(acessos: AcessoDominio[], nome: string): Dominio | null {
  for (const a of acessos) if (!a.liberado && a.dominio.ferramentas.some((f) => f.nome === nome)) return a.dominio;
  return null;
}

const FONTE_SIGMA: Fonte = { nome: "Sigma (protocolo do agente)", atualizado_em: null };

function transversais(acessos: AcessoDominio[]): Ferramenta[] {
  const ids = acessos.map((a) => a.dominio.id);
  return [
    {
      nome: "sigma_dominios",
      titulo: "Mapa do Sigma",
      descricao: "Lista os assuntos (domínios) que este servidor responde, quais você pode consultar, quais ainda não estão disponíveis e a hora do último dado de cada fonte. Chame quando não souber se o Sigma responde uma pergunta.",
      inputSchema: { type: "object", properties: {} },
      executar: async (ctx: Ctx): Promise<Resultado> => {
        const linhas: string[] = [];
        const dados: unknown[] = [];
        for (const a of acessos) {
          const d = a.dominio;
          let situacao = d.status === "em_breve" ? "ainda não disponível" : a.liberado ? "disponível" : "sem acesso para o seu usuário";
          let quando: string | null = null;
          if (a.liberado && d.frescor) {
            const f = await d.frescor(ctx);
            quando = f.atualizado_em;
            situacao += quando ? `; ${f.nome} atualizado em ${new Date(quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}` : `; ${f.nome} ainda sem dado`;
          }
          linhas.push(`- **${d.id}** — ${d.titulo}: ${situacao}. ${d.resumo}`);
          dados.push([d.id, d.status, a.liberado, d.versao, quando]);
        }
        const disp = acessos.filter((a) => a.liberado).length;
        return {
          resumo: `Sigma responde ${disp} de ${acessos.length} assuntos para você (protocolo v${PROTOCOLO_VERSAO}).`,
          corpo: "\n" + linhas.join("\n") + "\n\nAntes de responder sobre um assunto, chame sigma_guia com o id dele.",
          dados, totais: { disponiveis: disp, dominios: acessos.length }, fonte: { ...FONTE_SIGMA, atualizado_em: ctx.agora.toISOString() },
        };
      },
    },
    {
      nome: "sigma_guia",
      titulo: "Guia de um assunto do Sigma",
      descricao: "Guia obrigatório antes da primeira resposta sobre um assunto na conversa: o que cada termo significa, qual ferramenta responde cada pergunta, regras e o que ainda não é respondido.",
      inputSchema: {
        type: "object",
        properties: { dominio: { type: "string", enum: ids, description: "Id do assunto (veja sigma_dominios)" } },
        required: ["dominio"],
      },
      executar: async (ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> => {
        const id = String(a.dominio ?? "").trim().toLowerCase();
        const ac = acessos.find((x) => x.dominio.id === id);
        if (!ac) throw new ErroFerramenta(`assunto desconhecido: ${id || "(vazio)"}. Os assuntos são: ${ids.join(", ")}`);
        const texto = ac.liberado || ac.dominio.status === "em_breve"
          ? guiaTexto(ac.dominio)
          : `# ${ac.dominio.titulo}\n\nSeu usuário não tem acesso a este assunto. Diga isso ao usuário e sugira pedir ao administrador do Sigma.`;
        return {
          resumo: texto, dados: { dominio: id, versao: ac.dominio.versao, liberado: ac.liberado },
          fonte: { ...FONTE_SIGMA, atualizado_em: ctx.agora.toISOString() },
        };
      },
    },
  ];
}
