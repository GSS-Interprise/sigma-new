-- Funil comercial canônico da prospecção.
-- Mantém os status técnicos existentes porque IA, disparos e BI dependem deles,
-- mas impede que "aprovado" seja contado como conversão antes do handoff a Contratos.

CREATE OR REPLACE FUNCTION public.prospeccao_aprovar(p_campanha_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_validacoes jsonb;
  v_validacoes_ok integer;
  v_lead_id uuid;
  v_campanha_id uuid;
  v_etapa_atual text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autenticado');
  END IF;

  SELECT lead_id, campanha_id, coalesce(validacoes, '{}'::jsonb), etapa_acompanhamento
    INTO v_lead_id, v_campanha_id, v_validacoes, v_etapa_atual
    FROM public.campanha_leads
   WHERE id = p_campanha_lead_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_encontrado');
  END IF;

  v_validacoes_ok := public._prospeccao_validacoes_ok(v_validacoes);
  IF v_validacoes_ok < 4 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'validacoes_incompletas',
      'validacoes_ok', v_validacoes_ok
    );
  END IF;

  UPDATE public.campanha_leads
     SET etapa_acompanhamento = 'aprovado',
         resultado_final = NULL,
         status = CASE
           WHEN status IN ('convertido', 'descartado') THEN status
           ELSE 'quente'::public.status_lead_campanha
         END,
         data_status = now(),
         updated_at = now()
   WHERE id = p_campanha_lead_id;

  IF v_etapa_atual IS DISTINCT FROM 'aprovado' THEN
    INSERT INTO public.lead_historico(
      lead_id, tipo_evento, descricao_resumida, metadados
    ) VALUES (
      v_lead_id,
      'campanha_status_change'::public.tipo_evento_lead,
      'Médico encaminhado para a oportunidade',
      jsonb_build_object(
        'campanha_id', v_campanha_id,
        'campanha_lead_id', p_campanha_lead_id,
        'etapa_anterior', v_etapa_atual,
        'etapa_nova', 'encaminhado',
        'alterado_por', v_uid
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'etapa', 'aprovado',
    'etapa_crm', 'encaminhado',
    'convertido', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prospeccao_mover_etapa(
  p_campanha_lead_id uuid,
  p_etapa text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_validacoes jsonb;
  v_etapa_atual text;
  v_validacoes_ok integer;
  v_lead_id uuid;
  v_campanha_id uuid;
  v_ja_convertido boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autenticado');
  END IF;
  IF p_etapa NOT IN ('quente', 'em_analise', 'aprovado', 'na_escala', 'perdido') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'etapa_invalida');
  END IF;

  SELECT cl.etapa_acompanhamento,
         coalesce(cl.validacoes, '{}'::jsonb),
         cl.lead_id,
         cl.campanha_id,
         (l.convertido_por IS NOT NULL)
    INTO v_etapa_atual, v_validacoes, v_lead_id, v_campanha_id, v_ja_convertido
    FROM public.campanha_leads cl
    JOIN public.leads l ON l.id = cl.lead_id
   WHERE cl.id = p_campanha_lead_id
   FOR UPDATE OF cl;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_encontrado');
  END IF;

  IF p_etapa = 'aprovado' THEN
    v_validacoes_ok := public._prospeccao_validacoes_ok(v_validacoes);
    IF v_validacoes_ok < 4 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'validacoes_incompletas',
        'validacoes_ok', v_validacoes_ok
      );
    END IF;
  END IF;

  IF p_etapa = 'na_escala' AND v_etapa_atual <> 'aprovado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requer_aprovado_antes');
  END IF;

  UPDATE public.campanha_leads
     SET etapa_acompanhamento = p_etapa,
         status = CASE
           WHEN p_etapa = 'na_escala' THEN 'convertido'::public.status_lead_campanha
           ELSE status
         END,
         resultado_final = CASE
           WHEN p_etapa = 'na_escala' THEN 'aprovado'
           WHEN p_etapa = 'perdido' THEN 'perdido'
           ELSE resultado_final
         END,
         data_status = CASE
           WHEN etapa_acompanhamento IS DISTINCT FROM p_etapa THEN now()
           ELSE data_status
         END,
         updated_at = now()
   WHERE id = p_campanha_lead_id;

  -- Conversão só nasce no último passo: handoff confirmado para Contratos.
  IF p_etapa = 'na_escala' AND NOT v_ja_convertido THEN
    UPDATE public.leads
       SET convertido_por = v_uid,
           data_conversao = now(),
           canal_conversao = 'prospeccao'
     WHERE id = v_lead_id
       AND convertido_por IS NULL;
  END IF;

  IF v_etapa_atual IS DISTINCT FROM p_etapa THEN
    INSERT INTO public.lead_historico(
      lead_id, tipo_evento, descricao_resumida, metadados
    ) VALUES (
      v_lead_id,
      'campanha_status_change'::public.tipo_evento_lead,
      CASE p_etapa
        WHEN 'quente' THEN 'Médico qualificado para a oportunidade'
        WHEN 'em_analise' THEN 'Qualificação do médico em andamento'
        WHEN 'aprovado' THEN 'Médico encaminhado para a oportunidade'
        WHEN 'na_escala' THEN 'Médico convertido e encaminhado ao setor de contratos'
        WHEN 'perdido' THEN 'Médico marcado como perdido'
      END,
      jsonb_build_object(
        'campanha_id', v_campanha_id,
        'campanha_lead_id', p_campanha_lead_id,
        'etapa_anterior', v_etapa_atual,
        'etapa_nova', p_etapa,
        'alterado_por', v_uid
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'etapa', p_etapa,
    'etapa_crm', CASE p_etapa
      WHEN 'quente' THEN 'qualificado'
      WHEN 'em_analise' THEN 'qualificado'
      WHEN 'aprovado' THEN 'encaminhado'
      WHEN 'na_escala' THEN 'convertido'
      WHEN 'perdido' THEN 'perdido'
    END,
    'convertido', p_etapa = 'na_escala'
  );
END;
$$;

-- A view expõe uma etapa comercial única sem remover os campos legados.
CREATE OR REPLACE VIEW public.vw_acompanhamento_kanban AS
SELECT full_view.*,
       CASE
         WHEN full_view.etapa_acompanhamento = 'perdido'
           OR full_view.resultado_final = 'perdido'
           OR full_view.status = 'descartado' THEN 'perdido'
         WHEN full_view.etapa_acompanhamento = 'na_escala'
           OR full_view.status = 'convertido' THEN 'convertido'
         WHEN full_view.etapa_acompanhamento = 'aprovado' THEN 'encaminhado'
         WHEN full_view.etapa_acompanhamento IN ('quente', 'em_analise')
           OR full_view.status IN ('aquecido', 'quente') THEN 'qualificado'
         WHEN full_view.status = 'em_conversa' AND full_view.assumido_por IS NOT NULL
           THEN 'em_atendimento'
         WHEN full_view.status = 'em_conversa' THEN 'respondeu'
         WHEN full_view.status IN ('contatado', 'sem_resposta') THEN 'contatado'
         ELSE 'novo'
       END AS etapa_crm
FROM public.vw_acompanhamento_kanban_full full_view
WHERE full_view.etapa_acompanhamento IS NOT NULL
   OR full_view.tipo_envio = 'manual'
   OR full_view.status IN ('em_conversa', 'aquecido', 'quente', 'convertido', 'descartado');

GRANT SELECT ON public.vw_acompanhamento_kanban TO authenticated, service_role;

COMMENT ON VIEW public.vw_acompanhamento_kanban IS
  'Funil CRM canônico: novo, contatado, respondeu, em_atendimento, qualificado, encaminhado, convertido e perdido.';

COMMENT ON FUNCTION public.prospeccao_aprovar(uuid) IS
  'Conclui validações e encaminha o médico para a oportunidade, sem antecipar a conversão.';

COMMENT ON FUNCTION public.prospeccao_mover_etapa(uuid, text) IS
  'Move o pós-atendimento; na_escala representa o handoff final a Contratos e só então converte.';

CREATE OR REPLACE FUNCTION public.prospeccao_marcar_perdido(
  p_campanha_lead_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_campanha_id uuid;
  v_lead_id uuid;
  v_motivo_visivel text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autenticado');
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'motivo_obrigatorio');
  END IF;

  SELECT campanha_id, lead_id
    INTO v_campanha_id, v_lead_id
    FROM public.campanha_leads
   WHERE id = p_campanha_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_encontrado');
  END IF;

  -- A equipe vê um termo claro em português; internamente reutilizamos a rotina
  -- canônica que bloqueia o contato globalmente e mantém a trilha LGPD.
  IF p_motivo = 'solicitou_nao_receber_mensagens' THEN
    PERFORM public.classificar_saida_campanha(
      v_campanha_id,
      v_lead_id,
      'nao_contatar',
      'Solicitou não receber mensagens'
    );
    RETURN jsonb_build_object(
      'ok', true,
      'etapa', 'perdido',
      'motivo', 'Solicitou não receber mensagens',
      'bloqueio_global', true
    );
  END IF;

  v_motivo_visivel := trim(p_motivo);
  UPDATE public.campanha_leads
     SET etapa_acompanhamento = 'perdido',
         resultado_final = 'perdido',
         motivo_perdido = v_motivo_visivel,
         status = 'descartado'::public.status_lead_campanha,
         data_status = now(),
         proximo_touch_em = NULL,
         proximo_passo_id = NULL,
         updated_at = now()
   WHERE id = p_campanha_lead_id;

  INSERT INTO public.lead_historico(
    lead_id, tipo_evento, descricao_resumida, metadados
  ) VALUES (
    v_lead_id,
    'campanha_status_change'::public.tipo_evento_lead,
    'Médico marcado como perdido',
    jsonb_build_object(
      'campanha_id', v_campanha_id,
      'campanha_lead_id', p_campanha_lead_id,
      'motivo', v_motivo_visivel,
      'alterado_por', v_uid
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'etapa', 'perdido',
    'motivo', v_motivo_visivel,
    'bloqueio_global', false
  );
END;
$$;

COMMENT ON FUNCTION public.prospeccao_marcar_perdido(uuid, text) IS
  'Finaliza a oportunidade com motivo; a opção em português para não receber mensagens aplica bloqueio global.';
