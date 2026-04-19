CREATE OR REPLACE FUNCTION selecionar_leads_campanha(
  p_campanha_id UUID,
  p_limite INTEGER DEFAULT 50
)
RETURNS TABLE (
  lead_id UUID,
  nome TEXT,
  phone_e164 TEXT,
  especialidade_nome TEXT,
  uf TEXT,
  cidade TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_especialidade_id UUID;
  v_estado TEXT;
  v_cidades TEXT[];
BEGIN
  SELECT c.especialidade_id, c.regiao_estado, c.regiao_cidades
  INTO v_especialidade_id, v_estado, v_cidades
  FROM campanhas c WHERE c.id = p_campanha_id;

  RETURN QUERY
  SELECT DISTINCT ON (l.id)
    l.id AS lead_id,
    l.nome,
    l.phone_e164,
    e.nome AS especialidade_nome,
    l.uf,
    l.cidade
  FROM leads l
  JOIN lead_especialidades le ON le.lead_id = l.id
  JOIN especialidades e ON e.id = le.especialidade_id
  WHERE l.merged_into_id IS NULL
    AND (v_especialidade_id IS NULL OR le.especialidade_id = v_especialidade_id)
    AND (v_estado IS NULL OR l.uf = v_estado)
    AND (v_cidades IS NULL OR array_length(v_cidades, 1) IS NULL OR l.cidade = ANY(v_cidades))
    AND l.phone_e164 IS NOT NULL
    AND l.phone_e164 != ''
    AND NOT EXISTS (
      SELECT 1 FROM campanha_leads cl
      WHERE cl.lead_id = l.id AND cl.campanha_id = p_campanha_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM leads_bloqueio_temporario lb
      WHERE lb.lead_id = l.id
    )
  ORDER BY l.id
  LIMIT p_limite;
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

  INSERT INTO lead_historico (lead_id, tipo_evento, metadados)
  SELECT
    cl.lead_id,
    'export_trafego_pago',
    jsonb_build_object('campanha_id', p_campanha_id, 'exportado_em', NOW())
  FROM campanha_leads cl
  WHERE cl.campanha_id = p_campanha_id
  ON CONFLICT DO NOTHING;
END;
$$;
