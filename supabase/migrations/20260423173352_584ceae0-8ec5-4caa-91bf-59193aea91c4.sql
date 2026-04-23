-- =====================================================
-- 1) Schema: novas colunas
-- =====================================================
ALTER TABLE public.campanha_proposta_lead_canais
  ADD COLUMN IF NOT EXISTS movido_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_movimentacao text;

ALTER TABLE public.disparos_contatos
  ADD COLUMN IF NOT EXISTS disparado_por uuid;

-- =====================================================
-- 2) Índices para ranking
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_disparo_manual_envios_enviado_por_data
  ON public.disparo_manual_envios (enviado_por, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disparos_campanhas_responsavel_data
  ON public.disparos_campanhas (responsavel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cplc_criado_por_data
  ON public.campanha_proposta_lead_canais (criado_por, entrou_em DESC);

CREATE INDEX IF NOT EXISTS idx_cplc_movido_por_data
  ON public.campanha_proposta_lead_canais (movido_por, saiu_em DESC)
  WHERE saiu_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_disparos_contatos_disparado_por
  ON public.disparos_contatos (disparado_por, data_envio DESC);

-- =====================================================
-- 3) RPCs atualizadas (gravam movido_por)
-- =====================================================
CREATE OR REPLACE FUNCTION public.transferir_lead_canal(
  p_campanha_proposta_id uuid,
  p_lead_id uuid,
  p_canal_atual text,
  p_proximo_canal text,
  p_motivo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo da transferência é obrigatório';
  END IF;

  UPDATE public.campanha_proposta_lead_canais
  SET saiu_em = now(),
      motivo_saida = p_motivo,
      proximo_canal = p_proximo_canal,
      status_final = 'transferido',
      movido_por = v_uid,
      motivo_movimentacao = 'transferencia'
  WHERE campanha_proposta_id = p_campanha_proposta_id
    AND lead_id = p_lead_id
    AND canal = p_canal_atual
    AND status_final = 'aberto';

  INSERT INTO public.campanha_proposta_lead_canais (
    campanha_proposta_id, lead_id, canal, criado_por, status_final
  ) VALUES (
    p_campanha_proposta_id, p_lead_id, p_proximo_canal, v_uid, 'aberto'
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados, usuario_id)
  VALUES (
    p_lead_id,
    'canal_transferido',
    'Transferido de ' || p_canal_atual || ' para ' || p_proximo_canal,
    jsonb_build_object(
      'campanha_proposta_id', p_campanha_proposta_id,
      'canal_origem', p_canal_atual,
      'canal_destino', p_proximo_canal,
      'motivo', p_motivo
    ),
    v_uid
  );

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fechar_lead_canal(
  p_campanha_proposta_id uuid,
  p_lead_id uuid,
  p_canal text,
  p_status_final text,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF p_status_final NOT IN ('respondeu','convertido','descartado','fechado') THEN
    RAISE EXCEPTION 'Status final inválido: %', p_status_final;
  END IF;

  UPDATE public.campanha_proposta_lead_canais
  SET saiu_em = now(),
      motivo_saida = p_motivo,
      status_final = p_status_final,
      movido_por = v_uid,
      motivo_movimentacao = 'fechamento'
  WHERE campanha_proposta_id = p_campanha_proposta_id
    AND lead_id = p_lead_id
    AND canal = p_canal
    AND status_final = 'aberto';

  INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados, usuario_id)
  VALUES (
    p_lead_id,
    'canal_encerrado',
    'Canal ' || p_canal || ' encerrado como ' || p_status_final,
    jsonb_build_object(
      'campanha_proposta_id', p_campanha_proposta_id,
      'canal', p_canal,
      'status_final', p_status_final,
      'motivo', p_motivo
    ),
    v_uid
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.enviar_lead_proxima_fase(
  p_campanha_proposta_id uuid,
  p_lead_id uuid,
  p_canal_atual text,
  p_motivo text DEFAULT 'Avançado para próxima fase'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_proximo TEXT;
  v_new_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  v_proximo := CASE p_canal_atual
    WHEN 'whatsapp' THEN 'email'
    WHEN 'trafego_pago' THEN 'email'
    WHEN 'email' THEN 'instagram'
    WHEN 'instagram' THEN 'ligacao'
    WHEN 'ligacao' THEN 'linkedin'
    WHEN 'linkedin' THEN 'tiktok'
    ELSE NULL
  END;

  IF v_proximo IS NULL THEN
    RAISE EXCEPTION 'Canal % não tem próxima fase na cascata', p_canal_atual;
  END IF;

  UPDATE public.campanha_proposta_lead_canais
  SET saiu_em = now(),
      motivo_saida = p_motivo,
      proximo_canal = v_proximo,
      status_final = 'transferido',
      movido_por = v_uid,
      motivo_movimentacao = 'avanco_fase'
  WHERE campanha_proposta_id = p_campanha_proposta_id
    AND lead_id = p_lead_id
    AND canal = p_canal_atual
    AND status_final = 'aberto';

  INSERT INTO public.campanha_proposta_lead_canais (
    campanha_proposta_id, lead_id, canal, criado_por, status_final, entrou_em
  ) VALUES (
    p_campanha_proposta_id, p_lead_id, v_proximo, v_uid, 'aberto', now()
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados, usuario_id)
  VALUES (
    p_lead_id,
    'canal_transferido',
    'Avançado de ' || p_canal_atual || ' para ' || v_proximo,
    jsonb_build_object(
      'campanha_proposta_id', p_campanha_proposta_id,
      'canal_origem', p_canal_atual,
      'canal_destino', v_proximo,
      'motivo', p_motivo
    ),
    v_uid
  );

  RETURN v_new_id;
END;
$function$;

-- =====================================================
-- 4) Tabela de SLA por canal
-- =====================================================
CREATE TABLE IF NOT EXISTS public.raia_sla_config (
  canal text PRIMARY KEY,
  prazo_horas int NOT NULL,
  acao_estouro text NOT NULL DEFAULT 'notificar',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.raia_sla_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "raia_sla_config_select_authenticated" ON public.raia_sla_config;
CREATE POLICY "raia_sla_config_select_authenticated"
  ON public.raia_sla_config FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "raia_sla_config_admin_write" ON public.raia_sla_config;
CREATE POLICY "raia_sla_config_admin_write"
  ON public.raia_sla_config FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- =====================================================
-- 5) View de produtividade
-- =====================================================
CREATE OR REPLACE VIEW public.vw_produtividade_disparos AS
WITH
campanhas_por_user AS (
  SELECT responsavel_id AS user_id,
         count(*) AS campanhas_criadas,
         coalesce(sum(enviados), 0) AS massa_enviados,
         coalesce(sum(falhas), 0) AS massa_falhas,
         coalesce(sum(total_contatos), 0) AS massa_contatos
  FROM public.disparos_campanhas
  WHERE responsavel_id IS NOT NULL
  GROUP BY responsavel_id
),
manuais_por_user AS (
  SELECT enviado_por AS user_id,
         count(*) FILTER (WHERE status = 'enviado') AS manuais_enviados,
         count(*) AS manuais_total
  FROM public.disparo_manual_envios
  WHERE enviado_por IS NOT NULL
  GROUP BY enviado_por
),
raias_abertas AS (
  SELECT criado_por AS user_id, count(*) AS raias_abertas
  FROM public.campanha_proposta_lead_canais
  WHERE criado_por IS NOT NULL
  GROUP BY criado_por
),
raias_movidas AS (
  SELECT movido_por AS user_id, count(*) AS raias_movidas
  FROM public.campanha_proposta_lead_canais
  WHERE movido_por IS NOT NULL
  GROUP BY movido_por
),
conversoes AS (
  SELECT convertido_por AS user_id, count(*) AS conversoes
  FROM public.leads
  WHERE convertido_por IS NOT NULL AND status = 'convertido'
  GROUP BY convertido_por
)
SELECT
  p.id AS user_id,
  p.nome_completo,
  coalesce(c.campanhas_criadas, 0) AS campanhas_criadas,
  coalesce(c.massa_enviados, 0) AS massa_enviados,
  coalesce(c.massa_falhas, 0) AS massa_falhas,
  coalesce(c.massa_contatos, 0) AS massa_contatos,
  coalesce(m.manuais_enviados, 0) AS manuais_enviados,
  coalesce(m.manuais_total, 0) AS manuais_total,
  coalesce(ra.raias_abertas, 0) AS raias_abertas,
  coalesce(rm.raias_movidas, 0) AS raias_movidas,
  coalesce(cv.conversoes, 0) AS conversoes
FROM public.profiles p
LEFT JOIN campanhas_por_user c ON c.user_id = p.id
LEFT JOIN manuais_por_user m ON m.user_id = p.id
LEFT JOIN raias_abertas ra ON ra.user_id = p.id
LEFT JOIN raias_movidas rm ON rm.user_id = p.id
LEFT JOIN conversoes cv ON cv.user_id = p.id
WHERE coalesce(c.campanhas_criadas, 0) +
      coalesce(m.manuais_total, 0) +
      coalesce(ra.raias_abertas, 0) +
      coalesce(rm.raias_movidas, 0) +
      coalesce(cv.conversoes, 0) > 0;

-- =====================================================
-- 6) RPC de ranking com filtro de período
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_ranking_disparos(
  p_periodo text DEFAULT 'semana',  -- 'semana' | 'mes' | 'total'
  p_metric text DEFAULT 'enviados'  -- 'enviados' | 'conversoes' | 'sla'
)
RETURNS TABLE(
  user_id uuid,
  nome_completo text,
  campanhas_criadas bigint,
  massa_enviados bigint,
  massa_falhas bigint,
  manuais_enviados bigint,
  raias_abertas bigint,
  raias_movidas bigint,
  conversoes bigint,
  sla_medio_horas numeric,
  sla_cumprido_pct numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio timestamptz;
  v_fim timestamptz := now();
BEGIN
  v_inicio := CASE p_periodo
    WHEN 'semana' THEN date_trunc('week', now())
    WHEN 'mes' THEN date_trunc('month', now())
    ELSE '1970-01-01'::timestamptz
  END;

  RETURN QUERY
  WITH
  cmp AS (
    SELECT responsavel_id AS uid,
           count(*)::bigint AS campanhas_criadas,
           coalesce(sum(enviados), 0)::bigint AS massa_enviados,
           coalesce(sum(falhas), 0)::bigint AS massa_falhas
    FROM public.disparos_campanhas
    WHERE responsavel_id IS NOT NULL
      AND created_at >= v_inicio AND created_at <= v_fim
    GROUP BY responsavel_id
  ),
  man AS (
    SELECT enviado_por AS uid,
           count(*) FILTER (WHERE status = 'enviado')::bigint AS manuais_enviados
    FROM public.disparo_manual_envios
    WHERE enviado_por IS NOT NULL
      AND created_at >= v_inicio AND created_at <= v_fim
    GROUP BY enviado_por
  ),
  ra AS (
    SELECT criado_por AS uid, count(*)::bigint AS raias_abertas
    FROM public.campanha_proposta_lead_canais
    WHERE criado_por IS NOT NULL
      AND entrou_em >= v_inicio AND entrou_em <= v_fim
    GROUP BY criado_por
  ),
  rm AS (
    SELECT movido_por AS uid, count(*)::bigint AS raias_movidas
    FROM public.campanha_proposta_lead_canais
    WHERE movido_por IS NOT NULL
      AND saiu_em IS NOT NULL
      AND saiu_em >= v_inicio AND saiu_em <= v_fim
    GROUP BY movido_por
  ),
  cv AS (
    SELECT convertido_por AS uid, count(*)::bigint AS conversoes
    FROM public.leads
    WHERE convertido_por IS NOT NULL
      AND status = 'convertido'
      AND data_conversao >= v_inicio AND data_conversao <= v_fim
    GROUP BY convertido_por
  ),
  sla AS (
    SELECT c.movido_por AS uid,
           avg(c.duracao_segundos) / 3600.0 AS sla_medio_horas,
           100.0 * count(*) FILTER (
             WHERE sc.prazo_horas IS NOT NULL
               AND c.duracao_segundos IS NOT NULL
               AND (c.duracao_segundos / 3600.0) <= sc.prazo_horas
           )::numeric / NULLIF(count(*) FILTER (WHERE sc.prazo_horas IS NOT NULL), 0)
             AS sla_cumprido_pct
    FROM public.campanha_proposta_lead_canais c
    LEFT JOIN public.raia_sla_config sc ON sc.canal = c.canal
    WHERE c.movido_por IS NOT NULL
      AND c.saiu_em IS NOT NULL
      AND c.saiu_em >= v_inicio AND c.saiu_em <= v_fim
    GROUP BY c.movido_por
  )
  SELECT
    p.id,
    p.nome_completo,
    coalesce(cmp.campanhas_criadas, 0),
    coalesce(cmp.massa_enviados, 0),
    coalesce(cmp.massa_falhas, 0),
    coalesce(man.manuais_enviados, 0),
    coalesce(ra.raias_abertas, 0),
    coalesce(rm.raias_movidas, 0),
    coalesce(cv.conversoes, 0),
    round(sla.sla_medio_horas::numeric, 2),
    round(sla.sla_cumprido_pct::numeric, 1)
  FROM public.profiles p
  LEFT JOIN cmp ON cmp.uid = p.id
  LEFT JOIN man ON man.uid = p.id
  LEFT JOIN ra ON ra.uid = p.id
  LEFT JOIN rm ON rm.uid = p.id
  LEFT JOIN cv ON cv.uid = p.id
  LEFT JOIN sla ON sla.uid = p.id
  WHERE coalesce(cmp.massa_enviados, 0)
      + coalesce(man.manuais_enviados, 0)
      + coalesce(ra.raias_abertas, 0)
      + coalesce(rm.raias_movidas, 0)
      + coalesce(cv.conversoes, 0) > 0
  ORDER BY
    CASE p_metric
      WHEN 'conversoes' THEN coalesce(cv.conversoes, 0)
      WHEN 'sla' THEN coalesce(sla.sla_cumprido_pct, 0)::bigint
      ELSE coalesce(cmp.massa_enviados, 0) + coalesce(man.manuais_enviados, 0)
    END DESC NULLS LAST;
END;
$function$;