-- RQE do corpo clínico preenchido pelo CFM (25/11/2026). 196 especialidades de 188 médicos do corpo clínico estavam
-- sem RQE. Casando o CRM e a UF do lead com a base do CFM (cfm_medico_especialidades, importada em 07/06), 26 têm o
-- RQE da MESMA especialidade: esses entram (fonte 'cfm'). Os outros ficam para a equipe:
--   - 35: o CFM tem RQE, mas de outra especialidade (o cadastro do Sigma pode estar com a especialidade errada);
--   - 50: lead sem UF; os demais não estão na base do CFM.
-- Depois, o resumo do lead (leads.rqe/especialidades) e do médico (medicos.rqe_numeros) é refeito igual a
-- salvar_especialidades_lead (20261027210000).

with alvo as (
  select le.lead_id, le.especialidade_id, min(c.rqe) as rqe
    from medicos m
    join lead_especialidades le on le.lead_id = m.lead_id
    join leads l on l.id = m.lead_id
    join cfm_medico_especialidades c
      on ltrim(c.nu_crm, '0') = ltrim(regexp_replace(l.crm, '\D', '', 'g'), '0')
     and c.sg_uf = upper(l.uf) and c.especialidade_id = le.especialidade_id
   where coalesce(le.rqe, '') = '' and not coalesce(le.sem_rqe, false)
     and nullif(regexp_replace(coalesce(c.rqe, ''), '\D', '', 'g'), '') is not null
   group by 1, 2
)
update lead_especialidades le
   set rqe = regexp_replace(a.rqe, '\D', '', 'g'), fonte = 'cfm'
  from alvo a
 where a.lead_id = le.lead_id and a.especialidade_id = le.especialidade_id;

with tocados as (select distinct lead_id from lead_especialidades where fonte = 'cfm' and rqe is not null),
resumo as (
  select le.lead_id,
         array_agg(e.nome order by e.nome) as nomes,
         array_agg(le.rqe order by e.nome) filter (where le.rqe is not null) as rqes,
         string_agg(e.nome || ' - ' || case when le.sem_rqe then 'sem RQE' else 'RQE ' || le.rqe end, ', ' order by e.nome) as txt
    from lead_especialidades le join especialidades e on e.id = le.especialidade_id
   where le.lead_id in (select lead_id from tocados)
   group by 1
)
update medicos m set rqe_numeros = coalesce(r.rqes, '{}'), updated_at = now()
  from resumo r where r.lead_id = m.lead_id;

with tocados as (select distinct lead_id from lead_especialidades where fonte = 'cfm' and rqe is not null),
resumo as (
  select le.lead_id,
         string_agg(e.nome || ' - ' || case when le.sem_rqe then 'sem RQE' else 'RQE ' || le.rqe end, ', ' order by e.nome) as txt
    from lead_especialidades le join especialidades e on e.id = le.especialidade_id
   where le.lead_id in (select lead_id from tocados)
   group by 1
)
update leads l set rqe = r.txt, updated_at = now()
  from resumo r where r.lead_id = l.id;
