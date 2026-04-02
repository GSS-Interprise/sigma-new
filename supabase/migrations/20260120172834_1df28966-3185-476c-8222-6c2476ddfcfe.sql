-- Adicionar colunas de snapshot para indicadores estratégicos
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS valor_estimado NUMERIC;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS uf VARCHAR(2);
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS orgao TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS modalidade TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS numero_edital TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS objeto TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS motivo_nome TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.licitacao_descartes.valor_estimado IS 'Snapshot do valor estimado da licitação no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.uf IS 'UF extraída do municipio_uf no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.municipio IS 'Município da licitação no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.orgao IS 'Órgão responsável no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.modalidade IS 'Modalidade da licitação no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.numero_edital IS 'Número do edital no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.objeto IS 'Objeto da licitação no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.motivo_nome IS 'Nome do motivo desnormalizado para queries rápidas';