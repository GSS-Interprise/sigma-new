// Mapeamento setor → tipos de referência permitidos em uma tarefa.
// Quando criamos uma demanda para outro setor, só ofertamos referências
// que aquele setor tem direito a visualizar.

export type ReferenciaTipo = "licitacao" | "contrato" | "lead" | "sigzap" | "campanha";

// IDs reais conforme tabela `setores`
export const SETOR_IDS = {
  AGES: "20334815-29d0-4aaf-bda6-f09edc2aed75",
  CONTRATOS: "1a57b82d-be39-408c-aec7-c49ee97a692c",
  DIRECAO: "84cd46cb-8e9a-4652-aaec-f056436e056b",
  ESCALAS: "a464681d-d258-43d9-9007-99d4e0463e77",
  EXTERNOS: "541a7d66-122e-4487-bc02-032a97926298",
  FINANCEIRO: "4f936c68-eea3-4ac7-ad12-e413b0acc1f9",
  LICITACOES: "ee54a8a5-47b1-4059-881a-381b9f5b82f1",
  MARKETING: "fa63d200-ecf2-4902-af37-86e199f521ce",
  PROSPECCAO: "6dfff5fe-e51c-4258-95d0-cdc84b179985",
  RADIOLOGIA: "838bdaf5-f982-40ce-83f8-0db2fd86d756",
  TI: "695f16ba-80f0-4ce7-96b0-55b97b5116a6",
} as const;

const ALL: ReferenciaTipo[] = ["licitacao", "contrato", "lead", "sigzap", "campanha"];

const ACCESS_MAP: Record<string, ReferenciaTipo[]> = {
  [SETOR_IDS.LICITACOES]: ["licitacao", "lead", "contrato"],
  [SETOR_IDS.CONTRATOS]: ["contrato", "lead"],
  [SETOR_IDS.PROSPECCAO]: ["lead", "sigzap", "campanha"],
  [SETOR_IDS.RADIOLOGIA]: ["contrato"],
  [SETOR_IDS.ESCALAS]: ["contrato"],
  [SETOR_IDS.FINANCEIRO]: ["contrato"],
  [SETOR_IDS.MARKETING]: ["lead", "sigzap", "campanha"],
  [SETOR_IDS.AGES]: ["lead", "contrato"],
  [SETOR_IDS.DIRECAO]: ALL,
  [SETOR_IDS.TI]: ALL,
  [SETOR_IDS.EXTERNOS]: [],
};

export function getReferenciasPermitidas(
  setorId: string | null | undefined,
  isAdmin = false,
): ReferenciaTipo[] {
  if (isAdmin) return ALL;
  if (!setorId) return [];
  return ACCESS_MAP[setorId] ?? [];
}

export function podeVerReferencia(
  setorId: string | null | undefined,
  tipo: ReferenciaTipo,
  isAdmin = false,
): boolean {
  return getReferenciasPermitidas(setorId, isAdmin).includes(tipo);
}

export const URGENCIA_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const URGENCIA_CLASS: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground border-border",
  media: "bg-primary/10 text-primary border-primary/30",
  alta: "bg-orange-500/15 text-orange-600 border-orange-500/40 dark:text-orange-400",
  critica: "bg-destructive/15 text-destructive border-destructive/40",
};

export const TIPO_LABEL: Record<string, string> = {
  tarefa: "Tarefa",
  arquivo: "Solicitar arquivo",
  esclarecimento: "Esclarecimento",
};
