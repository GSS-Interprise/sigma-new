CREATE OR REPLACE VIEW public.vw_ai_supervision_queue AS
SELECT
  cl.id AS campanha_lead_id,
  cl.campanha_id,
  cl.lead_id,
  l.nome AS lead_nome,
  c.nome AS campanha_nome,
  cl.status::text AS lead_status,
  cl.aguarda_resposta_humana,
  cl.assumido_por,
  p.nome_completo AS assumido_por_nome,
  cl.data_ultimo_contato,
  cl.proximo_touch_em,
  CASE
    WHEN coalesce(cl.aguarda_resposta_humana, false)
      THEN 'aguarda_resposta_humana'
    WHEN cl.status::text = 'quente' AND cl.assumido_por IS NULL
      THEN 'interessado_sem_responsavel'
    WHEN cl.status::text = 'quente' AND cl.proximo_touch_em IS NULL
      THEN 'interessado_sem_proximo_passo'
    WHEN cl.status::text IN ('em_conversa', 'aquecido')
      AND cl.proximo_touch_em IS NULL
      AND cl.data_ultimo_contato < now() - interval '30 minutes'
      THEN 'conversa_sem_proximo_passo'
    ELSE 'revisao_necessaria'
  END AS supervision_reason,
  CASE
    WHEN coalesce(cl.aguarda_resposta_humana, false) THEN 100
    WHEN cl.status::text = 'quente' AND cl.assumido_por IS NULL THEN 90
    WHEN cl.status::text = 'quente' AND cl.proximo_touch_em IS NULL THEN 80
    ELSE 60
  END AS priority
FROM public.campanha_leads cl
JOIN public.campanhas c ON c.id = cl.campanha_id
JOIN public.leads l ON l.id = cl.lead_id
LEFT JOIN public.profiles p ON p.id = cl.assumido_por
WHERE c.tipo_envio IN ('ia', 'ambos')
  AND c.status::text IN ('ativa', 'pausada')
  AND coalesce(cl.humano_assumiu, false) = false
  AND cl.status::text IN ('em_conversa', 'aquecido', 'quente')
  AND (
    coalesce(cl.aguarda_resposta_humana, false)
    OR (cl.status::text = 'quente' AND cl.assumido_por IS NULL)
    OR (cl.status::text = 'quente' AND cl.proximo_touch_em IS NULL)
    OR (
      cl.status::text IN ('em_conversa', 'aquecido')
      AND cl.proximo_touch_em IS NULL
      AND cl.data_ultimo_contato < now() - interval '30 minutes'
    )
  );

GRANT SELECT ON public.vw_ai_supervision_queue TO authenticated, service_role;

COMMENT ON VIEW public.vw_ai_supervision_queue IS
  'Fila humana de conversas de IA que aguardam resposta, responsável ou próximo passo.';
