-- Desvincula registros
UPDATE public.contratos SET licitacao_origem_id = NULL 
WHERE licitacao_origem_id IN (SELECT id FROM public.licitacoes);

UPDATE public.leads SET licitacao_origem_id = NULL 
WHERE licitacao_origem_id IN (SELECT id FROM public.licitacoes);

-- Deleta registros derivados
DELETE FROM public.captacao_contratos_board 
WHERE origem_licitacao_id IN (SELECT id FROM public.licitacoes);

DELETE FROM public.contrato_rascunho_anexos 
WHERE contrato_rascunho_id IN (
  SELECT id FROM public.contrato_rascunho WHERE licitacao_id IN (SELECT id FROM public.licitacoes)
);

DELETE FROM public.contrato_rascunho 
WHERE licitacao_id IN (SELECT id FROM public.licitacoes);

DELETE FROM public.licitacoes_atividades 
WHERE licitacao_id IN (SELECT id FROM public.licitacoes);

-- Remove todas as licitações
DELETE FROM public.licitacoes;

-- Limpa os buckets de storage
DELETE FROM storage.objects WHERE bucket_id IN ('licitacoes-anexos', 'editais-pdfs');