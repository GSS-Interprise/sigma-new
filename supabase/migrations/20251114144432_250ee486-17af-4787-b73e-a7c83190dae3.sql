-- Adicionar permissões para o perfil externos
INSERT INTO public.permissoes (modulo, acao, perfil, ativo)
VALUES 
  ('suporte', 'visualizar', 'externos', true),
  ('suporte', 'criar', 'externos', true)
ON CONFLICT DO NOTHING;