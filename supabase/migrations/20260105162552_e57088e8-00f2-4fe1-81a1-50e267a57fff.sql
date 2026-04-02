-- Atualizar constraint de status_contrato para incluir 'Em Processo de Renovação' que é usado no frontend
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_status_contrato_check;

ALTER TABLE public.contratos ADD CONSTRAINT contratos_status_contrato_check 
  CHECK (status_contrato = ANY (ARRAY[
    'Ativo'::text, 
    'Inativo'::text, 
    'Encerrado'::text, 
    'Suspenso'::text, 
    'Em Renovação'::text, 
    'Em Processo de Renovação'::text, 
    'Pre-Contrato'::text
  ]));

-- Para ages_contratos - adicionar constraints (campos são TEXT)
ALTER TABLE public.ages_contratos DROP CONSTRAINT IF EXISTS ages_contratos_status_check;

ALTER TABLE public.ages_contratos ADD CONSTRAINT ages_contratos_status_check 
  CHECK (status IS NULL OR status = ANY (ARRAY[
    'Ativo'::text, 
    'Inativo'::text, 
    'Encerrado'::text, 
    'Suspenso'::text, 
    'Em Renovação'::text, 
    'Em Processo de Renovação'::text, 
    'Pre-Contrato'::text
  ]));

ALTER TABLE public.ages_contratos DROP CONSTRAINT IF EXISTS ages_contratos_assinado_check;

ALTER TABLE public.ages_contratos ADD CONSTRAINT ages_contratos_assinado_check 
  CHECK (assinado IS NULL OR assinado = ANY (ARRAY[
    'Sim'::text, 
    'Pendente'::text, 
    'Em Análise'::text, 
    'Aguardando Retorno'::text
  ]));