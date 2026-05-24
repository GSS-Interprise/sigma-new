-- F3.5b — View agregada server-side pra evitar limit 1000 do client
-- (cliente estava perdendo 10 operadoras por causa do limit padrão).
CREATE OR REPLACE VIEW public.vw_sigzap_atividade_equipe AS
SELECT
  conv_agg.user_id,
  p.nome_completo,
  conv_agg.conversas_atribuidas,
  COALESCE(msg_agg.msgs_enviadas, 0) AS msgs_enviadas,
  conv_agg.ultima_atividade
FROM (
  SELECT
    assigned_user_id AS user_id,
    COUNT(*) AS conversas_atribuidas,
    MAX(last_message_at) AS ultima_atividade
  FROM public.sigzap_conversations
  WHERE assigned_user_id IS NOT NULL
  GROUP BY assigned_user_id
) conv_agg
LEFT JOIN (
  SELECT sent_by_user_id AS user_id, COUNT(*) AS msgs_enviadas
  FROM public.sigzap_messages
  WHERE from_me = true AND sent_by_user_id IS NOT NULL
  GROUP BY sent_by_user_id
) msg_agg ON msg_agg.user_id = conv_agg.user_id
LEFT JOIN public.profiles p ON p.id = conv_agg.user_id
ORDER BY conv_agg.conversas_atribuidas DESC;

GRANT SELECT ON public.vw_sigzap_atividade_equipe TO authenticated, service_role;
