-- Etapa 1: Adicionar novos campos para suportar layout V2
-- Mantendo retrocompatibilidade total com layout V1

-- Novos campos para o layout V2
ALTER TABLE public.radiologia_pendencias 
ADD COLUMN IF NOT EXISTS cod_acesso TEXT,
ADD COLUMN IF NOT EXISTS sla TEXT,
ADD COLUMN IF NOT EXISTS sla_horas INTEGER,
ADD COLUMN IF NOT EXISTS medico_atribuido_id UUID REFERENCES public.medicos(id),
ADD COLUMN IF NOT EXISTS medico_atribuido_nome TEXT,
ADD COLUMN IF NOT EXISTS medico_finalizador_id UUID REFERENCES public.medicos(id),
ADD COLUMN IF NOT EXISTS data_final TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS layout_versao TEXT DEFAULT 'v1';

-- Índice para cod_acesso (campo chave do novo layout)
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_cod_acesso 
ON public.radiologia_pendencias(cod_acesso);

-- Comentários de documentação
COMMENT ON COLUMN radiologia_pendencias.sla IS 'Tipo SLA do layout V2: Atendimento Ambulatorial (48h), Internado (4h), Pronto Socorro (2h), Alta (2h)';
COMMENT ON COLUMN radiologia_pendencias.sla_horas IS 'Horas do SLA calculadas automaticamente';
COMMENT ON COLUMN radiologia_pendencias.medico_atribuido_id IS 'Médico atribuído (do campo atribuido do layout V2)';
COMMENT ON COLUMN radiologia_pendencias.medico_atribuido_nome IS 'Nome do médico atribuído (fallback quando ID não encontrado)';
COMMENT ON COLUMN radiologia_pendencias.layout_versao IS 'Versão do layout usado na importação: v1 (antigo) ou v2 (novo)';
COMMENT ON COLUMN radiologia_pendencias.nivel_urgencia IS 'DEPRECATED: Use sla + sla_horas para novos registros';
COMMENT ON COLUMN radiologia_pendencias.tipo_registro IS 'DEPRECATED: Layout v2 não utiliza este campo';

-- Backfill: Popular novos campos a partir dos dados existentes
UPDATE public.radiologia_pendencias SET
  sla = CASE nivel_urgencia
    WHEN 'pronto_socorro' THEN 'Pronto Socorro'
    WHEN 'internados' THEN 'Internado'
    WHEN 'oncologicos' THEN 'Atendimento Ambulatorial'
    ELSE 'Internado'
  END,
  sla_horas = CASE nivel_urgencia
    WHEN 'pronto_socorro' THEN 2
    WHEN 'internados' THEN 4
    WHEN 'oncologicos' THEN 48
    ELSE 4
  END,
  cod_acesso = acesso,
  medico_atribuido_id = medico_id,
  layout_versao = 'v1'
WHERE layout_versao IS NULL OR sla IS NULL;