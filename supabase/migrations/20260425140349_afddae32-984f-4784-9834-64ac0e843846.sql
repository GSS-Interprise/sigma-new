
CREATE OR REPLACE FUNCTION public.proposta_protect_mensagens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin(auth.uid())
     OR public.has_role(auth.uid(), 'lideres')
     OR public.has_role(auth.uid(), 'gestor_captacao')
     OR public.has_role(auth.uid(), 'gestor_contratos') THEN
    RETURN NEW;
  END IF;

  IF NEW.mensagem_whatsapp  IS DISTINCT FROM OLD.mensagem_whatsapp
  OR NEW.mensagem_email     IS DISTINCT FROM OLD.mensagem_email
  OR NEW.mensagem_instagram IS DISTINCT FROM OLD.mensagem_instagram
  OR NEW.mensagem_linkedin  IS DISTINCT FROM OLD.mensagem_linkedin
  OR NEW.mensagem_tiktok    IS DISTINCT FROM OLD.mensagem_tiktok THEN
    RAISE EXCEPTION 'Sem permissão para editar as mensagens da proposta';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.proposta_protect_mensagens_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin(auth.uid())
     OR public.has_role(auth.uid(), 'lideres')
     OR public.has_role(auth.uid(), 'gestor_captacao')
     OR public.has_role(auth.uid(), 'gestor_contratos') THEN
    RETURN NEW;
  END IF;

  IF NEW.mensagem_whatsapp  IS NOT NULL
  OR NEW.mensagem_email     IS NOT NULL
  OR NEW.mensagem_instagram IS NOT NULL
  OR NEW.mensagem_linkedin  IS NOT NULL
  OR NEW.mensagem_tiktok    IS NOT NULL THEN
    RAISE EXCEPTION 'Sem permissão para definir as mensagens da proposta';
  END IF;

  RETURN NEW;
END;
$$;
