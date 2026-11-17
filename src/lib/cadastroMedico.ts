import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Criação do médico e do card do Kanban de médicos a partir do cadastro novo em /medicos.
 *
 * Caso Suzana Martins Cardo (GSS, 16/11/2026): o cadastro salvava o lead, o insert em `medicos`
 * falhava e o erro só ia para o console; a tela dizia "Médico criado e adicionado ao Kanban!" e o
 * card nunca chegava à equipe de cadastro. `medicos.crm` é NOT NULL UNIQUE desde a criação da
 * tabela e todo médico sem CRM grava 'PENDENTE', então a partir do segundo médico sem CRM o insert
 * sempre falha (o mesmo vale para CRM que já está em outro médico).
 *
 * Regra daqui: ou o médico (e o card, quando o cadastro é do Kanban) existe, ou a pessoa vê o motivo
 * real. Sem confirmação de sucesso pela metade.
 */

export const CRM_PENDENTE = "PENDENTE";

type ErroDb = { message?: string; code?: string; details?: string | null } | null;

/** Erro depois de já ter gravado parte do cadastro: a tela fecha em vez de deixar salvar de novo. */
export class CadastroIncompletoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CadastroIncompletoError";
  }
}

export function crmDoMedico(crm?: string | null): string {
  return (crm ?? "").trim() || CRM_PENDENTE;
}

function mensagemCrmEmUso(crm: string, nomeExistente?: string | null): string {
  const quem = nomeExistente ? ` (${nomeExistente})` : "";
  if (crm === CRM_PENDENTE) {
    return `Informe o CRM do médico: já existe um médico cadastrado sem CRM${quem} e o Sigma não aceita dois.`;
  }
  return `O CRM ${crm} já está no cadastro de outro médico${quem}. Procure esse médico no Kanban ou no Corpo Clínico.`;
}

/** Traduz o erro do insert em `medicos` para o que a pessoa precisa fazer. */
export function mensagemFalhaMedico(error: ErroDb, crm?: string | null): string {
  const texto = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (error?.code === "23505" || texto.includes("medicos_crm_key")) {
    if (texto.includes("crm")) return mensagemCrmEmUso(crmDoMedico(crm));
  }
  if (error?.code === "42501" || texto.includes("row-level security")) {
    return "Seu usuário não tem permissão para criar médicos. Peça ao administrador o acesso de captação ou contratos.";
  }
  return `Não foi possível criar o médico: ${error?.message || "erro desconhecido"}.`;
}

/**
 * Confere, antes de gravar qualquer coisa, se o CRM (ou 'PENDENTE') já está em outro médico.
 * Se a leitura falhar, segue: o insert devolve o erro real.
 */
export async function conferirCrmLivre(db: SupabaseClient, crm?: string | null): Promise<void> {
  const valor = crmDoMedico(crm);
  const { data, error } = await db
    .from("medicos")
    .select("id, nome_completo")
    .eq("crm", valor)
    .limit(1)
    .maybeSingle();
  if (error || !data) return;
  throw new Error(`${mensagemCrmEmUso(valor, (data as { nome_completo?: string }).nome_completo)} Nada foi salvo.`);
}

/** Coluna onde o card do médico novo nasce (a primeira do Kanban de médicos). */
export async function primeiraColunaMedicos(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from("kanban_status_config")
    .select("status_id")
    .eq("modulo", "medicos")
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler as colunas do Kanban de médicos: ${error.message}`);
  const statusId = (data as { status_id?: string } | null)?.status_id;
  if (!statusId) throw new Error("O Kanban de médicos está sem colunas configuradas");
  return statusId;
}

export type CardKanbanMedico = {
  nome: string;
  cpf?: string | null;
  data_nascimento?: string | null;
  crm?: string | null;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
};

export async function criarCardKanbanMedico(
  db: SupabaseClient,
  card: CardKanbanMedico,
  medicoId: string,
  statusId: string,
): Promise<void> {
  const { error } = await db
    .from("medico_kanban_cards")
    .insert({ ...card, status: statusId, medico_id: medicoId });
  if (error) throw new Error(`o card do Kanban não foi criado: ${error.message}`);
}

/**
 * Depois do lead novo gravado: cria o médico e, no cadastro do Kanban, o card e a conversão do lead.
 * Se o médico falhar, apaga o lead recém-criado (só ele, pelo id) para a pessoa corrigir e salvar de
 * novo sem bater no telefone único de `leads`. O médico não é apagado depois de criado: o trigger do
 * financeiro já pode ter vinculado pagamentos a ele.
 */
export async function criarMedicoDoLeadNovo(
  db: SupabaseClient,
  params: {
    leadId: string;
    medico: Record<string, unknown>;
    crm?: string | null;
    /** Preenchido no cadastro pelo Kanban: cria o card nessa coluna e marca o lead como Convertido. */
    kanban?: { statusId: string; card: CardKanbanMedico; userId?: string | null } | null;
  },
): Promise<string> {
  const { leadId, medico, crm, kanban } = params;

  const { data: novoMedico, error: medicoError } = await db
    .from("medicos")
    .insert({ ...medico, lead_id: leadId, crm: crmDoMedico(crm) })
    .select("id")
    .single();

  const medicoId = (novoMedico as { id?: string } | null)?.id;
  if (medicoError || !medicoId) {
    const motivo = mensagemFalhaMedico(medicoError, crm);
    const { error: apagarError } = await db.from("leads").delete().eq("id", leadId);
    if (apagarError) {
      throw new CadastroIncompletoError(
        `${motivo} O lead ficou salvo em Leads, sem o cadastro de médico.`,
      );
    }
    throw new Error(`${motivo} Nada foi salvo.`);
  }

  if (!kanban) return medicoId;

  try {
    await criarCardKanbanMedico(db, kanban.card, medicoId, kanban.statusId);
  } catch (e) {
    throw new CadastroIncompletoError(
      `O médico foi criado, mas ${(e as Error).message}. Avise o suporte antes de cadastrar de novo.`,
    );
  }

  const { error: leadError } = await db
    .from("leads")
    .update({
      status: "Convertido",
      data_conversao: new Date().toISOString(),
      convertido_por: kanban.userId ?? null,
    })
    .eq("id", leadId);
  if (leadError) {
    throw new CadastroIncompletoError(
      `Médico e card criados, mas o lead não foi marcado como convertido: ${leadError.message}.`,
    );
  }

  return medicoId;
}
