-- =====================================================
-- BLOCO 2 — CAMADA 1: FUNDAÇÃO
-- Data: 18/04/2026
-- Autor: Raul (Pulse ID)
-- Regra: só CREATE e ALTER ADD, nunca DROP ou ALTER existente
-- =====================================================

-- =====================================================
-- 1. Estender tabela campanhas com campos de prospecção
-- =====================================================

-- Especialidade alvo da campanha
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS especialidade_id UUID REFERENCES especialidades(id);

-- Região alvo
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS regiao_estado TEXT;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS regiao_cidades TEXT[];

-- Chip WhatsApp + fallback
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS chip_id UUID REFERENCES chips(id);
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS chip_fallback_id UUID REFERENCES chips(id);

-- Limite diário de disparos dessa campanha
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS limite_diario_campanha INTEGER DEFAULT 120;

-- Briefing para a IA (contexto da campanha para o agente conversar)
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS briefing_ia JSONB;

-- Mensagem inicial de disparo (template)
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS mensagem_inicial TEXT;

-- Tipo de campanha (prospecção vs marketing vs relacionamento)
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS tipo_campanha TEXT DEFAULT 'prospeccao';

-- Contadores de pipeline
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS total_frio INTEGER DEFAULT 0;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS total_contatado INTEGER DEFAULT 0;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS total_em_conversa INTEGER DEFAULT 0;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS total_aquecido INTEGER DEFAULT 0;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS total_quente INTEGER DEFAULT 0;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS total_convertido INTEGER DEFAULT 0;

-- =====================================================
-- 2. Criar enum e tabela campanha_leads (pipeline por lead)
-- =====================================================

