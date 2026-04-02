-- Alterar proposta: remover obrigatoriedade de lead_id e adicionar novos campos
ALTER TABLE public.proposta 
  ALTER COLUMN lead_id DROP NOT NULL;

-- Adicionar campo id_proposta (identificador único formatado)
ALTER TABLE public.proposta 
  ADD COLUMN id_proposta TEXT UNIQUE;

-- Adicionar campo descricao
ALTER TABLE public.proposta 
  ADD COLUMN descricao TEXT;

-- Comentário explicativo do formato do id_proposta
COMMENT ON COLUMN public.proposta.id_proposta IS 'ID formatado: {codigo_contrato}{3letrasServico}-{especialidade}-{ddMmmYY}-{valorFormatado}. Ex: 75Hem-Neo-08Dez25-50k';