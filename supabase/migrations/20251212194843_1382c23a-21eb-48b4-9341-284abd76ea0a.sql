-- ETAPA 1: Adicionar campo status_kanban e servicos_json ao contrato_rascunho existente
-- (mudanças aditivas, não altera estrutura de contratos)

-- Adicionar coluna status_kanban com enum inline
ALTER TABLE public.contrato_rascunho 
ADD COLUMN IF NOT EXISTS status_kanban text NOT NULL DEFAULT 'prospectar';

-- Adicionar coluna servicos_json para array de serviços
ALTER TABLE public.contrato_rascunho 
ADD COLUMN IF NOT EXISTS servicos_json jsonb DEFAULT '[]'::jsonb;

-- Adicionar checkboxes de validação para licitações
ALTER TABLE public.licitacoes
ADD COLUMN IF NOT EXISTS check_habilitacao boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS check_documentacao boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS check_proposta boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS servicos_licitacao jsonb DEFAULT '[]'::jsonb;

-- ETAPA 2: Atualizar trigger para criar contrato_rascunho em vez de captacao_contratos_board
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só executar se o status mudou para 'arrematados'
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    
    -- Verificar se já existe contrato_rascunho para esta licitação (idempotência)
    IF NOT EXISTS (SELECT 1 FROM public.contrato_rascunho WHERE licitacao_id = NEW.id) THEN
      
      -- Criar contrato rascunho
      INSERT INTO public.contrato_rascunho (
        licitacao_id,
        status,
        status_kanban,
        overlay_json,
        servicos_json
      ) VALUES (
        NEW.id,
        'rascunho',
        'prospectar',
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto,
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'modalidade', NEW.modalidade,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_licitacao, '[]'::jsonb)
      );
      
      -- Log de auditoria
      PERFORM log_auditoria(
        'Licitações',
        'contrato_rascunho',
        'INSERT',
        NEW.id::text,
        'Licitação ' || COALESCE(NEW.numero_edital, 'S/N') || ' gerou contrato temporário',
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital),
        NULL,
        'Criação automática de contrato temporário após arrematação'
      );
    END IF;
    
    -- Manter compatibilidade: também cria em captacao_contratos_board se não existir
    IF NOT EXISTS (SELECT 1 FROM public.captacao_contratos_board WHERE origem_licitacao_id = NEW.id) THEN
      INSERT INTO public.captacao_contratos_board (
        origem_tipo,
        origem_licitacao_id,
        status,
        titulo_card,
        overlay_json
      ) VALUES (
        'licitacao_arrematada',
        NEW.id,
        'prospectar',
        COALESCE(NEW.numero_edital, 'Licitação') || ' - ' || COALESCE(LEFT(NEW.objeto, 50), 'Sem objeto'),
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto,
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'data_arrematacao', now()
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS trigger_licitacao_arrematada ON public.licitacoes;
CREATE TRIGGER trigger_licitacao_arrematada
  AFTER UPDATE ON public.licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_captacao_card_on_licitacao_arrematada();

-- Habilitar realtime para contrato_rascunho
ALTER PUBLICATION supabase_realtime ADD TABLE public.contrato_rascunho;