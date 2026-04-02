-- Corrigir trigger que usa campo 'uf' inexistente (o campo correto é 'municipio_uf')
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só executar se o status mudou para 'arrematados'
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    -- Verificar se já existe card para esta licitação (idempotência)
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