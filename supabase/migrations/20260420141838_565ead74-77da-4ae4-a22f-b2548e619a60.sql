-- 1) Tabela lead_liberacoes
CREATE TABLE IF NOT EXISTS public.lead_liberacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campanha_proposta_id uuid NOT NULL REFERENCES public.campanha_propostas(id) ON DELETE CASCADE,
  motivo_anterior text,
  justificativa text NOT NULL,
  liberado_por uuid,
  liberado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_liberacoes_lead ON public.lead_liberacoes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_liberacoes_proposta ON public.lead_liberacoes(campanha_proposta_id);
CREATE INDEX IF NOT EXISTS idx_lead_liberacoes_lead_proposta ON public.lead_liberacoes(lead_id, campanha_proposta_id, created_at DESC);

ALTER TABLE public.lead_liberacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_view_lead_liberacoes"
  ON public.lead_liberacoes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth_insert_lead_liberacoes"
  ON public.lead_liberacoes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "admin_update_lead_liberacoes"
  ON public.lead_liberacoes FOR UPDATE
  TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "admin_delete_lead_liberacoes"
  ON public.lead_liberacoes FOR DELETE
  TO authenticated USING (public.is_admin(auth.uid()));

-- 2) View vw_lead_status_por_proposta
CREATE OR REPLACE VIEW public.vw_lead_status_por_proposta
WITH (security_invoker = true) AS
WITH cascata AS (
  SELECT
    cplc.campanha_proposta_id,
    cplc.lead_id,
    bool_or(cplc.status_final = 'aberto') AS tem_aberto,
    bool_or(cplc.status_final IN ('respondeu','convertido','descartado','fechado')) AS tem_fechado,
    bool_or(cplc.status_final = 'transferido') AS tem_transferido,
    max(cplc.saiu_em) FILTER (WHERE cplc.status_final <> 'aberto') AS ultima_decisao_em,
    (array_agg(cplc.motivo_saida ORDER BY cplc.saiu_em DESC NULLS LAST)
       FILTER (WHERE cplc.motivo_saida IS NOT NULL))[1] AS ultimo_motivo
  FROM public.campanha_proposta_lead_canais cplc
  GROUP BY cplc.campanha_proposta_id, cplc.lead_id
),
liberacoes AS (
  SELECT lead_id, campanha_proposta_id, max(created_at) AS ultima_liberacao
  FROM public.lead_liberacoes
  GROUP BY lead_id, campanha_proposta_id
),
ultimo_contato_lead AS (
  SELECT l.id AS lead_id, max(dhc.ultimo_disparo) AS ultimo_disparo
  FROM public.leads l
  JOIN public.disparos_historico_contatos dhc
    ON (l.phone_e164 IS NOT NULL AND dhc.telefone = l.phone_e164)
    OR (l.email IS NOT NULL AND dhc.email IS NOT NULL AND lower(dhc.email) = lower(l.email))
  GROUP BY l.id
)
SELECT
  c.campanha_proposta_id,
  c.lead_id,
  CASE
    WHEN c.tem_aberto THEN 'em_aberto'
    WHEN c.tem_fechado AND COALESCE(lib.ultima_liberacao, 'epoch'::timestamptz) <= COALESCE(c.ultima_decisao_em, 'epoch'::timestamptz)
      THEN 'fechado_proposta'
    WHEN c.tem_transferido THEN 'contactado'
    ELSE 'a_contactar'
  END AS status_proposta,
  c.ultima_decisao_em,
  c.ultimo_motivo,
  EXISTS (SELECT 1 FROM public.blacklist bl
          JOIN public.leads l ON l.phone_e164 = bl.phone_e164
          WHERE l.id = c.lead_id) AS bloqueado_blacklist,
  EXISTS (SELECT 1 FROM public.leads_bloqueio_temporario lbt
          WHERE lbt.lead_id = c.lead_id AND lbt.removed_at IS NULL) AS bloqueado_temp,
  CASE
    WHEN uc.ultimo_disparo IS NOT NULL
     AND uc.ultimo_disparo >= now() - INTERVAL '7 days'
     AND COALESCE(lib.ultima_liberacao, 'epoch'::timestamptz) < uc.ultimo_disparo
    THEN true ELSE false
  END AS bloqueado_janela_7d,
  uc.ultimo_disparo
