-- A hot lead must have a clear human owner and the AI must stop immediately.

CREATE OR REPLACE FUNCTION public.auto_assign_hot_campaign_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_responsavel uuid;
BEGIN
  IF NEW.status::text <> 'quente' OR NEW.assumido_por IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT responsavel_id
    INTO v_responsavel
    FROM public.campanhas
   WHERE id = NEW.campanha_id;

  IF v_responsavel IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.assumido_por := v_responsavel;
  NEW.assumido_em := coalesce(NEW.assumido_em, now());
  NEW.humano_assumiu := true;
  NEW.ai_response_lease_token := NULL;
  NEW.ai_response_lease_until := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_hot_campaign_lead
  ON public.campanha_leads;
CREATE TRIGGER trg_auto_assign_hot_campaign_lead
BEFORE INSERT OR UPDATE OF status ON public.campanha_leads
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_hot_campaign_lead();

CREATE OR REPLACE FUNCTION public.assign_existing_hot_leads_on_campaign_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsavel_id IS NULL OR NEW.responsavel_id IS NOT DISTINCT FROM OLD.responsavel_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.campanha_leads
     SET assumido_por = NEW.responsavel_id,
         assumido_em = coalesce(assumido_em, now()),
         humano_assumiu = true,
         ai_response_lease_token = NULL,
         ai_response_lease_until = NULL,
         updated_at = now()
   WHERE campanha_id = NEW.id
     AND status::text = 'quente'
     AND assumido_por IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_existing_hot_leads_on_campaign_owner
  ON public.campanhas;
CREATE TRIGGER trg_assign_existing_hot_leads_on_campaign_owner
AFTER UPDATE OF responsavel_id ON public.campanhas
FOR EACH ROW
EXECUTE FUNCTION public.assign_existing_hot_leads_on_campaign_owner();

COMMENT ON FUNCTION public.auto_assign_hot_campaign_lead IS
  'Assigns hot leads to the campaign owner and invalidates pending AI turns.';
