-- 1) Estender a função de clonagem para registrar evento no histórico do lead
CREATE OR REPLACE FUNCTION public.clonar_proposta_para_lead(proposta_origem_id uuid, lead_destino_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid;
  v_new_id uuid;
  v_origem RECORD;
  v_lead_nome text;
  v_next_numero int;
  v_descricao_marker text;
  v_campanha_nome text;
  v_campanha_id uuid;
  v_campanha_proposta_id uuid;
  v_already_logged boolean;
BEGIN
  IF proposta_origem_id IS NULL OR lead_destino_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_descricao_marker := 'origem_proposta:' || proposta_origem_id::text;

  SELECT id INTO v_existing_id
    FROM public.proposta
   WHERE lead_id = lead_destino_id
     AND descricao LIKE '%' || v_descricao_marker || '%'
   LIMIT 1;

  IF v_existing_id IS NULL THEN
    SELECT * INTO v_origem FROM public.proposta WHERE id = proposta_origem_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    SELECT COALESCE(nome, '') INTO v_lead_nome FROM public.leads WHERE id = lead_destino_id;

    SELECT COALESCE(MAX(numero_proposta), 0) + 1
      INTO v_next_numero
      FROM public.proposta
     WHERE lead_id = lead_destino_id;

    INSERT INTO public.proposta (
      lead_id, contrato_id, unidade_id, servico_id, licitacao_id,
      tipo, status, valor, nome, observacoes, descricao,
      numero_proposta, tipo_disparo,
      mensagem_whatsapp, mensagem_email, mensagem_instagram, mensagem_linkedin, mensagem_tiktok
    )
    VALUES (
      lead_destino_id,
      v_origem.contrato_id, v_origem.unidade_id, v_origem.servico_id, v_origem.licitacao_id,
      'personalizada', 'personalizada', v_origem.valor,
      'Proposta personalizada - ' || COALESCE(NULLIF(v_lead_nome, ''), 'Lead'),
      v_origem.observacoes,
      'Proposta personalizada via campanha [' || v_descricao_marker || ']',
      v_next_numero, v_origem.tipo_disparo,
      v_origem.mensagem_whatsapp, v_origem.mensagem_email, v_origem.mensagem_instagram,
      v_origem.mensagem_linkedin, v_origem.mensagem_tiktok
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.proposta_itens (
      proposta_id, contrato_item_id, item_nome, valor_contrato, valor_medico, quantidade
    )
    SELECT v_new_id, contrato_item_id, item_nome, valor_contrato, valor_medico, quantidade
      FROM public.proposta_itens
     WHERE proposta_id = proposta_origem_id;
  ELSE
    v_new_id := v_existing_id;
  END IF;

  -- Idempotência do evento de histórico
  SELECT EXISTS(
    SELECT 1 FROM public.lead_historico
     WHERE lead_id = lead_destino_id
       AND tipo_evento = 'proposta_enviada'
       AND proposta_id = v_new_id
  ) INTO v_already_logged;

  IF NOT v_already_logged THEN
    -- Tenta resolver campanha (best-effort) a partir do disparo mais recente desse par lead+proposta_origem
    SELECT dc.campanha_proposta_id, cp.campanha_id
      INTO v_campanha_proposta_id, v_campanha_id
      FROM public.disparos_contatos dc
      JOIN public.campanha_propostas cp ON cp.id = dc.campanha_proposta_id
     WHERE dc.lead_id = lead_destino_id
       AND cp.proposta_id = proposta_origem_id
     ORDER BY dc.created_at DESC NULLS LAST
     LIMIT 1;

    IF v_campanha_id IS NOT NULL THEN
      SELECT nome INTO v_campanha_nome FROM public.campanhas WHERE id = v_campanha_id;
    END IF;

    INSERT INTO public.lead_historico (
      lead_id, tipo_evento, proposta_id, descricao_resumida, metadados
    )
    VALUES (
      lead_destino_id,
      'proposta_enviada',
      v_new_id,
      'Proposta enviada via campanha' || COALESCE(' "' || v_campanha_nome || '"', ''),
      jsonb_build_object(
        'origem', 'campanha',
        'campanha_id', v_campanha_id,
        'campanha_proposta_id', v_campanha_proposta_id,
        'proposta_origem_id', proposta_origem_id,
        'canal', 'whatsapp'
      )
    );
  END IF;

  RETURN v_new_id;
END;
$function$;

-- 2) Backfill: para cada proposta personalizada já clonada que não possui evento, criar um lead_historico
-- usando a data do disparo correspondente quando possível.
WITH personalizadas AS (
  SELECT p.id AS proposta_id,
         p.lead_id,
         -- extrai uuid de origem do marcador 'origem_proposta:<uuid>'
         NULLIF(substring(p.descricao FROM 'origem_proposta:([0-9a-fA-F\-]{36})'), '')::uuid AS proposta_origem_id
    FROM public.proposta p
   WHERE p.tipo = 'personalizada'
     AND p.lead_id IS NOT NULL
     AND p.descricao LIKE '%origem_proposta:%'
),
candidatos AS (
  SELECT pe.proposta_id,
         pe.lead_id,
         pe.proposta_origem_id,
         dc.campanha_proposta_id,
         cp.campanha_id,
         c.nome AS campanha_nome,
         COALESCE(dc.created_at, now()) AS evento_ts
    FROM personalizadas pe
    LEFT JOIN LATERAL (
      SELECT dc.*
        FROM public.disparos_contatos dc
        JOIN public.campanha_propostas cp ON cp.id = dc.campanha_proposta_id
       WHERE dc.lead_id = pe.lead_id
         AND cp.proposta_id = pe.proposta_origem_id
       ORDER BY dc.created_at DESC NULLS LAST
       LIMIT 1
    ) dc ON true
    LEFT JOIN public.campanha_propostas cp ON cp.id = dc.campanha_proposta_id
    LEFT JOIN public.campanhas c ON c.id = cp.campanha_id
   WHERE NOT EXISTS (
     SELECT 1 FROM public.lead_historico lh
      WHERE lh.lead_id = pe.lead_id
        AND lh.tipo_evento = 'proposta_enviada'
        AND lh.proposta_id = pe.proposta_id
   )
)
INSERT INTO public.lead_historico (
  lead_id, tipo_evento, proposta_id, descricao_resumida, metadados, criado_em
)
SELECT lead_id,
       'proposta_enviada',
       proposta_id,
       'Proposta enviada via campanha' || COALESCE(' "' || campanha_nome || '"', ''),
       jsonb_build_object(
         'origem', 'campanha',
         'campanha_id', campanha_id,
         'campanha_proposta_id', campanha_proposta_id,
         'proposta_origem_id', proposta_origem_id,
         'canal', 'whatsapp',
         'backfill', true
       ),
       evento_ts
  FROM candidatos;