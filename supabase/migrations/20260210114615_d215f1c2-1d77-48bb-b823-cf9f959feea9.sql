
-- Trigger: notificar admins quando ticket é aberto
CREATE OR REPLACE FUNCTION public.notify_ticket_aberto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  -- Notificar todos os admins sobre novo ticket
  FOR admin_record IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    -- Não notificar o próprio solicitante se for admin
    IF admin_record.user_id != NEW.solicitante_id THEN
      INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
      VALUES (
        admin_record.user_id,
        'suporte_novo_ticket',
        'Novo ticket de suporte: ' || COALESCE(NEW.numero, ''),
        COALESCE(NEW.solicitante_nome, 'Usuário') || ' abriu um ticket: ' || LEFT(COALESCE(NEW.descricao, ''), 100),
        '/suporte',
        NEW.id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_ticket_aberto
AFTER INSERT ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_ticket_aberto();

-- Trigger: notificar quando comentário é adicionado
CREATE OR REPLACE FUNCTION public.notify_ticket_comentario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket RECORD;
  admin_record RECORD;
  v_is_admin BOOLEAN;
BEGIN
  -- Buscar dados do ticket
  SELECT * INTO v_ticket FROM public.suporte_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Verificar se o autor do comentário é admin
  v_is_admin := public.is_admin(NEW.autor_id);

  IF v_is_admin THEN
    -- Admin respondeu → notificar o solicitante
    INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
    VALUES (
      v_ticket.solicitante_id,
      'suporte_resposta',
      'Resposta no ticket ' || COALESCE(v_ticket.numero, ''),
      COALESCE(NEW.autor_nome, 'Suporte') || ' respondeu: ' || LEFT(COALESCE(NEW.mensagem, ''), 100),
      '/suporte',
      v_ticket.id
    );
  ELSE
    -- Usuário respondeu → notificar admins e responsável TI
    FOR admin_record IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
      UNION
      SELECT v_ticket.responsavel_ti_id WHERE v_ticket.responsavel_ti_id IS NOT NULL
    LOOP
      IF admin_record.user_id != NEW.autor_id THEN
        INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
        VALUES (
          admin_record.user_id,
          'suporte_usuario_respondeu',
          'Resposta do usuário no ticket ' || COALESCE(v_ticket.numero, ''),
          COALESCE(NEW.autor_nome, 'Usuário') || ': ' || LEFT(COALESCE(NEW.mensagem, ''), 100),
          '/suporte',
          v_ticket.id
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_ticket_comentario
AFTER INSERT ON public.suporte_comentarios
FOR EACH ROW
EXECUTE FUNCTION public.notify_ticket_comentario();

-- Trigger: notificar quando ticket é finalizado
CREATE OR REPLACE FUNCTION public.notify_ticket_finalizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só dispara se o status mudou para 'concluido'
  IF NEW.status = 'concluido' AND (OLD.status IS DISTINCT FROM 'concluido') THEN
    -- Notificar o solicitante
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

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_ticket_finalizado
AFTER UPDATE ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_ticket_finalizado();
