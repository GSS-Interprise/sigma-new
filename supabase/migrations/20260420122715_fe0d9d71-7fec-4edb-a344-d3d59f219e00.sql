DROP VIEW IF EXISTS public.vw_lead_tempo_por_canal;
CREATE VIEW public.vw_lead_tempo_por_canal
WITH (security_invoker = true) AS
SELECT
  campanha_proposta_id,
  lead_id,
  canal,
  COUNT(*) AS passagens,
  SUM(COALESCE(duracao_segundos, EXTRACT(EPOCH FROM (now() - entrou_em))::int)) AS tempo_total_segundos,
  MAX(entrou_em) AS ultima_entrada,
  MAX(saiu_em) AS ultima_saida,
  bool_or(status_final = 'aberto') AS tem_aberto
FROM public.campanha_proposta_lead_canais
GROUP BY campanha_proposta_id, lead_id, canal;