import * as z from "zod";
import { validateCPF } from "@/lib/validators";

// Regra do cadastro do Corpo Clínico (MedicoDialog). Fica fora do componente para ter teste
// (medicoFormSchema.test.ts): o prestador que não é médico (Mavi, 18/11) dispensa CRM e
// especialidade, mas o médico continua com os dois obrigatórios.
export const medicoFormSchema = z.object({
  nome_completo: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  // prestador que não é médico: sem CRM nem especialidade; o banco aceita só com o marcador
  prestador_nao_medico: z.boolean(),
  crm: z.string(),
  especialidade: z.array(z.string()),
  rqe_numeros: z.string().optional(),
  email: z.string().email("Email inválido"),
  telefone: z.string().min(10, "Telefone inválido"),
  cpf: z.string().optional().refine(
    (val) => !val || val.length === 0 || validateCPF(val),
    { message: "CPF inválido" }
  ),
  data_nascimento: z.date().optional(),
  estado: z.string().length(2, "Estado deve ter 2 letras (UF)").regex(/^[A-Z]{2}$/, "Use apenas siglas maiúsculas (ex: SP, RJ)").optional(),
  status_medico: z.enum(['Ativo', 'Inativo', 'Suspenso']),
  status_contrato: z.enum(['ativo', 'inativo', 'pendente', 'cancelado']).optional(),
  unidades_vinculadas: z.array(z.string()).optional(),
}).superRefine((v, ctx) => {
  if (v.prestador_nao_medico) return;
  if (v.crm.trim().length < 4) ctx.addIssue({ code: "custom", path: ["crm"], message: "CRM inválido" });
  if (!v.especialidade.length) ctx.addIssue({ code: "custom", path: ["especialidade"], message: "Selecione pelo menos uma especialidade" });
});

export type MedicoFormValues = z.infer<typeof medicoFormSchema>;

// Campos de registro profissional como o banco espera (constraint medicos_crm_obrigatorio_para_medico).
// Marcar "prestador" num cadastro que já tinha CRM não apaga o CRM: só esconde. Assim um clique errado
// num médico não perde o registro, e desmarcar traz tudo de volta.
export function registroProfissional(values: Pick<MedicoFormValues, "prestador_nao_medico" | "crm" | "especialidade" | "rqe_numeros">) {
  return {
    prestador_nao_medico: values.prestador_nao_medico,
    crm: values.crm.trim() || null,
    // o banco recusa lista vazia: sem especialidade (prestador) vai nulo
    especialidade: values.especialidade.length ? values.especialidade : null,
    rqe_numeros: values.rqe_numeros
      ? values.rqe_numeros.split(',').map((r) => r.trim()).filter(Boolean)
      : null,
  };
}
