
CREATE OR REPLACE FUNCTION public.notify_ticket_finalizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ticket finalizado
  IF NEW.status = 'concluido' AND (OLD.status IS DISTINCT FROM 'concluido') THEN
    INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
    VALUES (
      NEW.solicitante_id,
      'suporte_finalizado',
      'Ticket finalizado: ' || COALESCE(NEW.numero, ''),
      'Seu ticket foi finalizado por ' || COALESCE(NEW.resolvido_por_nome, 'Suporte TI'),
      '/suporte',
      NEW.id
    );
  END IF;

  -- Ticket aguardando confirmação do usuário
  IF NEW.status = 'aguardando_confirmacao' AND (OLD.status IS DISTINCT FROM 'aguardando_confirmacao') THEN
    INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
    VALUES (
      NEW.solicitante_id,
      'suporte_aguardando_confirmacao',
      'Ação necessária: Ticket ' || COALESCE(NEW.numero, ''),
      'Seu ticket está aguardando sua confirmação. Por favor, verifique e confirme.',
      '/suporte',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;
