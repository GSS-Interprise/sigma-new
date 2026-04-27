
-- Backfill: marcar como 'consolidado' os rascunhos que já têm contrato_id apontando para um contrato real
-- (foram criados via "Novo Card de Captação" mas ficaram com status 'rascunho')
UPDATE public.contrato_rascunho cr
SET 
  status = 'consolidado',
  consolidado_em = COALESCE(cr.consolidado_em, cr.created_at),
  consolidado_por = COALESCE(cr.consolidado_por, cr.created_by)
WHERE cr.status = 'rascunho'
  AND cr.contrato_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.contratos c WHERE c.id = cr.contrato_id
  );
