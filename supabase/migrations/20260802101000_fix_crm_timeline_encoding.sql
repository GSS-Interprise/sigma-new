-- ASCII-only: Unicode escapes prevent encoding damage through remote SQL transport.
CREATE OR REPLACE FUNCTION public.tg_campanha_lead_kanban_automation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_anterior text;
  v_nova text;
  v_motivo text;
BEGIN
  IF NEW.data_primeiro_contato IS NOT NULL AND NEW.status::text = 'frio' THEN
    NEW.status := 'contatado';
    NEW.data_status := coalesce(NEW.data_status, NEW.data_primeiro_contato, now());
  END IF;

  v_anterior := public.crm_etapa_canonica(OLD.status::text, OLD.etapa_acompanhamento, OLD.resultado_final, OLD.assumido_por);
  v_nova := public.crm_etapa_canonica(NEW.status::text, NEW.etapa_acompanhamento, NEW.resultado_final, NEW.assumido_por);

  IF v_nova IS DISTINCT FROM v_anterior THEN
    v_motivo := CASE
      WHEN v_nova = 'contatado' THEN 'Primeiro contato enviado'
      WHEN v_nova = 'respondeu' THEN U&'Resposta recebida do m\00E9dico'
      WHEN v_nova = 'em_atendimento' THEN 'Conversa assumida pela equipe'
      WHEN v_nova = 'qualificado' THEN U&'M\00E9dico qualificado'
      WHEN v_nova = 'encaminhado' THEN U&'M\00E9dico encaminhado para a oportunidade'
      WHEN v_nova = 'convertido' THEN U&'M\00E9dico encaminhado ao setor de Contratos'
      WHEN v_nova = 'perdido' THEN 'Oportunidade encerrada como perdida'
      ELSE 'Etapa atualizada automaticamente'
    END;
    INSERT INTO public.campanha_lead_stage_history(
      campanha_lead_id, etapa_anterior, etapa_nova, motivo, alterado_por
    ) VALUES (NEW.id, v_anterior, v_nova, v_motivo, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.campanha_lead_stage_history
SET motivo = CASE etapa_nova
  WHEN 'contatado' THEN 'Primeiro contato enviado'
  WHEN 'respondeu' THEN U&'Resposta recebida do m\00E9dico'
  WHEN 'em_atendimento' THEN 'Conversa assumida pela equipe'
  WHEN 'qualificado' THEN U&'M\00E9dico qualificado'
  WHEN 'encaminhado' THEN U&'M\00E9dico encaminhado para a oportunidade'
  WHEN 'convertido' THEN U&'M\00E9dico encaminhado ao setor de Contratos'
  WHEN 'perdido' THEN 'Oportunidade encerrada como perdida'
  ELSE 'Etapa atualizada automaticamente'
END;

-- Repair the legacy media placeholder without embedding damaged bytes in this file.
DO $$
DECLARE
  v_definition text;
  v_bad text := convert_from(decode('5b6dc383c2ad6469615d', 'hex'), 'UTF8');
BEGIN
  v_definition := pg_get_viewdef('public.vw_lead_timeline'::regclass, true);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_lead_timeline AS ' || replace(v_definition, v_bad, '[midia]');
END;
$$;

GRANT SELECT ON public.vw_lead_timeline TO authenticated, service_role;
