-- Raio-X: _raiox_leads sem varrer a tabela leads inteira.
--
-- Em 14/11/2026 a 1ª chamada de bi_raiox_funil para Pediatria estourou o statement_timeout de 8 s do PostgREST
-- (erro 57014). Com cache quente a mesma chamada leva 2,8 s; com 3 especialidades, 5,5 s. A causa: o OR entre
-- leads.especialidade_id e o EXISTS em lead_especialidades impede o uso de índice, então cada chamada de
-- _raiox_leads faz Seq Scan nos ~833 mil leads (~0,5 s com cache quente, bem mais com cache frio). O funil chama
-- _raiox_leads 3 vezes (base_crm, email e dentro de _raiox_contatos), e as outras RPCs bi_raiox_* também a usam.
--
-- Agora são dois ramos com índice (leads.especialidade_id e lead_especialidades.especialidade_id) unidos por UNION.
-- Sem filtro de UF, o segundo ramo nem toca em leads. Medido em produção, só leitura, com Pediatria, Anestesiologia
-- e Medicina Intensiva Pediátrica: 171 ms contra 526 ms sem UF, 273 ms com SC e PR. O conjunto de lead_id ficou
-- idêntico nos dois casos (EXCEPT vazio nos dois sentidos).
--
-- ROWS 50000: a função é SECURITY DEFINER e não é inlined; sem a dica o planner supõe 1.000 linhas e escolhe
-- mal os joins com campanha_leads e email_envios (Pediatria sozinha tem ~57 mil leads no escopo).
create or replace function public._raiox_leads(p_especialidade_ids uuid[], p_ufs text[])
returns table (lead_id uuid)
language sql
stable
security definer
set search_path = public
rows 50000
as $$
  select l.id
    from leads l
   where l.especialidade_id = any(p_especialidade_ids)
     and (cardinality(coalesce(p_ufs, '{}')) = 0 or l.uf = any(p_ufs))
  union
  select le.lead_id
    from lead_especialidades le
   where le.especialidade_id = any(p_especialidade_ids)
     and (cardinality(coalesce(p_ufs, '{}')) = 0
          or exists (select 1 from leads l where l.id = le.lead_id and l.uf = any(p_ufs)));
$$;

revoke all on function public._raiox_leads(uuid[], text[]) from public, anon, authenticated;
