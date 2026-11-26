// Trava única da conversão Lead -> Médico (envio para Contratos). Pedido da Bianca (Contratos, 25/11/2026):
// cadastro chegava sem CPF, e-mail, CNPJ ou com proposta zerada e voltava para quem pediu.
// A checklist da aba Conversão e a própria conversão usam esta mesma regra, para a tela e o envio nunca divergirem.
// 26/11/2026: no teste da Bianca passaram cadastro sem CRM e proposta em R$ 0,00 (bastava UM item de QUALQUER proposta
// ter valor). Agora CRM é obrigatório e nenhuma proposta vinculada pode ter item sem valor para o médico.

import { validateCNPJ, validateCPF } from "@/lib/validators";

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

// CNPJ alfanumérico (Receita, a partir de 07/2026): 12 posições com letra ou número + 2 dígitos verificadores, mesmo
// cálculo do módulo 11 com o valor de cada caractere = código ASCII - 48. Empresa aberta agora já pode ter esse formato.
function cnpjValido(v?: string | null): boolean {
  const limpo = (v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (/^\d{14}$/.test(limpo)) return validateCNPJ(limpo);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(limpo)) return false;
  const dv = (base: string) => {
    let soma = 0;
    let peso = base.length - 7;
    for (const c of base) {
      soma += (c.charCodeAt(0) - 48) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(limpo.slice(0, 12));
  const d2 = dv(limpo.slice(0, 12) + d1);
  return limpo.endsWith(`${d1}${d2}`);
}

// "PENDENTE" é o que a conversão antiga gravava no médico quando o lead não tinha CRM: não vale como CRM.
function crmPreenchido(crm: string): boolean {
  return !!crm && crm.toUpperCase() !== "PENDENTE" && /\d/.test(crm);
}

export interface PropostaConversao {
  /** proposta_itens.valor_medico: o que o médico vai receber por item */
  proposta_itens?: { valor_medico?: number | string | null }[] | null;
}

export interface DadosConversao {
  nome?: string | null;
  cpf?: string | null;
  crm?: string | null;
  telefone?: string | null;
  email?: string | null;
  unidades?: unknown[] | null;
  modalidade?: string | null;
  cnpj?: string | null;
  representanteNome?: string | null;
  representanteEmail?: string | null;
  /** propostas vinculadas ao lead, com os itens */
  propostas?: PropostaConversao[] | null;
}

export interface CampoConversao {
  campo: string;
  preenchido: boolean;
  valor: string | null;
  /** o que falta, em linguagem de tela, para a lista de pendências */
  falta?: string;
}

/** Linha de `leads` (como vem do banco ou do formulário) -> dados da regra. Um só mapeamento para tela e conversão. */
export function dadosConversaoDoLead(
  lead: {
    nome?: string | null;
    cpf?: string | null;
    crm?: string | null;
    phone_e164?: string | null;
    email?: string | null;
    unidades_vinculadas?: unknown[] | null;
    modalidade_contrato?: string | null;
    cnpj?: string | null;
    representante_legal_nome?: string | null;
    representante_legal_email?: string | null;
  },
  propostas: PropostaConversao[] | null | undefined,
): DadosConversao {
  return {
    nome: lead.nome,
    cpf: lead.cpf,
    crm: lead.crm,
    telefone: lead.phone_e164,
    email: lead.email,
    unidades: lead.unidades_vinculadas,
    modalidade: lead.modalidade_contrato,
    cnpj: lead.cnpj,
    representanteNome: lead.representante_legal_nome,
    representanteEmail: lead.representante_legal_email,
    propostas,
  };
}

/** Proposta sem item, ou com algum item em R$ 0,00 para o médico, chega a Contratos sem valor e volta. */
export function propostaZerada(p: PropostaConversao): boolean {
  const itens = p.proposta_itens ?? [];
  return itens.length === 0 || itens.some((i) => !(Number(i.valor_medico) > 0));
}

export function camposObrigatoriosConversao(d: DadosConversao): CampoConversao[] {
  const nome = d.nome?.trim() || "";
  const cpf = soDigitos(d.cpf);
  const crm = d.crm?.trim() || "";
  const telefone = d.telefone?.trim() || "";
  const email = d.email?.trim() || "";
  const unidades = d.unidades?.length ?? 0;
  const modalidade = d.modalidade?.trim() || "";
  const propostas = d.propostas ?? [];
  const zeradas = propostas.filter(propostaZerada).length;

  const campos: CampoConversao[] = [
    { campo: "Nome", preenchido: !!nome, valor: nome || null },
    {
      campo: "CPF",
      preenchido: validateCPF(cpf),
      valor: d.cpf?.trim() || null,
      falta: cpf ? (cpf.length === 11 ? "CPF inválido" : "CPF incompleto") : undefined,
    },
    { campo: "CRM", preenchido: crmPreenchido(crm), valor: crm || null, falta: crm ? "CRM sem número" : undefined },
    { campo: "Telefone", preenchido: !!telefone, valor: telefone || null },
    { campo: "E-mail", preenchido: EMAIL_RE.test(email), valor: email || null, falta: email ? "E-mail inválido" : undefined },
    { campo: "Local de atuação (Unidades)", preenchido: unidades > 0, valor: unidades > 0 ? `${unidades} unidade(s)` : null },
    { campo: "Modalidade de contrato", preenchido: !!modalidade, valor: modalidade || null },
  ];

  if (modalidadeExigePJ(modalidade)) {
    const cnpj = d.cnpj?.trim() || "";
    const cnpjLimpo = cnpj.replace(/[^0-9A-Za-z]/g, "");
    const repEmail = d.representanteEmail?.trim() || "";
    campos.push(
      {
        campo: "CNPJ",
        preenchido: cnpjValido(cnpj),
        valor: cnpj || null,
        falta: cnpj ? (cnpjLimpo.length === 14 ? "CNPJ inválido" : "CNPJ incompleto") : undefined,
      },
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
    preenchido: propostas.length > 0 && zeradas === 0,
    valor: propostas.length > 0 && zeradas === 0 ? `${propostas.length} proposta(s) com valor para o médico` : null,
    falta:
      zeradas > 0
        ? zeradas === 1
          ? "Proposta com item sem valor para o médico"
          : `${zeradas} propostas com item sem valor para o médico`
        : undefined,
  });

  return campos;
}

/** Lista do que falta, para a mensagem de erro quando alguém tenta converter incompleto. */
export function pendenciasConversao(d: DadosConversao): string[] {
  return camposObrigatoriosConversao(d)
    .filter((c) => !c.preenchido)
    .map((c) => c.falta || c.campo);
}
