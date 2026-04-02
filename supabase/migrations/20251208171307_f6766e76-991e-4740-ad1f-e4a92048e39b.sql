
-- =============================================================================
-- EVOLUÇÃO DO MODELO DE DADOS: LEAD COMO PONTA DO FUNIL
-- Rastreabilidade completa: Licitação -> Contrato -> Serviço -> Proposta -> Lead -> Médico
-- =============================================================================

-- 1) Criar ENUM para tipos de evento no histórico do lead
DO $$ BEGIN
  CREATE TYPE tipo_evento_lead AS ENUM (
    'disparo_email',
    'disparo_zap', 
    'proposta_enviada',
    'proposta_aceita',
    'proposta_recusada',
    'convertido_em_medico',
    'atendimento',
    'contato_telefonico',
    'reuniao_agendada',
    'documentacao_solicitada',
    'documentacao_recebida',
    'outro'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2) Adicionar lead_id na tabela medicos para rastrear origem
ALTER TABLE public.medicos 
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id);

-- 3) Adicionar campos de origem/rastreabilidade na tabela leads
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS licitacao_origem_id uuid REFERENCES public.licitacoes(id),
ADD COLUMN IF NOT EXISTS contrato_origem_id uuid REFERENCES public.contratos(id),
ADD COLUMN IF NOT EXISTS servico_origem_id uuid REFERENCES public.servico(id),
ADD COLUMN IF NOT EXISTS data_conversao timestamp with time zone,
ADD COLUMN IF NOT EXISTS convertido_por uuid;

-- 4) Garantir FK de proposta para lead (se tabela proposta existir)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proposta' AND table_schema = 'public') THEN
    -- Adicionar lead_id se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposta' AND column_name = 'lead_id') THEN
      ALTER TABLE public.proposta ADD COLUMN lead_id uuid REFERENCES public.leads(id);
    END IF;
    -- Adicionar licitacao_id para rastreio completo
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposta' AND column_name = 'licitacao_id') THEN
      ALTER TABLE public.proposta ADD COLUMN licitacao_id uuid REFERENCES public.licitacoes(id);
    END IF;
  END IF;
END $$;

-- 5) Criar tabela de histórico do lead com rastreabilidade completa
CREATE TABLE IF NOT EXISTS public.lead_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo_evento tipo_evento_lead NOT NULL,
  
  -- Referências opcionais para rastreabilidade
  proposta_id uuid REFERENCES public.proposta(id),
  servico_id uuid REFERENCES public.servico(id),
  contrato_id uuid REFERENCES public.contratos(id),
  licitacao_id uuid REFERENCES public.licitacoes(id),
  disparo_log_id uuid REFERENCES public.disparos_log(id),
  disparo_programado_id uuid REFERENCES public.disparos_programados(id),
  medico_id uuid REFERENCES public.medicos(id),
  
  -- Detalhes do evento
  descricao_resumida text NOT NULL,
  metadados jsonb DEFAULT '{}'::jsonb,
  
  -- Auditoria
  usuario_id uuid,
  usuario_nome text,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- 6) Criar índices para performance em consultas de KPI
CREATE INDEX IF NOT EXISTS idx_lead_historico_lead_id ON public.lead_historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_historico_tipo_evento ON public.lead_historico(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_lead_historico_criado_em ON public.lead_historico(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_lead_historico_proposta_id ON public.lead_historico(proposta_id) WHERE proposta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_historico_contrato_id ON public.lead_historico(contrato_id) WHERE contrato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_historico_licitacao_id ON public.lead_historico(licitacao_id) WHERE licitacao_id IS NOT NULL;

-- Índices na tabela leads para consultas de origem
CREATE INDEX IF NOT EXISTS idx_leads_licitacao_origem ON public.leads(licitacao_origem_id) WHERE licitacao_origem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_contrato_origem ON public.leads(contrato_origem_id) WHERE contrato_origem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_servico_origem ON public.leads(servico_origem_id) WHERE servico_origem_id IS NOT NULL;

-- Índice na tabela medicos para buscar por lead de origem
CREATE INDEX IF NOT EXISTS idx_medicos_lead_id ON public.medicos(lead_id) WHERE lead_id IS NOT NULL;

-- 7) Habilitar RLS na nova tabela
ALTER TABLE public.lead_historico ENABLE ROW LEVEL SECURITY;

-- 8) Políticas RLS para lead_historico
CREATE POLICY "Usuários autorizados podem visualizar histórico de leads"
ON public.lead_historico
FOR SELECT
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
);

CREATE POLICY "Usuários autorizados podem inserir histórico de leads"
ON public.lead_historico
FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
);

CREATE POLICY "Usuários autorizados podem atualizar histórico de leads"
ON public.lead_historico
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- 9) Comentários para documentação
COMMENT ON TABLE public.lead_historico IS 'Histórico completo de eventos do lead no funil: disparos, propostas, conversões';
COMMENT ON COLUMN public.lead_historico.tipo_evento IS 'Tipo do evento: disparo_email, disparo_zap, proposta_enviada, proposta_aceita, proposta_recusada, convertido_em_medico, atendimento, outro';
COMMENT ON COLUMN public.lead_historico.metadados IS 'Detalhes técnicos em JSON: assunto email, corpo mensagem, valores proposta, etc';
COMMENT ON COLUMN public.medicos.lead_id IS 'Referência ao lead que originou este médico (rastreabilidade do funil)';
COMMENT ON COLUMN public.leads.licitacao_origem_id IS 'Licitação que originou a oportunidade deste lead';
COMMENT ON COLUMN public.leads.contrato_origem_id IS 'Contrato que originou a oportunidade deste lead';
COMMENT ON COLUMN public.leads.servico_origem_id IS 'Serviço específico que originou a oportunidade deste lead';
