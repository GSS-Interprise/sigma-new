
-- 1) Trigger: ao encerrar uma proposta, fechar todas as raias abertas dela
CREATE OR REPLACE FUNCTION public.trg_proposta_encerrada_fecha_raias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'encerrada' AND (OLD.status IS DISTINCT FROM 'encerrada') THEN
    UPDATE public.campanha_proposta_lead_canais
    SET saiu_em = COALESCE(NEW.encerrada_em, now()),
        motivo_saida = 'Proposta encerrada',
        status_final = 'proposta_encerrada'
    WHERE campanha_proposta_id = NEW.id
      AND status_final = 'aberto';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposta_encerrada_fecha_raias ON public.campanha_propostas;
CREATE TRIGGER trg_proposta_encerrada_fecha_raias
AFTER UPDATE ON public.campanha_propostas
FOR EACH ROW
EXECUTE FUNCTION public.trg_proposta_encerrada_fecha_raias();

-- 2) Trigger: ao finalizar/arquivar uma campanha, encerrar suas propostas ativas (cascata)
CREATE OR REPLACE FUNCTION public.trg_campanha_finalizada_encerra_propostas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('finalizada','arquivada') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.campanha_propostas
    SET status = 'encerrada',
        encerrada_em = COALESCE(encerrada_em, now()),
        updated_at = now()
    WHERE campanha_id = NEW.id
      AND status NOT IN ('encerrada','cancelada');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campanha_finalizada_encerra_propostas ON public.campanhas;
CREATE TRIGGER trg_campanha_finalizada_encerra_propostas
AFTER UPDATE ON public.campanhas
FOR EACH ROW
EXECUTE FUNCTION public.trg_campanha_finalizada_encerra_propostas();

-- 3) Backfill: raias abertas em propostas já encerradas → fechar
UPDATE public.campanha_proposta_lead_canais c
SET saiu_em = COALESCE(cp.encerrada_em, now()),
    motivo_saida = 'Proposta encerrada (backfill)',
    status_final = 'proposta_encerrada'
FROM public.campanha_propostas cp
WHERE c.campanha_proposta_id = cp.id
  AND c.status_final = 'aberto'
  AND cp.status = 'encerrada';

-- 4) Backfill correção das 4 raias órfãs (entrou_em do backfill antigo = primeira msg histórica)
-- Resetar entrou_em = now() para todas as raias abertas cujo entrou_em é mais antigo que created_at da proposta
UPDATE public.campanha_proposta_lead_canais c
SET entrou_em = now(),
    updated_at = now()
FROM public.campanha_propostas cp
WHERE c.campanha_proposta_id = cp.id
  AND c.status_final = 'aberto'
  AND c.entrou_em < cp.created_at;
