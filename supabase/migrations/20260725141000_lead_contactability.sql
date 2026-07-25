CREATE TABLE IF NOT EXISTS public.lead_contactability (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN (
    'active',
    'no_whatsapp',
    'retired',
    'invalid_contact'
  )),
  reason text,
  source_campaign_id uuid REFERENCES public.campanhas(id) ON DELETE SET NULL,
  reported_by uuid REFERENCES auth.users(id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_contactability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_contactability_select ON public.lead_contactability;
CREATE POLICY lead_contactability_select
  ON public.lead_contactability FOR SELECT TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.lead_contactability
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lead_contactability TO authenticated;
GRANT ALL ON public.lead_contactability TO service_role;

CREATE OR REPLACE FUNCTION public.classificar_saida_campanha(
  p_campanha_id uuid,
  p_lead_id uuid,
  p_motivo text,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.status_lead_campanha;
  v_global_status text;
  v_phone text;
  v_nome text;
BEGIN
  IF p_motivo NOT IN (
    'sem_whatsapp',
    'aposentado',
    'distancia',
    'nao_contatar',
    'contato_invalido',
    'indisponivel_agora',
    'sem_interesse_oportunidade'
  ) THEN
    RAISE EXCEPTION 'Motivo de saída inválido: %', p_motivo;
  END IF;

  SELECT phone_e164, nome INTO v_phone, v_nome
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Médico não encontrado';
  END IF;

  v_status := CASE
    WHEN p_motivo = 'sem_whatsapp' THEN 'sem_whatsapp'::public.status_lead_campanha
    ELSE 'descartado'::public.status_lead_campanha
  END;

  UPDATE public.campanha_leads
  SET status = v_status,
      resultado_final = 'perdido',
      motivo_perdido = p_motivo,
      data_status = now(),
      proximo_touch_em = NULL,
      proximo_passo_id = NULL,
      aguarda_resposta_humana = false,
      metadados = coalesce(metadados, '{}'::jsonb) || jsonb_build_object(
        'motivo_saida', p_motivo,
        'observacao_saida', nullif(trim(coalesce(p_observacao, '')), ''),
        'classificado_por', auth.uid(),
        'classificado_em', now()
      ),
      updated_at = now()
  WHERE campanha_id = p_campanha_id
    AND lead_id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Médico não pertence a esta campanha';
  END IF;

  v_global_status := CASE p_motivo
    WHEN 'sem_whatsapp' THEN 'no_whatsapp'
    WHEN 'aposentado' THEN 'retired'
    WHEN 'contato_invalido' THEN 'invalid_contact'
    ELSE NULL
  END;

  IF v_global_status IS NOT NULL THEN
    INSERT INTO public.lead_contactability(
      lead_id, status, reason, source_campaign_id, reported_by
    )
    VALUES (
      p_lead_id, v_global_status, p_observacao, p_campanha_id, auth.uid()
    )
    ON CONFLICT (lead_id) DO UPDATE
    SET status = EXCLUDED.status,
        reason = EXCLUDED.reason,
        source_campaign_id = EXCLUDED.source_campaign_id,
        reported_by = EXCLUDED.reported_by,
        reported_at = now(),
        updated_at = now();
  END IF;

  IF p_motivo = 'nao_contatar' THEN
    INSERT INTO public.blacklist(
      phone_e164, nome, origem, reason, created_by
    )
    VALUES (
      v_phone, v_nome, 'campanha', coalesce(nullif(trim(p_observacao), ''), 'Não deseja mais receber contatos'), auth.uid()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.lead_historico(
    lead_id, tipo_evento, descricao_resumida, metadados
  )
  VALUES (
    p_lead_id,
    'campanha_status_change',
    CASE
      WHEN p_motivo = 'sem_whatsapp' THEN 'Classificado como sem WhatsApp'
      WHEN p_motivo = 'nao_contatar' THEN 'Opt-out global solicitado'
      ELSE 'Saída da campanha: ' || p_motivo
    END,
    jsonb_build_object(
      'campanha_id', p_campanha_id,
      'motivo', p_motivo,
      'observacao', nullif(trim(coalesce(p_observacao, '')), ''),
      'escopo', CASE
        WHEN p_motivo IN ('sem_whatsapp', 'aposentado', 'contato_invalido', 'nao_contatar') THEN 'global'
        ELSE 'campanha'
      END
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_status,
    'motivo', p_motivo,
    'global', p_motivo IN ('sem_whatsapp', 'aposentado', 'contato_invalido', 'nao_contatar')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.classificar_saida_campanha(uuid, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classificar_saida_campanha(uuid, uuid, text, text)
  TO authenticated, service_role;

-- Seleção canônica: médicos globalmente indisponíveis não voltam para uma nova
-- campanha. Opt-out continua sendo tratado pela blacklist e por leads.opt_out.
CREATE OR REPLACE FUNCTION public.selecionar_leads_campanha(
  p_campanha_id uuid,
  p_limite integer DEFAULT 50
)
RETURNS TABLE(
  lead_id uuid,
  nome text,
  phone_e164 text,
  especialidade_nome text,
  uf text,
  cidade text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_especialidade_ids uuid[];
  v_especialidade_id_legacy uuid;
  v_sem_esp boolean;
  v_estado text;
  v_cidades text[];
  v_excluidos uuid[];
  v_tem_email boolean;
  v_idade_min integer;
  v_idade_max integer;
  v_origem text;
BEGIN
  SELECT
    c.especialidade_ids,
    c.especialidade_id,
    coalesce(c.sem_especialidade, false),
    c.regiao_estado,
    c.regiao_cidades,
    c.leads_excluidos_ids,
    coalesce(c.filtro_tem_email, false),
    c.filtro_idade_min,
    c.filtro_idade_max,
    c.filtro_origem
  INTO
    v_especialidade_ids,
    v_especialidade_id_legacy,
    v_sem_esp,
    v_estado,
    v_cidades,
    v_excluidos,
    v_tem_email,
    v_idade_min,
    v_idade_max,
    v_origem
  FROM public.campanhas c
  WHERE c.id = p_campanha_id;

  IF (v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0)
     AND v_especialidade_id_legacy IS NOT NULL THEN
    v_especialidade_ids := ARRAY[v_especialidade_id_legacy];
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (l.id)
    l.id,
    l.nome,
    l.phone_e164,
    coalesce(e.nome, 'Generalista'),
    l.uf,
    l.cidade
  FROM public.leads l
  LEFT JOIN public.lead_especialidades le ON le.lead_id = l.id
  LEFT JOIN public.especialidades e ON e.id = le.especialidade_id
  WHERE l.merged_into_id IS NULL
    AND (
      CASE
        WHEN v_sem_esp AND (v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0)
          THEN le.lead_id IS NULL
        WHEN v_sem_esp
          THEN le.lead_id IS NULL OR le.especialidade_id = ANY(v_especialidade_ids)
        WHEN v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0
          THEN le.lead_id IS NOT NULL
        ELSE le.especialidade_id = ANY(v_especialidade_ids)
      END
    )
    AND (v_estado IS NULL OR l.uf = v_estado)
    AND (v_cidades IS NULL OR cardinality(v_cidades) = 0 OR l.cidade = ANY(v_cidades))
    AND (v_tem_email IS NOT TRUE OR nullif(l.email, '') IS NOT NULL)
    AND (v_origem IS NULL OR l.origem = v_origem)
    AND (v_idade_min IS NULL OR (l.data_nascimento IS NOT NULL AND date_part('year', age(l.data_nascimento)) >= v_idade_min))
    AND (v_idade_max IS NULL OR (l.data_nascimento IS NOT NULL AND date_part('year', age(l.data_nascimento)) <= v_idade_max))
    AND nullif(l.phone_e164, '') IS NOT NULL
    AND l.opt_out = false
    AND l.classificacao NOT IN ('protegido', 'proibido')
    AND (l.cooldown_ate IS NULL OR l.cooldown_ate <= now())
    AND l.data_conversao IS NULL
    AND l.convertido_por IS NULL
    AND (l.unidades_vinculadas IS NULL OR cardinality(l.unidades_vinculadas) = 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.blacklist bl WHERE bl.phone_e164 = l.phone_e164
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.lead_contactability lc
      WHERE lc.lead_id = l.id AND lc.status <> 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.campanha_leads cl
      WHERE cl.lead_id = l.id AND cl.campanha_id = p_campanha_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.leads_bloqueio_temporario lb
      WHERE lb.lead_id = l.id AND lb.removed_at IS NULL
    )
    AND (
      v_excluidos IS NULL
      OR cardinality(v_excluidos) = 0
      OR NOT l.id = ANY(v_excluidos)
    )
  ORDER BY l.id
  LIMIT p_limite;
END;
$$;

COMMENT ON TABLE public.lead_contactability IS
  'Disponibilidade global do contato, separada de perda em uma campanha e de opt-out LGPD.';
