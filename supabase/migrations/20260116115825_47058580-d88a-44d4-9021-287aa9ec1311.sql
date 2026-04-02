-- Criar enum para níveis de urgência
CREATE TYPE public.nivel_urgencia_suporte AS ENUM (
  'critica',
  'alta',
  'media',
  'baixa'
);

-- Criar enum para tipos de impacto
CREATE TYPE public.tipo_impacto_suporte AS ENUM (
  'sistema',
  'infraestrutura',
  'acesso_permissao',
  'integracao',
  'duvida_operacional',
  'melhoria'
);

-- Adicionar novos campos na tabela suporte_tickets
ALTER TABLE public.suporte_tickets
ADD COLUMN nivel_urgencia public.nivel_urgencia_suporte DEFAULT NULL,
ADD COLUMN tipo_impacto public.tipo_impacto_suporte DEFAULT NULL,
ADD COLUMN responsavel_ti_id uuid DEFAULT NULL,
ADD COLUMN responsavel_ti_nome text DEFAULT NULL,
ADD COLUMN sla_resposta_minutos integer DEFAULT NULL,
ADD COLUMN sla_resolucao_minutos integer DEFAULT NULL,
ADD COLUMN data_primeira_resposta timestamp with time zone DEFAULT NULL;

-- Criar tabela de configuração de SLA por urgência
CREATE TABLE public.suporte_sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nivel_urgencia public.nivel_urgencia_suporte NOT NULL UNIQUE,
  sla_resposta_minutos integer NOT NULL,
  sla_resolucao_minutos integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Inserir configuração padrão de SLA (em minutos)
INSERT INTO public.suporte_sla_config (nivel_urgencia, sla_resposta_minutos, sla_resolucao_minutos) VALUES
  ('critica', 30, 240),      -- 30 min resposta, 4h resolução
  ('alta', 60, 480),         -- 1h resposta, 8h resolução
  ('media', 240, 1440),      -- 4h resposta, 24h resolução
  ('baixa', 480, 2880);      -- 8h resposta, 48h resolução

-- Habilitar RLS
ALTER TABLE public.suporte_sla_config ENABLE ROW LEVEL SECURITY;

-- Políticas para suporte_sla_config (leitura para todos autenticados)
CREATE POLICY "Todos podem visualizar configuração de SLA"
ON public.suporte_sla_config
FOR SELECT
TO authenticated
USING (true);

-- Criar função para definir SLA automaticamente baseado na urgência
CREATE OR REPLACE FUNCTION public.set_ticket_sla()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o nível de urgência foi definido ou alterado
  IF NEW.nivel_urgencia IS NOT NULL AND (OLD IS NULL OR OLD.nivel_urgencia IS DISTINCT FROM NEW.nivel_urgencia) THEN
    SELECT sla_resposta_minutos, sla_resolucao_minutos
    INTO NEW.sla_resposta_minutos, NEW.sla_resolucao_minutos
    FROM public.suporte_sla_config
    WHERE nivel_urgencia = NEW.nivel_urgencia;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para aplicar SLA automaticamente
CREATE TRIGGER trigger_set_ticket_sla
BEFORE INSERT OR UPDATE ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_ticket_sla();