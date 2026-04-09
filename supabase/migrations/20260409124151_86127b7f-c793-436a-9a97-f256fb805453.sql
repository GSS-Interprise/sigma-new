-- Remove registros duplicados de licitacoes_anexos, mantendo apenas o mais recente por (licitacao_id, arquivo_nome)
DELETE FROM public.licitacoes_anexos
WHERE id NOT IN (
  SELECT DISTINCT ON (licitacao_id, arquivo_nome) id
  FROM public.licitacoes_anexos
  ORDER BY licitacao_id, arquivo_nome, created_at DESC
);