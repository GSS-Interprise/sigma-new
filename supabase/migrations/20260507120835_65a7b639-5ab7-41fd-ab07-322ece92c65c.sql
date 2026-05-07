CREATE OR REPLACE FUNCTION public.cleanup_pre_contrato_on_licitacao_revogada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'arrematados'
     AND NEW.status IN ('suspenso_revogado', 'descarte_edital') THEN
    DELETE FROM public.contratos
    WHERE licitacao_origem_id = NEW.id
      AND status_contrato = 'Pre-Contrato'
      AND cliente_id IS NULL;

    UPDATE public.contrato_rascunho
    SET status = 'cancelado', updated_at = now()
    WHERE licitacao_id = NEW.id
      AND status = 'rascunho';
  END IF;
  RETURN NEW;
END;
$function$;