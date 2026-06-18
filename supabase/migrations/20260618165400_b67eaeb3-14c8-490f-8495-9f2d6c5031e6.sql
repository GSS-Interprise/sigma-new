-- Permissões para 'licitador'
INSERT INTO public.permissoes (modulo, acao, perfil, ativo) VALUES
  ('licitacoes','visualizar','licitador',true),
  ('licitacoes','criar','licitador',true),
  ('licitacoes','editar','licitador',true),
  ('contratos','visualizar','licitador',true),
  ('bi','visualizar','licitador',true),
  ('comunicacao','visualizar','licitador',true),
  ('comunicacao','criar','licitador',true),
  ('suporte','visualizar','licitador',true)
ON CONFLICT (modulo, acao, perfil) DO UPDATE SET ativo = true;

-- Permissões para 'lider_licitacao'
INSERT INTO public.permissoes (modulo, acao, perfil, ativo) VALUES
  ('licitacoes','visualizar','lider_licitacao',true),
  ('licitacoes','criar','lider_licitacao',true),
  ('licitacoes','editar','lider_licitacao',true),
  ('contratos','visualizar','lider_licitacao',true),
  ('bi','visualizar','lider_licitacao',true),
  ('comunicacao','visualizar','lider_licitacao',true),
  ('comunicacao','criar','lider_licitacao',true),
  ('suporte','visualizar','lider_licitacao',true)
ON CONFLICT (modulo, acao, perfil) DO UPDATE SET ativo = true;

-- Permitir que os novos perfis gerenciem licitações via RLS
DROP POLICY IF EXISTS "Gestores de captação podem gerenciar licitações" ON public.licitacoes;
CREATE POLICY "Gestores de captação podem gerenciar licitações"
ON public.licitacoes
FOR ALL
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'licitador'::app_role)
  OR has_role(auth.uid(), 'lider_licitacao'::app_role)
)
WITH CHECK (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'licitador'::app_role)
  OR has_role(auth.uid(), 'lider_licitacao'::app_role)
);

-- Atividades de licitações: permitir insert pelos novos perfis
DROP POLICY IF EXISTS "Gestores podem inserir atividades de licitações" ON public.licitacoes_atividades;
CREATE POLICY "Gestores podem inserir atividades de licitações"
ON public.licitacoes_atividades
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    auth.uid() = user_id
    OR is_admin(auth.uid())
    OR has_role(auth.uid(), 'gestor_contratos'::app_role)
    OR has_role(auth.uid(), 'gestor_captacao'::app_role)
    OR has_role(auth.uid(), 'lideres'::app_role)
    OR has_role(auth.uid(), 'licitador'::app_role)
    OR has_role(auth.uid(), 'lider_licitacao'::app_role)
  )
);

-- Kanban status: lider_licitacao pode UPDATE (não pode INSERT/DELETE)
CREATE POLICY "Lider licitacao pode atualizar kanban status"
ON public.kanban_status_config
FOR UPDATE
USING (has_role(auth.uid(), 'lider_licitacao'::app_role))
WITH CHECK (has_role(auth.uid(), 'lider_licitacao'::app_role));