-- WS4: RPC atômica pra duplicar campanha IA→manual com split por quantidade (top N frios).
-- Aplicada via Management API (aprovada pelo Raul 06/06). Clona a campanha como manual,
-- move os N leads frios mais antigos (saem da IA), e gera as 6 tasks por canal
-- (o trigger AFTER INSERT não dispara em UPDATE, então geramos aqui).
CREATE OR REPLACE FUNCTION public.duplicar_campanha_para_manual(p_campanha_origem uuid, p_qtd_leads int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE v_nova_id uuid;
BEGIN
  INSERT INTO campanhas (nome, canal, status, tipo_campanha, tipo_envio,
    especialidade_ids, especialidade_id, regiao_estado, chip_ids, chip_id,
    rotation_strategy, limite_diario_campanha, mensagem_inicial, briefing_ia,
    nome_remetente, whatsapp_remetente, descricao_oportunidade,
    horario_inteligente_ativo, horario_inicio_brt, horario_fim_brt, dias_semana, criado_por)
  SELECT left(nome,180)||' (Manual)', canal, 'ativa', tipo_campanha, 'manual',
    especialidade_ids, especialidade_id, regiao_estado, chip_ids, chip_id,
    rotation_strategy, limite_diario_campanha, mensagem_inicial, briefing_ia,
    nome_remetente, whatsapp_remetente, descricao_oportunidade,
    horario_inteligente_ativo, horario_inicio_brt, horario_fim_brt, dias_semana, criado_por
  FROM campanhas WHERE id = p_campanha_origem
  RETURNING id INTO v_nova_id;
  IF v_nova_id IS NULL THEN RAISE EXCEPTION 'Campanha origem nao encontrada'; END IF;

  WITH movidos AS (
    SELECT id FROM campanha_leads WHERE campanha_id = p_campanha_origem AND status = 'frio'
    ORDER BY created_at ASC LIMIT p_qtd_leads FOR UPDATE SKIP LOCKED
  )
  UPDATE campanha_leads cl SET campanha_id = v_nova_id FROM movidos m WHERE cl.id = m.id;

  INSERT INTO campanha_lead_tasks (campanha_lead_id, tipo, ordem, prazo_at)
  SELECT cl.id, t.tipo, t.ordem, now() + t.off
  FROM campanha_leads cl
  CROSS JOIN (VALUES ('whatsapp_1',1,interval '0'),('whatsapp_2',2,interval '1 day'),
    ('email',3,interval '2 days'),('whatsapp_3',4,interval '4 days'),
    ('instagram',5,interval '6 days'),('telefone',6,interval '8 days')) AS t(tipo,ordem,off)
  WHERE cl.campanha_id = v_nova_id
  ON CONFLICT (campanha_lead_id, tipo) DO NOTHING;

  RETURN v_nova_id;
END; $func$;

GRANT EXECUTE ON FUNCTION public.duplicar_campanha_para_manual(uuid,int) TO authenticated, service_role;
