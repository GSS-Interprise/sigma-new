-- Adicionar políticas de INSERT para sigzap_contacts baseado em permissão de captação
CREATE POLICY "Captadores com permissao zap podem inserir contatos"
  ON public.sigzap_contacts FOR INSERT
  WITH CHECK (public.has_captacao_permission(auth.uid(), 'disparos_zap'));

-- Adicionar políticas de INSERT para sigzap_conversations baseado em permissão de captação
CREATE POLICY "Captadores com permissao zap podem inserir conversas"
  ON public.sigzap_conversations FOR INSERT
  WITH CHECK (public.has_captacao_permission(auth.uid(), 'disparos_zap'));

-- Adicionar política de UPDATE para sigzap_contacts (para atualizar dados do contato)
CREATE POLICY "Captadores com permissao zap podem atualizar contatos"
  ON public.sigzap_contacts FOR UPDATE
  USING (public.has_captacao_permission(auth.uid(), 'disparos_zap'));