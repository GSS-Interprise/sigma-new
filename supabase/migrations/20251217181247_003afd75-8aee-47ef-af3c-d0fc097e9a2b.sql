-- Add FK so PostgREST can join licitacoes_atividades.user_id -> profiles.id
ALTER TABLE public.licitacoes_atividades
  ADD CONSTRAINT licitacoes_atividades_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id)
  ON DELETE SET NULL;