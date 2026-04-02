-- Migrar medico_kanban_cards para leads
-- 1. Inserir leads a partir dos cards existentes
INSERT INTO public.leads (
  nome,
  phone_e164,
  cpf,
  crm,
  email,
  observacoes,
  data_nascimento,
  status,
  origem,
  created_at,
  updated_at
)
SELECT 
  mkc.nome,
  COALESCE(
    CASE 
      WHEN mkc.telefone ~ '^\+' THEN mkc.telefone
      WHEN mkc.telefone IS NOT NULL AND mkc.telefone != '' THEN 
        '+55' || regexp_replace(mkc.telefone, '[^0-9]', '', 'g')
      ELSE '+55' || RIGHT(gen_random_uuid()::text, 11)
    END,
    '+55' || RIGHT(gen_random_uuid()::text, 11)
  ) as phone_e164,
  mkc.cpf,
  mkc.crm,
  mkc.email,
  mkc.observacoes,
  mkc.data_nascimento,
  'Convertido' as status,
  'Kanban Médicos (migrado)' as origem,
  mkc.created_at,
  mkc.updated_at
FROM medico_kanban_cards mkc
WHERE NOT EXISTS (
  SELECT 1 FROM leads l WHERE l.email = mkc.email AND mkc.email IS NOT NULL
);

-- 2. Adicionar coluna medico_kanban_card_id na tabela leads para rastreabilidade (temporária)
-- Não vamos adicionar nova coluna, apenas usar a origem

-- 3. Atualizar view ou adicionar comentário sobre regra de disparos
-- A regra será implementada no código: leads com status 'Convertido' não aparecem em disparos

COMMENT ON TABLE public.leads IS 'Leads de captação médica. Leads com status Convertido não devem ser incluídos em disparos.';