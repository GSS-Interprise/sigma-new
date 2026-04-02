CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  novo_contrato_id UUID;
  novo_rascunho_id UUID;
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    
    IF NOT EXISTS (SELECT 1 FROM public.contratos WHERE licitacao_origem_id = NEW.id) THEN
      INSERT INTO public.contratos (
        codigo_contrato,
        data_inicio,
        data_fim,
        status_contrato,
        licitacao_origem_id,
        valor_estimado,
        objeto_contrato,
        assinado
      ) VALUES (
        'LC-' || COALESCE(NEW.numero_edital, 'S/N'),
        CURRENT_DATE,
        (CURRENT_DATE + INTERVAL '12 months')::DATE,
        'Pre-Contrato',
        NEW.id,
        NEW.valor_estimado,
        LEFT(COALESCE(NEW.objeto_contrato, ''), 2000),
        'Pendente'
      )
      RETURNING id INTO novo_contrato_id;
      
      PERFORM log_auditoria(
        'Contratos',
        'contratos',
        'INSERT',
        novo_contrato_id::text,
        'Pré-contrato criado automaticamente da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital, 'origem', 'arrematacao_automatica'),
        NULL,
        'Criação automática de pré-contrato após arrematação de licitação'
      );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.contrato_rascunho WHERE licitacao_id = NEW.id) THEN
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
          'objeto', COALESCE(NEW.objeto_contrato, ''),
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'modalidade', NEW.modalidade,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_contrato, '[]'::jsonb)
      )
      RETURNING id INTO novo_rascunho_id;
      
      PERFORM log_auditoria(
        'Licitações',
        'contrato_rascunho',
        'INSERT',
        novo_rascunho_id::text,
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
$function$;

DROP TRIGGER IF EXISTS on_licitacao_arrematada ON public.licitacoes;
CREATE TRIGGER on_licitacao_arrematada
  AFTER UPDATE ON public.licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_captacao_card_on_licitacao_arrematada();