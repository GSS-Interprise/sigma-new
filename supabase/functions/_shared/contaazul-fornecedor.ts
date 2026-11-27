// Qual cadastro do Conta Azul é o fornecedor do médico: agrupamento por CNPJ e escolha pelo nome.
//
// Sem import nenhum (nem Deno, nem rede) para rodar também no `npm test` do Node: a regra que decide o
// fornecedor do lançamento tem teste de regressão em contaazul-fornecedor.test.ts.

/** Linha "pessoa" de contaazul_cache: o resto dos campos passa adiante como veio. */
type Pessoa = { nome?: string | null; dados?: { documento?: unknown } | null };

export const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PARADAS = new Set("de da do das dos e municipio municipal fundo saude prefeitura hospital associacao instituto fundacao estado governo ubs unidade secretaria sc rs mg pr sp ce ma go med fms".split(" "));
export const palavras = (s: string) => new Set(semAcento(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !PARADAS.has(w) && !/^\d+$/.test(w)));

/** Pessoas do Conta Azul por documento (só dígitos), já com os cadastros "MÉDICO/RAZÃO" sem CNPJ. */
export function pessoasPorDocumento<T extends Pessoa>(pessoas: T[]) {
  // O mesmo CNPJ aparece em vários cadastros: no Conta Azul da GSS o fornecedor é
  // "NOME DO MÉDICO/RAZÃO SOCIAL", um por médico, e uma empresa médica tem vários médicos
  // (66 CNPJs repetidos em 164 cadastros em 12/10). Por isso a lista inteira por documento.
  const pessoasPorDoc = new Map<string, T[]>();
  for (const p of pessoas) {
    const d = dig(p.dados?.documento);
    if (d.length >= 11) pessoasPorDoc.set(d, [...(pessoasPorDoc.get(d) ?? []), p]);
  }
  // Cadastro "MÉDICO/RAZÃO SOCIAL" feito sem CNPJ no Conta Azul (Mavi 27/11, Bambino em Vacaria: Anderson e Léo
  // sem documento, só a própria Bambino e o Nilton com CNPJ) não entrava entre os candidatos do CNPJ e o
  // lançamento ficava "2 fornecedores com este CNPJ". Entra no CNPJ cuja razão social é a mesma do pedaço depois
  // da barra, quando essa razão social aponta para um CNPJ só.
  const razao = (nome: unknown) => semAcento(String(nome || "").split("/").pop() || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const docsDaRazao = new Map<string, Set<string>>();
  for (const [d, lista] of pessoasPorDoc) for (const p of lista) {
    const r = razao(p.nome);
    if (r) docsDaRazao.set(r, new Set([...(docsDaRazao.get(r) ?? []), d]));
  }
  for (const p of pessoas.filter((x) => dig(x.dados?.documento).length < 11 && String(x.nome || "").includes("/"))) {
    const docs = docsDaRazao.get(razao(p.nome));
    if (docs?.size === 1) { const d = [...docs][0]; pessoasPorDoc.set(d, [...(pessoasPorDoc.get(d) ?? []), p]); }
  }
  return pessoasPorDoc;
}

/** Cadastros de um CNPJ, venha ele só com dígitos ou formatado ("12.345.678/0001-90"). */
export const cadastrosDoCnpj = <T>(pessoasPorDoc: Map<string, T[]>, cnpj: unknown) => pessoasPorDoc.get(dig(cnpj)) ?? [];

/** Entre os cadastros com o mesmo CNPJ, o do médico: o nome antes da barra é o da pessoa. */
export function escolherFornecedor<T extends Pessoa>(cands: T[], medico: string) {
  if (cands.length <= 1) return { escolhido: cands[0] ?? null, ambiguo: false };
  const tm = palavras(medico);
  const pontos = cands.map((c) => {
    const pessoa = [...palavras(String(c.nome || "").split("/")[0])];
    return { c, n: pessoa.length ? pessoa.filter((w) => tm.has(w)).length / pessoa.length : 0 };
  }).sort((a, b) => b.n - a.n);
  const claro = pontos[0].n >= 0.6 && (pontos.length === 1 || pontos[0].n > pontos[1].n);
  return { escolhido: claro ? pontos[0].c : null, ambiguo: !claro };
}
