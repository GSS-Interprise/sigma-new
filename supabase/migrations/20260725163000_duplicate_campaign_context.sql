-- Duplica a configuração sem mover/apagar o histórico da campanha original.
CREATE OR REPLACE FUNCTION public.duplicate_campaign_context(
  p_campanha_origem uuid,
  p_nome text,
  p_tipo_envio text DEFAULT 'manual',
  p_status text DEFAULT 'rascunho',
  p_regiao_estado text DEFAULT NULL,
  p_qtd_leads integer DEFAULT 0,
  p_copy_strategies boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nova_id uuid;
  v_default_strategy uuid;
BEGIN
  IF p_tipo_envio NOT IN ('ia', 'manual', 'ambos') THEN
    RAISE EXCEPTION 'Modalidade inválida';
  END IF;
  IF p_status NOT IN ('rascunho', 'ativa', 'pausada') THEN
    RAISE EXCEPTION 'Status inicial inválido';
  END IF;
  IF nullif(btrim(p_nome), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome da nova campanha';
  END IF;

  INSERT INTO public.campanhas (
    nome, canal, status, tipo_campanha, tipo_envio,
    especialidade_ids, especialidade_id, regiao_estado,
    rotation_strategy, limite_diario_campanha, mensagem_inicial, briefing_ia,
    nome_remetente, whatsapp_remetente, descricao_oportunidade,
    horario_inteligente_ativo, horario_inicio_brt, horario_fim_brt, dias_semana,
    publico_alvo, filtro_tem_email, filtro_idade_min, filtro_idade_max,
    filtro_origem, tarefa_cadencia_passos, criado_por
  )
  SELECT
    left(btrim(p_nome), 200), canal, p_status::public.status_campanha,
    tipo_campanha, p_tipo_envio,
    especialidade_ids, especialidade_id,
    coalesce(nullif(btrim(p_regiao_estado), ''), regiao_estado),
    rotation_strategy, limite_diario_campanha, mensagem_inicial, briefing_ia,
    nome_remetente, whatsapp_remetente, descricao_oportunidade,
    horario_inteligente_ativo, horario_inicio_brt, horario_fim_brt, dias_semana,
    publico_alvo, filtro_tem_email, filtro_idade_min, filtro_idade_max,
    filtro_origem, tarefa_cadencia_passos, auth.uid()
  FROM public.campanhas
  WHERE id = p_campanha_origem
  RETURNING id INTO v_nova_id;

  IF v_nova_id IS NULL THEN
    RAISE EXCEPTION 'Campanha de origem não encontrada';
  END IF;

  IF p_copy_strategies THEN
    DELETE FROM public.campaign_strategies WHERE campanha_id = v_nova_id;
    INSERT INTO public.campaign_strategies (
      campanha_id, nome, descricao, status, prioridade, publico_alvo,
      ordem_regioes, abordagem, briefing_ia, inicio_em, fim_em, created_by
    )
    SELECT
      v_nova_id, nome,
      coalesce(descricao, '') || CASE WHEN descricao IS NULL THEN '' ELSE E'\n' END ||
        'Copiada da campanha ' || p_campanha_origem::text,
      CASE WHEN p_status = 'ativa' AND status = 'ativa' THEN 'ativa' ELSE 'rascunho' END,
      prioridade, publico_alvo, ordem_regioes, abordagem, briefing_ia,
      NULL, NULL, auth.uid()
    FROM public.campaign_strategies
    WHERE campanha_id = p_campanha_origem
    ORDER BY prioridade, created_at;
  END IF;

  SELECT id INTO v_default_strategy
  FROM public.campaign_strategies
  WHERE campanha_id = v_nova_id
  ORDER BY prioridade, created_at
  LIMIT 1;

  IF coalesce(p_qtd_leads, 0) > 0 THEN
    INSERT INTO public.campanha_leads (
      campanha_id, lead_id, status, strategy_id, metadados
    )
    SELECT
      v_nova_id,
      cl.lead_id,
      'frio'::public.status_lead_campanha,
      coalesce(
        (
          SELECT ns.id
          FROM public.campaign_strategies os
          JOIN public.campaign_strategies ns
            ON ns.campanha_id = v_nova_id AND ns.nome = os.nome
          WHERE os.id = cl.strategy_id
          LIMIT 1
        ),
        v_default_strategy
      ),
      jsonb_build_object(
        'duplicado_de_campanha_lead', cl.id,
        'duplicado_em', now(),
        'duplicado_por', auth.uid()
      )
    FROM public.campanha_leads cl
    WHERE cl.campanha_id = p_campanha_origem
      AND cl.status = 'frio'
    ORDER BY cl.created_at
    LIMIT greatest(p_qtd_leads, 0)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_nova_id;
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_campaign_context(
  uuid, text, text, text, text, integer, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_campaign_context(
  uuid, text, text, text, text, integer, boolean
) TO authenticated, service_role;

COMMENT ON FUNCTION public.duplicate_campaign_context(
  uuid, text, text, text, text, integer, boolean
) IS 'Copia configuração, estratégias e leads frios sem alterar o histórico da origem.';
