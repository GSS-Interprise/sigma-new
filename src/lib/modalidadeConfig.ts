// Configuração de Tipo e Subtipo de Modalidade para Licitações

export const TIPO_MODALIDADE_OPTIONS = [
  { value: 'MODALIDADE', label: 'MODALIDADE' },
  { value: 'PROC. AUXILIAR', label: 'PROC. AUXILIAR' },
  { value: 'CONTR. DIRETA', label: 'CONTR. DIRETA' },
] as const;

export const SUBTIPO_MODALIDADE_MAP: Record<string, { value: string; label: string }[]> = {
  'MODALIDADE': [
    { value: 'Pregão Eletrônico', label: 'Pregão Eletrônico' },
    { value: 'Pregão Presencial', label: 'Pregão Presencial' },
    { value: 'Concorrência', label: 'Concorrência' },
  ],
  'PROC. AUXILIAR': [
    { value: 'Credenciamento', label: 'Credenciamento' },
    { value: 'Edital Chamamento', label: 'Edital Chamamento' },
    { value: 'Outros', label: 'Outros' },
  ],
  'CONTR. DIRETA': [
    { value: 'Dispensa', label: 'Dispensa' },
    { value: 'Inexigibilidade', label: 'Inexigibilidade' },
  ],
};

/**
 * Dado um subtipo, retorna o tipo correspondente.
 * Útil para mapear dados externos (Effect, API) que enviam apenas a modalidade.
 */
export function inferTipoFromSubtipo(subtipo: string | null | undefined): string | null {
  if (!subtipo) return null;
  const normalized = subtipo.trim().toUpperCase();
  
  if (normalized.includes('PREGÃO') || normalized.includes('PREGAO') || normalized.includes('CONCORRÊNCIA') || normalized.includes('CONCORRENCIA')) {
    return 'MODALIDADE';
  }
  if (normalized.includes('CREDENCIAMENTO') || normalized.includes('CHAMAMENTO')) {
    return 'PROC. AUXILIAR';
  }
  if (normalized.includes('DISPENSA') || normalized.includes('INEXIGIBILIDADE')) {
    return 'CONTR. DIRETA';
  }
  return null;
}

/**
 * Normaliza o subtipo para o valor padronizado.
 */
export function normalizeSubtipo(subtipo: string | null | undefined): string | null {
  if (!subtipo) return null;
  const normalized = subtipo.trim().toUpperCase();
  
  if (normalized.includes('PREGÃO') || normalized.includes('PREGAO')) {
    if (normalized.includes('PRESENCIAL')) return 'Pregão Presencial';
    return 'Pregão Eletrônico';
  }
  if (normalized.includes('CONCORRÊNCIA') || normalized.includes('CONCORRENCIA')) return 'Concorrência';
  if (normalized.includes('CREDENCIAMENTO')) return 'Credenciamento';
  if (normalized.includes('CHAMAMENTO')) return 'Edital Chamamento';
  if (normalized.includes('DISPENSA')) return 'Dispensa';
  if (normalized.includes('INEXIGIBILIDADE')) return 'Inexigibilidade';
  
  return subtipo.trim();
}

export function getSubtiposForTipo(tipo: string | null | undefined): { value: string; label: string }[] {
  if (!tipo) return [];
  return SUBTIPO_MODALIDADE_MAP[tipo] || [];
}
