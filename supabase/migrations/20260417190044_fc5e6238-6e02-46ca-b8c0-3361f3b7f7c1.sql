-- 1) Add new per-channel message columns
ALTER TABLE public.proposta
  ADD COLUMN IF NOT EXISTS mensagem_whatsapp text,
  ADD COLUMN IF NOT EXISTS mensagem_email     text,
  ADD COLUMN IF NOT EXISTS mensagem_instagram text,
  ADD COLUMN IF NOT EXISTS mensagem_linkedin  text,
  ADD COLUMN IF NOT EXISTS mensagem_tiktok    text;

-- 2) Backfill from legacy observacoes column based on tipo_disparo
UPDATE public.proposta
   SET mensagem_whatsapp = observacoes
 WHERE observacoes IS NOT NULL
   AND mensagem_whatsapp IS NULL
   AND LOWER(COALESCE(tipo_disparo::text, '')) IN ('zap', 'whatsapp', 'whats');

UPDATE public.proposta
   SET mensagem_email = observacoes
 WHERE observacoes IS NOT NULL
   AND mensagem_email IS NULL
   AND LOWER(COALESCE(tipo_disparo::text, '')) IN ('email', 'e-mail', 'mail');

-- Fallback: if observacoes existed and no channel was matched, send to whatsapp
UPDATE public.proposta
   SET mensagem_whatsapp = observacoes
 WHERE observacoes IS NOT NULL
   AND mensagem_whatsapp IS NULL
   AND mensagem_email    IS NULL;

-- 3) Trigger to restrict editing of mensagem_* columns to admins only
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

  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.mensagem_whatsapp  IS DISTINCT FROM OLD.mensagem_whatsapp
  OR NEW.mensagem_email     IS DISTINCT FROM OLD.mensagem_email
  OR NEW.mensagem_instagram IS DISTINCT FROM OLD.mensagem_instagram
  OR NEW.mensagem_linkedin  IS DISTINCT FROM OLD.mensagem_linkedin
  OR NEW.mensagem_tiktok    IS DISTINCT FROM OLD.mensagem_tiktok THEN
    RAISE EXCEPTION 'Apenas administradores podem editar as mensagens da proposta';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposta_protect_mensagens ON public.proposta;
CREATE TRIGGER trg_proposta_protect_mensagens
  BEFORE UPDATE ON public.proposta
  FOR EACH ROW
  EXECUTE FUNCTION public.proposta_protect_mensagens();

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

  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.mensagem_whatsapp  IS NOT NULL
  OR NEW.mensagem_email     IS NOT NULL
  OR NEW.mensagem_instagram IS NOT NULL
  OR NEW.mensagem_linkedin  IS NOT NULL
  OR NEW.mensagem_tiktok    IS NOT NULL THEN
    RAISE EXCEPTION 'Apenas administradores podem definir as mensagens da proposta';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposta_protect_mensagens_insert ON public.proposta;
CREATE TRIGGER trg_proposta_protect_mensagens_insert
  BEFORE INSERT ON public.proposta
  FOR EACH ROW
  EXECUTE FUNCTION public.proposta_protect_mensagens_insert();