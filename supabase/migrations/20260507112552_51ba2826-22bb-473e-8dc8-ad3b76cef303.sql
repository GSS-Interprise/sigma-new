
-- 1. Substituir trigger de arrematação para tratar retorno
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  novo_contrato_id UUID;
  novo_rascunho_id UUID;
  v_pre_contrato_existente UUID;
  v_rascunho_existente UUID;
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN

    -- Verificar pré-contrato órfão (sem cliente) já existente
    SELECT id INTO v_pre_contrato_existente
    FROM public.contratos
    WHERE licitacao_origem_id = NEW.id
      AND status_contrato = 'Pre-Contrato'
      AND cliente_id IS NULL
    LIMIT 1;

    IF v_pre_contrato_existente IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.contratos WHERE licitacao_origem_id = NEW.id AND cliente_id IS NOT NULL) THEN
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
        LEFT(COALESCE(NEW.objeto_contrato, ''), 2000),
        'Pendente'
      )
      RETURNING id INTO novo_contrato_id;
    END IF;

    -- Rascunho: reabrir o mais recente cancelado/consolidado órfão se houver, senão criar
    SELECT id INTO v_rascunho_existente
    FROM public.contrato_rascunho
    WHERE licitacao_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_rascunho_existente IS NULL THEN
      INSERT INTO public.contrato_rascunho (
        licitacao_id, status, status_kanban, overlay_json, servicos_json
      ) VALUES (
        NEW.id, 'rascunho', 'prospectar',
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', COALESCE(NEW.objeto_contrato, ''),
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_contrato, '[]'::jsonb)
      ) RETURNING id INTO novo_rascunho_id;
    ELSE
      -- Reabrir se cancelado ou consolidado-com-órfão
      UPDATE public.contrato_rascunho
      SET status = 'rascunho',
          contrato_id = NULL,
          consolidado_em = NULL,
          consolidado_por = NULL,
          updated_at = now()
      WHERE id = v_rascunho_existente
        AND status IN ('cancelado', 'consolidado')
        AND (contrato_id IS NULL OR contrato_id IN (SELECT id FROM public.contratos WHERE cliente_id IS NULL));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Novo trigger: limpeza ao sair de arrematados para estados terminais
CREATE OR REPLACE FUNCTION public.cleanup_pre_contrato_on_licitacao_revogada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'arrematados' 
     AND NEW.status IN ('suspenso_revogado', 'descartado') THEN
    -- Deletar pré-contratos órfãos (sem cliente)
    DELETE FROM public.contratos
    WHERE licitacao_origem_id = NEW.id
      AND status_contrato = 'Pre-Contrato'
      AND cliente_id IS NULL;

    -- Cancelar rascunhos ativos
    UPDATE public.contrato_rascunho
    SET status = 'cancelado', updated_at = now()
    WHERE licitacao_id = NEW.id
      AND status = 'rascunho';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cleanup_pre_contrato_on_licitacao_revogada ON public.licitacoes;
CREATE TRIGGER cleanup_pre_contrato_on_licitacao_revogada
AFTER UPDATE ON public.licitacoes
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_pre_contrato_on_licitacao_revogada();
