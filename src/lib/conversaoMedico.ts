// Trava única da conversão Lead -> Médico (envio para Contratos). Pedido da Bianca (Contratos, 25/11/2026):
// cadastro chegava sem CPF, e-mail, CNPJ ou com proposta zerada e voltava para quem pediu.
// A checklist da aba Conversão e a própria conversão usam esta mesma regra, para a tela e o envio nunca divergirem.

export const MODALIDADES_CONTRATO = [
  "Pessoa Física",
  "Pessoa Jurídica",
  "Ambas (PF e PJ)",
  "Pessoa Jurídica e Sócio",
  "Sócio",
  "PF Condicionada a PJ",
] as const;

// Valores antigos que continuam no banco ("PJ" veio de importação). Qualquer modalidade com PJ exige os dados da empresa.
const MODALIDADES_COM_PJ = new Set([
  "Pessoa Jurídica",
  "PJ",
  "Ambas (PF e PJ)",
  "Pessoa Jurídica e Sócio",
  "PF Condicionada a PJ",
]);

export function modalidadeExigePJ(modalidade?: string | null): boolean {
  return !!modalidade && MODALIDADES_COM_PJ.has(modalidade.trim());
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const soDigitos = (v?: string | null) => (v || "").replace(/\D/g, "");

export interface DadosConversao {
  nome?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  unidades?: unknown[] | null;
  modalidade?: string | null;
  cnpj?: string | null;
  representanteNome?: string | null;
  representanteEmail?: string | null;
  /** propostas do lead com o valor do médico por item (proposta_itens.valor_medico) */
  propostas?: { proposta_itens?: { valor_medico?: number | string | null }[] | null }[] | null;
}

export interface CampoConversao {
  campo: string;
  preenchido: boolean;
  valor: string | null;
  /** o que falta, em linguagem de tela, para a lista de pendências */
  falta?: string;
}

export function camposObrigatoriosConversao(d: DadosConversao): CampoConversao[] {
  const nome = d.nome?.trim() || "";
  const cpf = soDigitos(d.cpf);
  const telefone = d.telefone?.trim() || "";
  const email = d.email?.trim() || "";
  const unidades = d.unidades?.length ?? 0;
  const modalidade = d.modalidade?.trim() || "";
  const propostas = d.propostas ?? [];
  const itensComValor = propostas
    .flatMap((p) => p.proposta_itens ?? [])
    .filter((i) => Number(i.valor_medico) > 0).length;

  const campos: CampoConversao[] = [
    { campo: "Nome", preenchido: !!nome, valor: nome || null },
    { campo: "CPF", preenchido: cpf.length === 11, valor: d.cpf?.trim() || null, falta: cpf ? "CPF incompleto" : undefined },
    { campo: "Telefone", preenchido: !!telefone, valor: telefone || null },
    { campo: "E-mail", preenchido: EMAIL_RE.test(email), valor: email || null, falta: email ? "E-mail inválido" : undefined },
    { campo: "Local de atuação (Unidades)", preenchido: unidades > 0, valor: unidades > 0 ? `${unidades} unidade(s)` : null },
    { campo: "Modalidade de contrato", preenchido: !!modalidade, valor: modalidade || null },
  ];

  if (modalidadeExigePJ(modalidade)) {
    const cnpj = soDigitos(d.cnpj);
    const repEmail = d.representanteEmail?.trim() || "";
    campos.push(
      { campo: "CNPJ", preenchido: cnpj.length === 14, valor: d.cnpj?.trim() || null, falta: cnpj ? "CNPJ incompleto" : undefined },
      { campo: "Representante legal", preenchido: !!d.representanteNome?.trim(), valor: d.representanteNome?.trim() || null },
      {
        campo: "E-mail do representante legal",
        preenchido: EMAIL_RE.test(repEmail),
        valor: repEmail || null,
        falta: repEmail ? "E-mail do representante inválido" : undefined,
      },
    );
  }

  campos.push({
    campo: "Proposta Vinculada",
    preenchido: itensComValor > 0,
    valor: itensComValor > 0 ? `${propostas.length} proposta(s), ${itensComValor} item(ns) com valor` : null,
    falta: propostas.length > 0 ? "Sem valor para o médico" : undefined,
  });

  return campos;
}

/** Lista do que falta, para a mensagem de erro quando alguém tenta converter incompleto. */
export function pendenciasConversao(d: DadosConversao): string[] {
  return camposObrigatoriosConversao(d)
    .filter((c) => !c.preenchido)
    .map((c) => c.falta || c.campo);
}
