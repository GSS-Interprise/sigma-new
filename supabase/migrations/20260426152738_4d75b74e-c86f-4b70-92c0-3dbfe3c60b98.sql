-- ============================================================
-- 1) BACKFILL: leads já contactados ainda sem raia ativa
-- ============================================================
DO $$
DECLARE
  cp_rec RECORD;
  total int := 0;
  inseridos int;
BEGIN
  FOR cp_rec IN
    SELECT id FROM public.campanha_propostas
  LOOP
    SELECT public.backfill_cascata_contactados(cp_rec.id) INTO inseridos;
    total := total + COALESCE(inseridos, 0);
  END LOOP;
  RAISE NOTICE 'Backfill cascata: % linhas inseridas', total;
END$$;

-- ============================================================
-- 2) Helper: abre canal WhatsApp se ainda não existir nenhuma
--    passagem (aberta ou encerrada) para o par (cp, lead)
-- ============================================================
CREATE OR REPLACE FUNCTION public.abrir_canal_whatsapp_se_necessario(
  _campanha_proposta_id uuid,
  _lead_id uuid,
  _entrou_em timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _campanha_proposta_id IS NULL OR _lead_id IS NULL THEN
    RETURN;
  END IF;

  -- Só insere se NÃO existe nenhuma passagem nesta campanha pra esse lead
  -- (assim respeita históricos: lead que já foi transferido/encerrado não volta sozinho)
  IF EXISTS (
    SELECT 1 FROM public.campanha_proposta_lead_canais
    WHERE campanha_proposta_id = _campanha_proposta_id
      AND lead_id = _lead_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.campanha_proposta_lead_canais (
    campanha_proposta_id, lead_id, canal, entrou_em, status_final
  ) VALUES (
    _campanha_proposta_id, _lead_id, 'whatsapp', COALESCE(_entrou_em, now()), 'aberto'
  );
END;
$$;

-- ============================================================
-- 3) Trigger: disparos_contatos -> abre canal WhatsApp
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_disparos_contatos_abrir_canal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL
     AND NEW.campanha_proposta_id IS NOT NULL
     AND NEW.status IN ('3-TRATANDO','4-ENVIADO','2-ENVIADO') THEN
    PERFORM public.abrir_canal_whatsapp_se_necessario(
      NEW.campanha_proposta_id,
      NEW.lead_id,
      COALESCE(NEW.data_envio, NEW.updated_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disparos_contatos_abrir_canal ON public.disparos_contatos;
CREATE TRIGGER trg_disparos_contatos_abrir_canal
AFTER INSERT OR UPDATE OF status ON public.disparos_contatos
FOR EACH ROW
EXECUTE FUNCTION public.tg_disparos_contatos_abrir_canal();

-- ============================================================
-- 4) Trigger: disparo_manual_envios -> abre canal WhatsApp
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_disparo_manual_abrir_canal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND NEW.campanha_proposta_id IS NOT NULL THEN
    PERFORM public.abrir_canal_whatsapp_se_necessario(
      NEW.campanha_proposta_id,
      NEW.lead_id,
      COALESCE(NEW.created_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disparo_manual_abrir_canal ON public.disparo_manual_envios;
CREATE TRIGGER trg_disparo_manual_abrir_canal
AFTER INSERT ON public.disparo_manual_envios
FOR EACH ROW
EXECUTE FUNCTION public.tg_disparo_manual_abrir_canal();