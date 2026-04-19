CREATE OR REPLACE FUNCTION atualizar_status_lead_campanha(
  p_campanha_id UUID,
  p_lead_id UUID,
  p_novo_status status_lead_campanha,
  p_canal TEXT DEFAULT NULL,
  p_metadados JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campanha_leads
  SET
    status = p_novo_status,
    canal_atual = COALESCE(p_canal, canal_atual),
    data_ultimo_contato = CASE WHEN p_novo_status IN ('contatado', 'em_conversa', 'aquecido', 'quente') THEN NOW() ELSE data_ultimo_contato END,
    data_primeiro_contato = CASE WHEN data_primeiro_contato IS NULL AND p_novo_status = 'contatado' THEN NOW() ELSE data_primeiro_contato END,
    tentativas = CASE WHEN p_novo_status = 'contatado' THEN tentativas + 1 ELSE tentativas END,
    metadados = metadados || p_metadados
  WHERE campanha_id = p_campanha_id AND lead_id = p_lead_id;

  INSERT INTO lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
  VALUES (
    p_lead_id,
    'campanha_status_change',
    'Status alterado para ' || p_novo_status::text || ' na campanha',
    jsonb_build_object(
      'campanha_id', p_campanha_id,
      'novo_status', p_novo_status,
      'canal', p_canal
    ) || p_metadados
  );
END;
$$;

CREATE OR REPLACE FUNCTION exportar_leads_trafego_pago(
  p_campanha_id UUID
)
RETURNS TABLE (
  lead_id UUID,
  nome TEXT,
  email TEXT,
  phone TEXT,
  especialidade TEXT,
  uf TEXT,
  cidade TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cl.lead_id,
    l.nome,
    l.email,
    l.phone_e164 AS phone,
    e.nome AS especialidade,
    l.uf,
    l.cidade
  FROM campanha_leads cl
  JOIN leads l ON l.id = cl.lead_id
  LEFT JOIN lead_especialidades le ON le.lead_id = l.id
  LEFT JOIN especialidades e ON e.id = le.especialidade_id
  WHERE cl.campanha_id = p_campanha_id
  GROUP BY cl.lead_id, l.nome, l.email, l.phone_e164, e.nome, l.uf, l.cidade;

  INSERT INTO lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
  SELECT
    cl.lead_id,
    'export_trafego_pago',
    'Exportado para trafego pago',
    jsonb_build_object('campanha_id', p_campanha_id, 'exportado_em', NOW())
  FROM campanha_leads cl
  WHERE cl.campanha_id = p_campanha_id
  ON CONFLICT DO NOTHING;
END;
$$;