FROM cascata c
LEFT JOIN liberacoes lib
  ON lib.lead_id = c.lead_id AND lib.campanha_proposta_id = c.campanha_proposta_id
LEFT JOIN ultimo_contato_lead uc ON uc.lead_id = c.lead_id

UNION ALL

SELECT
  cp.id AS campanha_proposta_id,
  dli.lead_id,
  'a_contactar'::text AS status_proposta,
  NULL::timestamptz AS ultima_decisao_em,
  NULL::text AS ultimo_motivo,
  EXISTS (SELECT 1 FROM public.blacklist bl
          JOIN public.leads l ON l.phone_e164 = bl.phone_e164
          WHERE l.id = dli.lead_id) AS bloqueado_blacklist,
  EXISTS (SELECT 1 FROM public.leads_bloqueio_temporario lbt
          WHERE lbt.lead_id = dli.lead_id AND lbt.removed_at IS NULL) AS bloqueado_temp,
  CASE
    WHEN uc.ultimo_disparo IS NOT NULL
     AND uc.ultimo_disparo >= now() - INTERVAL '7 days'
     AND COALESCE(lib.ultima_liberacao, 'epoch'::timestamptz) < uc.ultimo_disparo
    THEN true ELSE false
  END AS bloqueado_janela_7d,
  uc.ultimo_disparo
FROM public.campanha_propostas cp
JOIN public.disparo_lista_itens dli ON dli.lista_id = cp.lista_id
LEFT JOIN liberacoes lib ON lib.lead_id = dli.lead_id AND lib.campanha_proposta_id = cp.id
LEFT JOIN ultimo_contato_lead uc ON uc.lead_id = dli.lead_id
WHERE cp.lista_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.campanha_proposta_lead_canais x
    WHERE x.campanha_proposta_id = cp.id AND x.lead_id = dli.lead_id
  );

-- 3) Função liberar_lead_proposta
CREATE OR REPLACE FUNCTION public.liberar_lead_proposta(
  p_lead_id uuid,
  p_campanha_proposta_id uuid,
  p_justificativa text,
  p_motivo_anterior text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_user_nome text;
BEGIN
  IF p_justificativa IS NULL OR trim(p_justificativa) = '' THEN
    RAISE EXCEPTION 'Justificativa da liberação é obrigatória';
  END IF;

  SELECT nome_completo INTO v_user_nome FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.lead_liberacoes (
    lead_id, campanha_proposta_id, motivo_anterior, justificativa, liberado_por, liberado_por_nome
  ) VALUES (
    p_lead_id, p_campanha_proposta_id, p_motivo_anterior, p_justificativa, auth.uid(), v_user_nome
  ) RETURNING id INTO v_id;

  INSERT INTO public.campanha_proposta_lead_canais (campanha_proposta_id, lead_id, canal, criado_por, status_final)
  SELECT p_campanha_proposta_id, p_lead_id, c.canal, auth.uid(), 'aberto'
  FROM (VALUES ('whatsapp'), ('trafego_pago')) AS c(canal)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.campanha_proposta_lead_canais x
    WHERE x.campanha_proposta_id = p_campanha_proposta_id
      AND x.lead_id = p_lead_id
      AND x.canal = c.canal
      AND x.status_final = 'aberto'
  );

  INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
  VALUES (
    p_lead_id,
    'lead_liberado',
    'Lead liberado para nova tentativa na proposta',
    jsonb_build_object(
      'campanha_proposta_id', p_campanha_proposta_id,
      'justificativa', p_justificativa,
      'motivo_anterior', p_motivo_anterior
    )
  );

  RETURN v_id;
END;
$$;