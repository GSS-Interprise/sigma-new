-- =====================================================
-- Passo 1.3: Criar junction table lead_especialidades
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_especialidades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  especialidade_id UUID NOT NULL REFERENCES especialidades(id),
  rqe TEXT,
  fonte TEXT DEFAULT 'import',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, especialidade_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_esp_lead ON lead_especialidades(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_esp_esp ON lead_especialidades(especialidade_id);

-- RLS
ALTER TABLE lead_especialidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view lead_especialidades"
  ON lead_especialidades FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert lead_especialidades"
  ON lead_especialidades FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update lead_especialidades"
  ON lead_especialidades FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete lead_especialidades"
  ON lead_especialidades FOR DELETE TO authenticated USING (true);

-- =====================================================
-- Passo 1.4: Migrar dados existentes para junction
-- =====================================================

-- 1. Leads com especialidade_id preenchido
INSERT INTO lead_especialidades (lead_id, especialidade_id, fonte)
SELECT l.id, l.especialidade_id, 'migration'
FROM leads l
WHERE l.especialidade_id IS NOT NULL
  AND l.merged_into_id IS NULL
ON CONFLICT (lead_id, especialidade_id) DO NOTHING;

-- 2. Leads com texto livre mas sem ID: lookup por nome exato (case-insensitive)
INSERT INTO lead_especialidades (lead_id, especialidade_id, fonte)
SELECT l.id, e.id, 'migration_text'
FROM leads l
JOIN especialidades e ON UPPER(TRIM(l.especialidade)) = e.nome
WHERE l.especialidade IS NOT NULL
  AND TRIM(l.especialidade) != ''
  AND l.especialidade_id IS NULL
  AND l.merged_into_id IS NULL
ON CONFLICT (lead_id, especialidade_id) DO NOTHING;

-- 3. Leads com texto livre que não matcharam por nome: tentar por alias
INSERT INTO lead_especialidades (lead_id, especialidade_id, fonte)
SELECT DISTINCT ON (l.id) l.id, e.id, 'migration_alias'
FROM leads l
JOIN especialidades e ON (
  LOWER(TRIM(l.especialidade)) = ANY(e.aliases)
  OR LOWER(regexp_replace(TRIM(l.especialidade), '[^a-zA-Z ]', '', 'g')) = ANY(e.aliases)
)
WHERE l.especialidade IS NOT NULL
  AND TRIM(l.especialidade) != ''
  AND l.merged_into_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM lead_especialidades le WHERE le.lead_id = l.id
  )
ON CONFLICT (lead_id, especialidade_id) DO NOTHING;

-- 4. Tratar leads com texto contendo múltiplas especialidades (vírgula)
-- Ex: "Geriatria e Clínica Médica", "Clínica Médica e Hematologia e Hemoterapia"
-- Esses são poucos (~5) e podem ser tratados manualmente depois

-- =====================================================
-- Passo 1.5: Função de lookup para uso futuro
-- =====================================================
CREATE OR REPLACE FUNCTION lookup_especialidade(p_texto TEXT)
RETURNS UUID AS $$
DECLARE
  v_norm TEXT;
  v_id UUID;
BEGIN
  IF p_texto IS NULL OR TRIM(p_texto) = '' THEN
    RETURN NULL;
  END IF;

  v_norm := LOWER(TRIM(p_texto));

  -- 1. Busca exata por nome (case-insensitive)
  SELECT id INTO v_id FROM especialidades
  WHERE LOWER(nome) = UPPER(v_norm) OR LOWER(nome) = v_norm
  LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 2. Busca por alias
  SELECT id INTO v_id FROM especialidades
  WHERE v_norm = ANY(aliases)
  LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 3. Busca sem acentos/caracteres especiais
  SELECT id INTO v_id FROM especialidades
  WHERE LOWER(regexp_replace(nome, '[^a-zA-Z ]', '', 'g')) =
        regexp_replace(v_norm, '[^a-zA-Z ]', '', 'g')
  LIMIT 1;

  RETURN v_id; -- pode ser NULL se não encontrou
END;
$$ LANGUAGE plpgsql STABLE;