DO $$ BEGIN
  CREATE TYPE status_lead_campanha AS ENUM (
    'frio',
    'contatado',
    'em_conversa',
    'aquecido',
    'quente',
    'convertido',
    'sem_resposta',
    'descartado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS campanha_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status status_lead_campanha NOT NULL DEFAULT 'frio',
  data_primeiro_contato TIMESTAMPTZ,
  data_ultimo_contato TIMESTAMPTZ,
  data_status TIMESTAMPTZ DEFAULT NOW(),
  tentativas INTEGER DEFAULT 0,
  canal_atual TEXT,
  conversa_id UUID,
  metadados JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campanha_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_campanha_leads_campanha ON campanha_leads(campanha_id);
CREATE INDEX IF NOT EXISTS idx_campanha_leads_lead ON campanha_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_campanha_leads_status ON campanha_leads(campanha_id, status);
CREATE INDEX IF NOT EXISTS idx_campanha_leads_quente ON campanha_leads(status) WHERE status = 'quente';

-- RLS
ALTER TABLE campanha_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view campanha_leads"
  ON campanha_leads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert campanha_leads"
  ON campanha_leads FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update campanha_leads"
  ON campanha_leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete campanha_leads"
  ON campanha_leads FOR DELETE TO authenticated USING (true);

-- =====================================================
-- 3. Adicionar flags em chips
-- =====================================================

ALTER TABLE chips ADD COLUMN IF NOT EXISTS pode_disparar BOOLEAN DEFAULT true;
ALTER TABLE chips ADD COLUMN IF NOT EXISTS origem_padrao_inbound TEXT;

-- =====================================================
-- 4. Novos valores no enum tipo_evento_lead (touchpoints)
-- =====================================================

DO $$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'export_trafego_pago'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'inbound_whatsapp'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'outbound_whatsapp'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'inbound_email'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'inbound_instagram'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'campanha_status_change'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'campanha_disparo'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_aquecido'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_quente_handoff'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- 5. Trigger: atualizar contadores da campanha quando
--    status do lead muda em campanha_leads
-- =====================================================

CREATE OR REPLACE FUNCTION atualizar_contadores_campanha()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campanhas SET
    total_frio = (SELECT COUNT(*) FROM campanha_leads WHERE campanha_id = NEW.campanha_id AND status = 'frio'),
    total_contatado = (SELECT COUNT(*) FROM campanha_leads WHERE campanha_id = NEW.campanha_id AND status = 'contatado'),
    total_em_conversa = (SELECT COUNT(*) FROM campanha_leads WHERE campanha_id = NEW.campanha_id AND status = 'em_conversa'),
    total_aquecido = (SELECT COUNT(*) FROM campanha_leads WHERE campanha_id = NEW.campanha_id AND status = 'aquecido'),
    total_quente = (SELECT COUNT(*) FROM campanha_leads WHERE campanha_id = NEW.campanha_id AND status = 'quente'),
    total_convertido = (SELECT COUNT(*) FROM campanha_leads WHERE campanha_id = NEW.campanha_id AND status = 'convertido'),
    updated_at = NOW()
  WHERE id = NEW.campanha_id;

  NEW.data_status = NOW();
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campanha_leads_contadores ON campanha_leads;
CREATE TRIGGER trg_campanha_leads_contadores
  BEFORE INSERT OR UPDATE OF status ON campanha_leads
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_contadores_campanha();

-- =====================================================
-- 6. Trigger: criar tarefa de handoff quando lead fica quente
-- =====================================================

CREATE OR REPLACE FUNCTION notificar_lead_quente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'quente' AND (OLD IS NULL OR OLD.status != 'quente') THEN
    INSERT INTO tarefas_captacao (
      lead_id,
      campanha_proposta_id,
      canal,
      tipo,
      status,
      prioridade,
      titulo,
      descricao
    )
    SELECT
      NEW.lead_id,
      cp.id,
      NEW.canal_atual,
      'solicitacao',
      'aberta',
      'urgente',
      'Lead quente - assumir conversa',
      'Lead qualificado pela IA como quente. Assumir conversa e fechar negociação.'
    FROM campanha_propostas cp
    WHERE cp.campanha_id = NEW.campanha_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_quente_handoff ON campanha_leads;
CREATE TRIGGER trg_lead_quente_handoff
  AFTER INSERT OR UPDATE OF status ON campanha_leads
  FOR EACH ROW
  EXECUTE FUNCTION notificar_lead_quente();

-- =====================================================
-- 7. Função RPC: selecionar leads para campanha (pool dinâmico)
-- =====================================================

CREATE OR REPLACE FUNCTION selecionar_leads_campanha(
  p_campanha_id UUID,
  p_limite INTEGER DEFAULT 50
)
RETURNS TABLE (
  lead_id UUID,
  nome TEXT,
  phone_e164 TEXT,
  especialidade_nome TEXT,
  estado TEXT,
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
    l.estado,
    l.cidade
  FROM leads l
  JOIN lead_especialidades le ON le.lead_id = l.id
  JOIN especialidades e ON e.id = le.especialidade_id
  WHERE l.merged_into_id IS NULL
    AND (v_especialidade_id IS NULL OR le.especialidade_id = v_especialidade_id)
    AND (v_estado IS NULL OR l.estado = v_estado)
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

-- =====================================================
-- 8. Função RPC: atualizar status do lead na campanha
-- =====================================================

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

  INSERT INTO lead_historico (lead_id, tipo_evento, metadados)
  VALUES (
    p_lead_id,
    'campanha_status_change',
    jsonb_build_object(
      'campanha_id', p_campanha_id,
      'novo_status', p_novo_status,
      'canal', p_canal
    ) || p_metadados
  );
END;
$$;

-- =====================================================
-- 9. Função RPC: exportar leads para tráfego pago
-- =====================================================

CREATE OR REPLACE FUNCTION exportar_leads_trafego_pago(
  p_campanha_id UUID
)
RETURNS TABLE (
  lead_id UUID,
  nome TEXT,
  email TEXT,
  phone TEXT,
  especialidade TEXT,
  estado TEXT,
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
    l.estado,
    l.cidade
  FROM campanha_leads cl
  JOIN leads l ON l.id = cl.lead_id
  LEFT JOIN lead_especialidades le ON le.lead_id = l.id
  LEFT JOIN especialidades e ON e.id = le.especialidade_id
  WHERE cl.campanha_id = p_campanha_id
  GROUP BY cl.lead_id, l.nome, l.email, l.phone_e164, e.nome, l.estado, l.cidade;

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
