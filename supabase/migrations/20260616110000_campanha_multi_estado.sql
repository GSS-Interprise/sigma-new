-- Multi-estado na campanha (pedido Ramone: "Minas, Rio, Nordeste" na mesma estratégia).
-- Aditivo: nova coluna regiao_estados[]; a engine de seleção usa o array quando
-- presente, senão cai no regiao_estado (single) — retrocompatível.
alter table public.campanhas add column if not exists regiao_estados text[];

create or replace function public.selecionar_leads_campanha(p_campanha_id uuid, p_limite integer default 50)
 returns table(lead_id uuid, nome text, phone_e164 text, especialidade_nome text, uf text, cidade text)
 language plpgsql
 security definer
as $function$
declare
  v_especialidade_ids uuid[];
  v_especialidade_id_legacy uuid;
  v_sem_esp boolean;
  v_estado text;
  v_estados text[];
  v_cidades text[];
  v_excluidos uuid[];
begin
  select c.especialidade_ids, c.especialidade_id, coalesce(c.sem_especialidade, false),
         c.regiao_estado, c.regiao_estados, c.regiao_cidades, c.leads_excluidos_ids
  into v_especialidade_ids, v_especialidade_id_legacy, v_sem_esp,
       v_estado, v_estados, v_cidades, v_excluidos
  from campanhas c where c.id = p_campanha_id;

  if (v_especialidade_ids is null or cardinality(v_especialidade_ids) = 0) and v_especialidade_id_legacy is not null then
    v_especialidade_ids := array[v_especialidade_id_legacy];
  end if;

  return query
  select distinct on (l.id)
    l.id as lead_id, l.nome, l.phone_e164,
    coalesce(e.nome, 'Generalista') as especialidade_nome, l.uf, l.cidade
  from leads l
  left join lead_especialidades le on le.lead_id = l.id
  left join especialidades e on e.id = le.especialidade_id
  where l.merged_into_id is null
    and (
      case
        when v_sem_esp and (v_especialidade_ids is null or cardinality(v_especialidade_ids) = 0)
          then le.lead_id is null
        when v_sem_esp
          then (le.lead_id is null or le.especialidade_id = any(v_especialidade_ids))
        when v_especialidade_ids is null or cardinality(v_especialidade_ids) = 0
          then le.lead_id is not null
        else le.especialidade_id = any(v_especialidade_ids)
      end
    )
    and (
      case
        when v_estados is not null and cardinality(v_estados) > 0 then l.uf = any(v_estados)
        when v_estado is not null then l.uf = v_estado
        else true
      end
    )
    and (v_cidades is null or array_length(v_cidades, 1) is null or l.cidade = any(v_cidades))
    and l.phone_e164 is not null
    and l.phone_e164 != ''
    and l.opt_out = false
    and l.classificacao not in ('protegido', 'proibido')
    and (l.cooldown_ate is null or l.cooldown_ate <= now())
    and l.data_conversao is null
    and l.convertido_por is null
    and (l.unidades_vinculadas is null or array_length(l.unidades_vinculadas, 1) is null)
    and not exists (select 1 from blacklist bl where bl.phone_e164 = l.phone_e164)
    and not exists (select 1 from campanha_leads cl where cl.lead_id = l.id and cl.campanha_id = p_campanha_id)
    and not exists (select 1 from leads_bloqueio_temporario lb where lb.lead_id = l.id and lb.removed_at is null)
    and (v_excluidos is null or cardinality(v_excluidos) = 0 or not (l.id = any(v_excluidos)))
  order by l.id
  limit p_limite;
end;
$function$;
