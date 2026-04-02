-- Fix trigger function referencing old 'modalidade' column (now 'tipo_modalidade')
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
RETURNS TRIGGER AS $$
DECLARE
  novo_contrato_id UUID;
  novo_rascunho_id UUID;
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    
    -- 1. CRIAR CONTRATO REAL
    IF NOT EXISTS (SELECT 1 FROM public.contratos WHERE licitacao_origem_id = NEW.id) THEN
      INSERT INTO public.contratos (
        codigo_contrato, data_inicio, data_fim, status_contrato,
        licitacao_origem_id, valor_estimado, objeto_contrato, assinado
      ) VALUES (
        'LC-' || COALESCE(NEW.numero_edital, 'S/N'),
        CURRENT_DATE,
        (CURRENT_DATE + INTERVAL '12 months')::DATE,
        'Pre-Contrato',
        NEW.id,
        NEW.valor_estimado,
        LEFT(NEW.objeto, 500),
        'Pendente'
      )
      RETURNING id INTO novo_contrato_id;
      
      PERFORM log_auditoria(
        'Contratos', 'contratos', 'INSERT', novo_contrato_id::text,
        'Pré-contrato criado automaticamente da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital, 'origem', 'arrematacao_automatica'),
        NULL,
        'Criação automática de pré-contrato após arrematação de licitação'
      );
    END IF;
    
    -- 2. Criar contrato_rascunho para Kanban
    IF NOT EXISTS (SELECT 1 FROM public.contrato_rascunho WHERE licitacao_id = NEW.id) THEN
      INSERT INTO public.contrato_rascunho (
        licitacao_id, status, status_kanban, overlay_json, servicos_json
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
          'tipo_modalidade', NEW.tipo_modalidade,
          'subtipo_modalidade', NEW.subtipo_modalidade,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_contrato, '[]'::jsonb)
      )
      RETURNING id INTO novo_rascunho_id;
      
      PERFORM log_auditoria(
        'Licitações', 'contrato_rascunho', 'INSERT', novo_rascunho_id::text,
        'Contrato temporário criado da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital),
        NULL,
        'Criação automática de contrato temporário após arrematação'
      );
    END IF;
    
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also remove duplicate triggers (there are 3 triggers calling the same function)
DROP TRIGGER IF EXISTS trigger_create_captacao_card_on_arrematados ON public.licitacoes;
DROP TRIGGER IF EXISTS trigger_licitacao_arrematada ON public.licitacoes;