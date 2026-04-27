
-- 1) Função para clonar proposta "geral" da campanha em proposta personalizada do lead
CREATE OR REPLACE FUNCTION public.clonar_proposta_para_lead(
  proposta_origem_id uuid,
  lead_destino_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id uuid;
  v_origem RECORD;
  v_lead_nome text;
  v_next_numero int;
  v_descricao_marker text;
BEGIN
  IF proposta_origem_id IS NULL OR lead_destino_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Marca de origem para idempotência
  v_descricao_marker := 'origem_proposta:' || proposta_origem_id::text;

  -- Já existe clone deste lead a partir desta proposta?
  SELECT id INTO v_existing_id
    FROM public.proposta
   WHERE lead_id = lead_destino_id
     AND descricao LIKE '%' || v_descricao_marker || '%'
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Carrega proposta de origem
  SELECT * INTO v_origem FROM public.proposta WHERE id = proposta_origem_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Nome do lead (best-effort)
  SELECT COALESCE(nome, '') INTO v_lead_nome FROM public.leads WHERE id = lead_destino_id;

  -- Próximo numero_proposta para o lead
  SELECT COALESCE(MAX(numero_proposta), 0) + 1
    INTO v_next_numero
    FROM public.proposta
   WHERE lead_id = lead_destino_id;

  -- Cria nova proposta personalizada
  INSERT INTO public.proposta (
    lead_id, contrato_id, unidade_id, servico_id, licitacao_id,
    tipo, status, valor, nome, observacoes, descricao,
    numero_proposta, tipo_disparo,
    mensagem_whatsapp, mensagem_email, mensagem_instagram, mensagem_linkedin, mensagem_tiktok
  )
  VALUES (
    lead_destino_id,
    v_origem.contrato_id,
    v_origem.unidade_id,
    v_origem.servico_id,
    v_origem.licitacao_id,
    'personalizada',
    'personalizada',
    v_origem.valor,
    'Proposta personalizada - ' || COALESCE(NULLIF(v_lead_nome, ''), 'Lead'),
    v_origem.observacoes,
    'Proposta personalizada via campanha [' || v_descricao_marker || ']',
    v_next_numero,
    v_origem.tipo_disparo,
    v_origem.mensagem_whatsapp, v_origem.mensagem_email, v_origem.mensagem_instagram,
    v_origem.mensagem_linkedin, v_origem.mensagem_tiktok
  )
  RETURNING id INTO v_new_id;

  -- Copia itens
  INSERT INTO public.proposta_itens (
    proposta_id, contrato_item_id, item_nome, valor_contrato, valor_medico, quantidade
  )
  SELECT v_new_id, contrato_item_id, item_nome, valor_contrato, valor_medico, quantidade
    FROM public.proposta_itens
   WHERE proposta_id = proposta_origem_id;

  RETURN v_new_id;
END;
$$;

-- 2) Trigger: quando um disparo_contatos ganha lead + campanha_proposta, clonar automaticamente
CREATE OR REPLACE FUNCTION public.trg_clone_proposta_on_disparo_contato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposta_origem uuid;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.campanha_proposta_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT proposta_id INTO v_proposta_origem
    FROM public.campanha_propostas
   WHERE id = NEW.campanha_proposta_id;

  IF v_proposta_origem IS NOT NULL THEN
    PERFORM public.clonar_proposta_para_lead(v_proposta_origem, NEW.lead_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clone_proposta_on_disparo_contato_ins ON public.disparos_contatos;
CREATE TRIGGER trg_clone_proposta_on_disparo_contato_ins
AFTER INSERT ON public.disparos_contatos
FOR EACH ROW
EXECUTE FUNCTION public.trg_clone_proposta_on_disparo_contato();

DROP TRIGGER IF EXISTS trg_clone_proposta_on_disparo_contato_upd ON public.disparos_contatos;
CREATE TRIGGER trg_clone_proposta_on_disparo_contato_upd
AFTER UPDATE OF lead_id, campanha_proposta_id ON public.disparos_contatos
FOR EACH ROW
WHEN (NEW.lead_id IS NOT NULL AND NEW.campanha_proposta_id IS NOT NULL)
EXECUTE FUNCTION public.trg_clone_proposta_on_disparo_contato();

-- 3) Backfill dos disparos já existentes
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT cp.proposta_id, dc.lead_id
      FROM public.disparos_contatos dc
      JOIN public.campanha_propostas cp ON cp.id = dc.campanha_proposta_id
      LEFT JOIN public.proposta p
        ON p.lead_id = dc.lead_id
       AND p.descricao LIKE '%origem_proposta:' || cp.proposta_id::text || '%'
     WHERE dc.lead_id IS NOT NULL
       AND dc.campanha_proposta_id IS NOT NULL
       AND cp.proposta_id IS NOT NULL
       AND p.id IS NULL
  LOOP
    PERFORM public.clonar_proposta_para_lead(r.proposta_id, r.lead_id);
  END LOOP;
END$$;
