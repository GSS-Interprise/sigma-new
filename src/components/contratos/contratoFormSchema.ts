import * as z from "zod";
import { validateCNPJ } from "@/lib/validators";

// Fora do componente para o schema e a regra do status poderem ser conferidos sem a tela
// (scripts/verificar-numeracao-contrato.mjs).
export const formSchema = z.object({
  // Dados do Cliente
  cnpj: z.string().min(14, "CNPJ é obrigatório").refine(validateCNPJ, "CNPJ inválido"),
  nome_fantasia: z.string().min(1, "Nome fantasia é obrigatório"),
  razao_social: z.string().min(1, "Razão social é obrigatória"),
  estado: z.string().optional(),
  endereco: z.string().min(1, "Endereço é obrigatório"),
  email_contato: z.string().email("E-mail inválido"),
  telefone_contato: z.string()
    .min(1, "Telefone é obrigatório")
    .refine((val) => {
      const clean = val.replace(/\D/g, '');
      return clean.length === 10 || clean.length === 11;
    }, "Telefone inválido. Digite 10 ou 11 dígitos (ex: 11 98765-4321)"),
  email_financeiro: z.string().email("E-mail inválido").optional().or(z.literal("")),
  telefone_financeiro: z.string().optional(),
  nome_unidade: z.string().min(1, "Nome da unidade é obrigatório"),
  tipo_contratacao: z.enum(['credenciamento', 'licitacao', 'dispensa', 'direta_privada']).optional(),
  condicao_pagamento: z.string().optional(),
  valor_estimado: z.number().optional(),
  
  // Dados do Contrato
  codigo_contrato: z.string().min(1, "Código do contrato é obrigatório"),
  // Pré-contrato vindo da licitação fica sem número até virar contrato (0af8f01): aceitar null.
  codigo_interno: z.number().nullable().optional(),
  tipo_servico: z.array(z.string()).min(1, "Selecione pelo menos um tipo de serviço"),
  objeto_contrato: z.string().optional(),
  data_inicio: z.date(),
  prazo_meses: z.number().min(1, "Prazo deve ser maior que 0").optional().nullable(),
  data_termino: z.date().optional().nullable(),
  status_contrato: z.enum(['Ativo', 'Inativo', 'Suspenso', 'Em Processo de Renovação']),
  assinado: z.enum(['Sim', 'Pendente', 'Em Análise', 'Aguardando Retorno']),
  motivo_pendente: z.string().optional().nullable(),
  dias_aviso_vencimento: z.number().min(30, "Mínimo 30 dias").max(60, "Máximo 60 dias").default(60),
});

/**
 * O formulário só oferece os status de contrato de verdade. Pré-contrato (licitação arrematada, sem número)
 * aberto pela lista entra como Ativo: ao salvar ele vira contrato e o banco dá o próximo número
 * (trigger set_contrato_codigo_interno). Sem isso o zod barrava 'Pre-Contrato' e nada salvava.
 */
export function statusContratoNoFormulario(status?: string | null): z.infer<typeof formSchema>["status_contrato"] {
  if (!status || status === "Pre-Contrato") return "Ativo";
  return status as z.infer<typeof formSchema>["status_contrato"];
}
