-- Corrige trigger que cria tarefa "Iniciar captação pós-licitação" ao mover
-- licitação para "arrematados". A RLS de worklist_tarefas exige
-- created_by = auth.uid(); o trigger antes setava created_by = responsavel_id
-- da licitação, o que falhava quando esse responsável era diferente do
-- usuário que executou a ação (ou era nulo).

CREATE OR REPLACE FUNCTION public.create_disparo_task_on_licitacao_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_creator uuid := COALESCE(auth.uid(), NEW.responsavel_id);
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status <> 'arrematados') THEN
    -- Só cria a tarefa se houver um usuário válido para creditar
    IF v_creator IS NOT NULL THEN
      INSERT INTO public.worklist_tarefas (
        modulo,
        titulo,
        descricao,
        status,
        data_limite,
        licitacao_id,
        created_by,
        responsavel_id,
        escopo,
        tipo,
        urgencia
      ) VALUES (
        'disparos',
        'Iniciar captação pós-licitação',
        'Licitação arrematada: ' || COALESCE(NEW.numero_edital, '') || ' - ' || COALESCE(NEW.objeto, ''),
        'aberta',
        CURRENT_DATE + INTERVAL '2 days',
        NEW.id,
        v_creator,
        NEW.responsavel_id,
        'geral',
        'tarefa',
        'media'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;