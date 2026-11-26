// Erro ao salvar um lead (cadastro de médico) em texto que a equipe entende, mais o id do cadastro que já existe.
//
// O gatilho generate_lead_chave_unica já barra o médico repetido com uma frase pronta e o detail
// "lead_existente=<id> chave=cpf|nome_nascimento" (migrations 20261125210000 e 20261126120000). Esta função só não
// deixa o erro cru do índice chegar à tela quando o banco não deu essa frase: corrida entre dois cadastros, migration
// ainda não aplicada, ou o índice de telefone (leads_phone_e164_unique), que o gatilho não confere.

export interface ErroCadastroLead {
  mensagem: string;
  /** Cadastro que já existe, quando o banco disse qual é: a tela oferece abrir esse cadastro. */
  leadExistenteId: string | null;
  /** O erro é de médico (ou telefone) que já está no Sigma. */
  duplicado: boolean;
}

const UUID = /lead_existente=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

const POR_INDICE: Array<[string, string]> = [
  [
    "idx_leads_chave_unica",
    "Este médico já está cadastrado no Sigma, com o mesmo CPF ou o mesmo nome e data de nascimento. Busque pelo CPF ou pelo nome na aba Leads e atualize o cadastro que já existe.",
  ],
  [
    "idx_leads_cpf_unique",
    "Este CPF já está em outro cadastro do Sigma. Busque pelo CPF na aba Leads e atualize o cadastro que já existe.",
  ],
  [
    "leads_phone_e164_unique",
    "Este telefone já está em outro cadastro do Sigma. Busque pelo telefone na aba Leads e atualize o cadastro que já existe.",
  ],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lerErroCadastroLead(error: any, padrao = "Erro ao salvar o cadastro"): ErroCadastroLead {
  const mensagem = String(error?.message ?? "").trim();
  const detalhe = String(error?.details ?? error?.detail ?? "");
  const codigo = String(error?.code ?? "");
  const cru = /duplicate key value|unique constraint/i.test(mensagem);
  const duplicado = codigo === "23505" || cru;

  if (!duplicado) return { mensagem: mensagem || padrao, leadExistenteId: null, duplicado: false };

  const leadExistenteId = detalhe.match(UUID)?.[1] ?? null;
  // Frase do gatilho: já diz quem é e o que fazer.
  if (!cru && mensagem) return { mensagem, leadExistenteId, duplicado: true };

  const porIndice = POR_INDICE.find(([indice]) => mensagem.includes(indice) || detalhe.includes(indice));
  return {
    mensagem: porIndice?.[1] ?? "Já existe um cadastro com estes dados no Sigma. Busque na aba Leads e atualize o que já existe.",
    leadExistenteId,
    duplicado: true,
  };
}
