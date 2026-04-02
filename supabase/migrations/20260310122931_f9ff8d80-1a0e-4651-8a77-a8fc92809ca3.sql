
-- Corrigir rascunhos que já têm contrato_id mas estão com status 'rascunho'
-- Esses registros já foram consolidados mas a atualização de status falhou
UPDATE contrato_rascunho
SET 
  status = 'consolidado',
  consolidado_em = COALESCE(consolidado_em, updated_at, created_at)
WHERE 
  status = 'rascunho' 
  AND contrato_id IS NOT NULL;
