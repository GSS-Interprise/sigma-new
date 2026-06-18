
CREATE OR REPLACE FUNCTION public.fn_licitacao_notify_sino()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo text;
  v_msg text;
  v_link text;
  v_tipo text;
  v_old_label text;
  v_new_label text;
BEGIN
  v_link := '/licitacoes?open=' || NEW.id::text;

  IF TG_OP = 'INSERT' THEN
    v_tipo := 'licitacao_nova';
    v_titulo := COALESCE(NEW.numero_edital, NEW.orgao, 'Nova licitação');
    v_msg := COALESCE(LEFT(NEW.objeto, 140), NEW.subtipo_modalidade, 'Licitação criada no sistema');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    v_tipo := 'licitacao_status';
    v_titulo := COALESCE(NEW.numero_edital, NEW.orgao, 'Licitação');

    SELECT label INTO v_old_label FROM public.kanban_status_config
      WHERE modulo = 'licitacoes' AND status_id = OLD.status LIMIT 1;
    SELECT label INTO v_new_label FROM public.kanban_status_config
      WHERE modulo = 'licitacoes' AND status_id = NEW.status LIMIT 1;

    v_msg := 'Movida de "' || COALESCE(v_old_label, OLD.status) ||
             '" para "' || COALESCE(v_new_label, NEW.status) || '"';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
  SELECT DISTINCT ur.user_id, v_tipo, v_titulo, v_msg, v_link, NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('admin','diretoria','gestor_contratos','licitador','lider_licitacao')
    AND ur.user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_licitacao_notify_sino_ins ON public.licitacoes;
DROP TRIGGER IF EXISTS trg_licitacao_notify_sino_upd ON public.licitacoes;

CREATE TRIGGER trg_licitacao_notify_sino_ins
AFTER INSERT ON public.licitacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_licitacao_notify_sino();

CREATE TRIGGER trg_licitacao_notify_sino_upd
AFTER UPDATE OF status ON public.licitacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_licitacao_notify_sino();
