-- Remove a constraint fixa de status
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Criar função para validar status dinamicamente
CREATE OR REPLACE FUNCTION public.validate_lead_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Permite qualquer status que exista na tabela kanban_status_config para módulo 'disparos' ou 'leads'
  IF NOT EXISTS (
    SELECT 1 FROM public.kanban_status_config 
    WHERE (modulo = 'disparos' OR modulo = 'leads') 
    AND (status_id = NEW.status OR label = NEW.status)
    AND ativo = true
  ) THEN
    -- Também permite status padrões
    IF NEW.status NOT IN ('Novo', 'Qualificado', 'Convertido', 'Descartado', 'Acompanhamento') THEN
      RAISE EXCEPTION 'Status "%" não é válido. Adicione-o primeiro na configuração do Kanban.', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para validação
DROP TRIGGER IF EXISTS validate_lead_status_trigger ON public.leads;
CREATE TRIGGER validate_lead_status_trigger
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_lead_status();

-- Habilitar realtime para leads
ALTER TABLE public.leads REPLICA IDENTITY FULL;

-- Adicionar leads ao supabase_realtime se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;

-- Habilitar realtime para kanban_status_config
ALTER TABLE public.kanban_status_config REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'kanban_status_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_status_config;
  END IF;
END $$;