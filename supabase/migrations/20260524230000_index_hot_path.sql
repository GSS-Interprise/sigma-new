-- Index performance — hot-path do CRM
--
-- Otimiza queries quentes:
--   1. Sino + página /notificacoes — system_notifications por (user, lida) ordenado desc
--   2. Sino — comunicacao_notificacoes por (user, lida) ordenado desc
--   3. SigZap — comunicacao_mensagens por canal ordenado desc (filtro deleted_at)
--   4. Kanban acompanhamento — campanha_leads por (campanha, etapa)
--
-- Tabelas atualmente pequenas (<15k linhas), CREATE INDEX é instantâneo.

-- 1. Sino + /notificacoes: ORDER BY created_at DESC com filtro user_id+lida
CREATE INDEX IF NOT EXISTS idx_system_notifications_user_lida_created
  ON public.system_notifications (user_id, lida, created_at DESC);

-- 2. Sino: comunicacao_notificacoes mesma assinatura
CREATE INDEX IF NOT EXISTS idx_comunicacao_notificacoes_user_lida_created
  ON public.comunicacao_notificacoes (user_id, lida, created_at DESC);

-- 3. SigZap carrega últimas N mensagens por canal (ignora deletadas)
CREATE INDEX IF NOT EXISTS idx_comunicacao_mensagens_canal_created
  ON public.comunicacao_mensagens (canal_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 4. Kanban filtra por campanha + etapa quente/análise/aprovado/escala
CREATE INDEX IF NOT EXISTS idx_cl_campanha_etapa
  ON public.campanha_leads (campanha_id, etapa_acompanhamento)
  WHERE etapa_acompanhamento IS NOT NULL;
