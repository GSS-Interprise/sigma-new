-- Migrar anexos de medico_kanban_cards para lead_anexos
-- Os arquivos permanecem no storage medico-kanban-anexos, apenas criamos referência na lead_anexos

INSERT INTO public.lead_anexos (
  lead_id,
  arquivo_nome,
  arquivo_url,
  usuario_id,
  usuario_nome,
  created_at
)
SELECT 
  l.id as lead_id,
  mka.arquivo_nome,
  'medico-kanban-anexos/' || mka.arquivo_url as arquivo_url,
  mka.usuario_id,
  mka.usuario_nome,
  mka.created_at
FROM medico_kanban_card_anexos mka
JOIN medico_kanban_cards mkc ON mkc.id = mka.card_id
JOIN leads l ON l.email = mkc.email
WHERE l.origem = 'Kanban Médicos (migrado)'
AND NOT EXISTS (
  SELECT 1 FROM lead_anexos la 
  WHERE la.lead_id = l.id 
  AND la.arquivo_nome = mka.arquivo_nome
);