-- Contexto operacional e recorrência sobre a central de tickets existente.
ALTER TABLE public.suporte_tickets
  ADD COLUMN IF NOT EXISTS categoria_operacional text
    CHECK (categoria_operacional IS NULL OR categoria_operacional IN (
      'sincronizacao_mensagens', 'chip_conexao', 'qr_reconexao',
      'campanha_disparo', 'ia_handoff', 'cadastro_lead',
      'acesso_permissao', 'outro'
    )),
  ADD COLUMN IF NOT EXISTS objeto_tipo text
    CHECK (objeto_tipo IS NULL OR objeto_tipo IN (
      'chip', 'campanha', 'lead', 'conversa', 'usuario', 'sistema'
    )),
  ADD COLUMN IF NOT EXISTS objeto_referencia text,
  ADD COLUMN IF NOT EXISTS recorrencia_chave text,
  ADD COLUMN IF NOT EXISTS reaberturas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_reabertura_em timestamptz;

CREATE OR REPLACE FUNCTION public.set_support_incident_recurrence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.recorrencia_chave := lower(concat_ws(
    ':',
    coalesce(NEW.categoria_operacional, 'outro'),
    coalesce(NEW.objeto_tipo, 'sistema'),
    coalesce(nullif(btrim(NEW.objeto_referencia), ''), 'geral')
  ));

  IF TG_OP = 'UPDATE'
     AND NEW.status::text = 'em_analise'
     AND OLD.status::text IN ('aguardando_confirmacao', 'resolvido', 'concluido') THEN
    NEW.reaberturas := coalesce(OLD.reaberturas, 0) + 1;
    NEW.ultima_reabertura_em := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_incident_recurrence ON public.suporte_tickets;
CREATE TRIGGER trg_support_incident_recurrence
BEFORE INSERT OR UPDATE OF status, categoria_operacional, objeto_tipo, objeto_referencia
ON public.suporte_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_support_incident_recurrence();

UPDATE public.suporte_tickets
SET recorrencia_chave = lower(concat_ws(
  ':',
  coalesce(categoria_operacional, 'outro'),
  coalesce(objeto_tipo, 'sistema'),
  coalesce(nullif(btrim(objeto_referencia), ''), 'geral')
))
WHERE recorrencia_chave IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_incident_recurrence
  ON public.suporte_tickets(recorrencia_chave, data_abertura DESC);

CREATE OR REPLACE VIEW public.vw_support_incident_recurrence
WITH (security_invoker = true)
AS
SELECT
  recorrencia_chave,
  categoria_operacional,
  objeto_tipo,
  objeto_referencia,
  count(*)::integer AS tickets_30d,
  sum(reaberturas)::integer AS reaberturas_30d,
  max(data_abertura) AS ultimo_ticket_em,
  array_agg(numero ORDER BY data_abertura DESC) AS tickets
FROM public.suporte_tickets
WHERE data_abertura >= now() - interval '30 days'
GROUP BY recorrencia_chave, categoria_operacional, objeto_tipo, objeto_referencia;

GRANT SELECT ON public.vw_support_incident_recurrence TO authenticated, service_role;

COMMENT ON COLUMN public.suporte_tickets.recorrencia_chave IS
  'Identidade operacional estável para agrupar incidentes repetidos.';
