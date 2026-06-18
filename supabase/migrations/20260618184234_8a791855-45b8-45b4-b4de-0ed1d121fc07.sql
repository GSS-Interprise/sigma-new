
CREATE OR REPLACE FUNCTION public.fn_licitacao_raia_track()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.licitacao_raia_log
       SET saiu_em = now()
     WHERE licitacao_id = NEW.id
       AND saiu_em IS NULL;

    INSERT INTO public.licitacao_raia_log
      (licitacao_id, status, kanban_status_id, entrou_em, movido_por, ordem_passagem)
    VALUES (
      NEW.id,
      NEW.status,
      (SELECT id FROM public.kanban_status_config
        WHERE modulo='licitacoes' AND status_id = NEW.status::text
        LIMIT 1),
      now(),
      auth.uid(),
      COALESCE(
        (SELECT MAX(ordem_passagem) + 1
           FROM public.licitacao_raia_log
          WHERE licitacao_id = NEW.id AND status = NEW.status),
        1
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
