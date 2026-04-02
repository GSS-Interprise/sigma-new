-- Enable realtime for captacao_permissoes_usuario
ALTER TABLE public.captacao_permissoes_usuario REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.captacao_permissoes_usuario;