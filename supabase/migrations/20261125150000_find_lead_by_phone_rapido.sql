-- find_lead_by_phone rápido também para quem NÃO é lead (25/11/2026).
--
-- Incidente: o chakra-webhook chama esta função a cada mensagem dos números de uso pessoal da equipe
-- (connection.somente_leads), e a maioria desses contatos não é lead. Para telefone não encontrado a função
-- caía no "último recurso" (phone_e164 = ANY(v) OR telefones_adicionais && v, sem filtro de unificado): sem
-- índice btree que cobrisse os leads unificados, o Postgres usava o índice trigram (idx_leads_phone_trgm) para
-- uma igualdade, ~75 ms por chamada. Com 44 chamadas simultâneas cada uma levou ~4 s e lotou o pool do
-- PostgREST (47 conexões): o Sigma inteiro ficou 20-60 s em "Carregando...".
--
-- Agora cada consulta tem índice próprio:
--   1. telefone principal de lead ativo ............ leads_phone_e164_unique (já existia)
--   2. telefones adicionais, ativo antes de unificado  idx_leads_telefones_adicionais_gin (uma passada só)
--   3. telefone principal de lead unificado ........ idx_leads_merged_phone (novo, ~5 mil linhas)

-- Em produção foi criado com CONCURRENTLY pela API antes desta migration; aqui só garante em outro ambiente.
CREATE INDEX IF NOT EXISTS idx_leads_merged_phone
  ON public.leads (phone_e164)
  WHERE merged_into_id IS NOT NULL;

-- O GIN de telefones_adicionais tinha 22.769 entradas na "pending list" (fastupdate), lida inteira em toda busca:
-- ~8 ms mesmo sem achar nada. Sem fastupdate a entrada vai direto para a árvore (escrita um pouco mais cara, rara
-- nesta coluna) e a busca cai para ~0,4 ms. Em produção já aplicado pela API com gin_clean_pending_list.
ALTER INDEX public.idx_leads_telefones_adicionais_gin SET (fastupdate = off);
SELECT gin_clean_pending_list('public.idx_leads_telefones_adicionais_gin'::regclass);

CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v text[] := public.phone_br_variants(p_phone);
  r uuid;
BEGIN
  IF cardinality(v) = 0 THEN RETURN NULL; END IF;

  -- Telefone principal de lead ativo; o número exatamente como chegou tem preferência.
  SELECT id INTO r FROM public.leads
   WHERE phone_e164 = ANY (v) AND merged_into_id IS NULL
   ORDER BY (phone_e164 = p_phone) DESC LIMIT 1;
  IF r IS NOT NULL THEN RETURN r; END IF;

  -- Telefones adicionais: lead ativo primeiro; unificado só se não houver ativo (antes eram duas passadas no GIN).
  SELECT id INTO r FROM public.leads
   WHERE telefones_adicionais && v
   ORDER BY (merged_into_id IS NULL) DESC, updated_at DESC NULLS LAST LIMIT 1;
  IF r IS NOT NULL THEN RETURN r; END IF;

  -- Último recurso: telefone principal de lead já unificado em outro (comportamento anterior).
  -- O filtro "merged_into_id IS NOT NULL" é o que faz o Postgres usar idx_leads_merged_phone; sem ele ia pelo trigram.
  SELECT id INTO r FROM public.leads
   WHERE phone_e164 = ANY (v) AND merged_into_id IS NOT NULL
   LIMIT 1;
  RETURN r;
END;
$function$;
