
UPDATE public.contrato_rascunho
SET status = 'rascunho',
    contrato_id = NULL,
    consolidado_em = NULL,
    consolidado_por = NULL,
    updated_at = now()
WHERE id = '283e854e-fc8e-4b7e-a79b-c7c4e8402956';

DELETE FROM public.contratos
WHERE id IN (
  'd874c73e-a4ea-464d-aeb3-d2acfde21b63',
  '77f36a6c-dd9d-4d33-ad82-343e1ceb3b14',
  '2324e234-9810-4495-9f59-15ef79fc9cd7'
);
