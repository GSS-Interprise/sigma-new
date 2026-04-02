-- Fix search_path for functions that don't have it set
-- This addresses the Supabase linter warning about mutable search paths

-- Fix calculate_data_termino function
CREATE OR REPLACE FUNCTION public.calculate_data_termino()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.data_inicio IS NOT NULL AND NEW.prazo_meses IS NOT NULL THEN
    NEW.data_termino := (NEW.data_inicio + (NEW.prazo_meses || ' months')::INTERVAL - INTERVAL '1 day')::DATE;
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix create_disparo_task_on_licitacao_won function
CREATE OR REPLACE FUNCTION public.create_disparo_task_on_licitacao_won()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    INSERT INTO worklist_tarefas (
      modulo,
      titulo,
      descricao,
      status,
      data_limite,
      licitacao_id,
      created_by
    ) VALUES (
      'disparos',
      'Iniciar captação pós-licitação',
      'Licitação arrematada: ' || NEW.numero_edital || ' - ' || NEW.objeto,
      'nova_oportunidade',
      CURRENT_DATE + INTERVAL '2 days',
      NEW.id,
      NEW.responsavel_id
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix set_ticket_numero function
CREATE OR REPLACE FUNCTION public.set_ticket_numero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := public.generate_ticket_numero();
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix update_conversas_updated_at function
CREATE OR REPLACE FUNCTION public.update_conversas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;