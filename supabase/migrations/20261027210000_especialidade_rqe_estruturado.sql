-- Pedido da Bianca (27/10/2026): o filtro de especialidade do Corpo Clínico lia texto livre de
-- planilha ("ANESTESIOLOGIA", "Anestesiologia", "R3 anestesio"...) e o RQE era um campo solto,
-- sem dizer de qual especialidade era. A partir daqui:
--   * lead_especialidades é a fonte da verdade: uma linha por especialidade do catálogo, com o
--     número do RQE dela ou sem_rqe = true (generalista / clínico sem residência);
--   * salvar_especialidades_lead grava a lista inteira e copia para os campos antigos
--     (leads.especialidades, leads.rqe, medicos.especialidade, medicos.rqe_numeros), que outras
--     telas e funções ainda leem;
--   * medicos_especialidades_padrao alimenta o filtro e a coluna do Corpo Clínico.

alter table public.lead_especialidades
  add column if not exists sem_rqe boolean not null default false;

-- Texto do catálogo para comparar: maiúsculo e sem acento (nome e apelidos).
create or replace function public.especialidade_chave(t text)
returns text language sql immutable as $$
  select upper(public.unaccent(trim(t)))
$$;

create or replace function public.salvar_especialidades_lead(p_lead_id uuid, p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  v_rqe text;
  v_sem boolean;
  v_ids uuid[] := '{}';
  v_nomes text[];
  v_rqes text[];
  v_resumo text;
begin
  if auth.uid() is null then raise exception 'sem_permissao'; end if;
  if not exists (select 1 from leads where id = p_lead_id) then raise exception 'lead_nao_encontrado'; end if;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    -- RQE é número: aceita "RQE nº 8048" e guarda só "8048"
    v_rqe := nullif(regexp_replace(coalesce(it->>'rqe', ''), '\D', '', 'g'), '');
    v_sem := coalesce((it->>'sem_rqe')::boolean, false);
    if v_rqe is null and not v_sem then
      raise exception 'rqe_obrigatorio: %', (select nome from especialidades where id = (it->>'especialidade_id')::uuid);
    end if;
    if v_sem then v_rqe := null; end if;

    insert into lead_especialidades (lead_id, especialidade_id, rqe, sem_rqe, fonte)
    values (p_lead_id, (it->>'especialidade_id')::uuid, v_rqe, v_sem, 'manual')
    on conflict (lead_id, especialidade_id) do update
      set rqe = excluded.rqe, sem_rqe = excluded.sem_rqe,
          fonte = case when lead_especialidades.rqe is distinct from excluded.rqe
                         or lead_especialidades.sem_rqe is distinct from excluded.sem_rqe
                       then 'manual' else lead_especialidades.fonte end;
    v_ids := v_ids || (it->>'especialidade_id')::uuid;
  end loop;

  delete from lead_especialidades where lead_id = p_lead_id and not (especialidade_id = any(v_ids));

  select array_agg(e.nome order by e.nome),
         array_agg(le.rqe order by e.nome) filter (where le.rqe is not null),
         string_agg(e.nome || ' - ' || case when le.sem_rqe then 'sem RQE' else 'RQE ' || le.rqe end, ', ' order by e.nome)
    into v_nomes, v_rqes, v_resumo
    from lead_especialidades le join especialidades e on e.id = le.especialidade_id
   where le.lead_id = p_lead_id;

  update leads set especialidades = coalesce(v_nomes, '{}'), rqe = v_resumo, updated_at = now()
   where id = p_lead_id;
  update medicos set especialidade = coalesce(v_nomes, '{}'), rqe_numeros = coalesce(v_rqes, '{}'), updated_at = now()
   where lead_id = p_lead_id;

  return jsonb_build_object('especialidades', coalesce(v_nomes, '{}'), 'rqe', v_resumo);
end $$;

grant execute on function public.salvar_especialidades_lead(uuid, jsonb) to authenticated, service_role;

-- Um objeto { medico_id: [ {nome, rqe, sem_rqe}, ... ] } para o Corpo Clínico. Volta como um
-- só JSON porque a lista passa de mil linhas (limite padrão do PostgREST).
-- Médico com lead: lê lead_especialidades. Médico antigo sem lead (71 em 27/10): cai no texto de
-- medicos.especialidade, só o que bate com o catálogo.
create or replace function public.medicos_especialidades_padrao()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with cat as (
    select distinct on (k) k, id, nome from (
      select public.especialidade_chave(nome) k, id, nome, 0 pri from especialidades where ativo
      union all
      select public.especialidade_chave(a), e.id, e.nome, 1 from especialidades e, unnest(e.aliases) a where e.ativo
    ) z order by k, pri),
  linhas as (
    select m.id medico_id, e.nome, le.rqe, le.sem_rqe
      from medicos m
      join lead_especialidades le on le.lead_id = m.lead_id
      join especialidades e on e.id = le.especialidade_id
    union
    select m.id, c.nome, null, false
      from medicos m, unnest(coalesce(m.especialidade, '{}')) t,
           regexp_split_to_table(t, '\s*[,;/&]\s*') p
      join cat c on c.k = public.especialidade_chave(p)
     where m.lead_id is null
  )
  select coalesce(jsonb_object_agg(medico_id, itens), '{}'::jsonb)
    from (select medico_id, jsonb_agg(jsonb_build_object('nome', nome, 'rqe', rqe, 'sem_rqe', sem_rqe) order by nome) itens
            from linhas group by medico_id) g
$$;

grant execute on function public.medicos_especialidades_padrao() to authenticated, service_role;

-- ── Preenchimento a partir do que já existe (só leads de médicos do Corpo Clínico) ──────────
-- Nada de texto antigo é apagado: leads.rqe, leads.especialidades e medicos.especialidade ficam
-- como estão até alguém salvar o perfil pela tela nova.

-- 1) Texto do CFM: "ANESTESIOLOGIA - RQE Nº 8048, MEDICINA INTENSIVA - RQE Nº 8301".
--    Atenção: no Postgres a primeira repetição da expressão define se ela toda é gulosa; com
--    "+?" no nome o número saía com um dígito só. Por isso o nome é "+" (guloso).
--    RQE já gravado (vindo do CFM) não é trocado: em 3 casos o texto diz outro número.
with cat as (
  select distinct on (k) k, id from (
    select public.especialidade_chave(nome) k, id, 0 pri from especialidades where ativo
    union all
    select public.especialidade_chave(a), e.id, 1 from especialidades e, unnest(e.aliases) a where e.ativo
  ) z order by k, pri),
pares as (
  select l.id lead_id, c.id esp_id, max(x[2]) rqe
    from leads l
    join (select distinct lead_id from medicos where lead_id is not null) ml on ml.lead_id = l.id,
         regexp_matches(coalesce(l.rqe, '') || ' & ' || coalesce(array_to_string(l.especialidades, ' & '), ''),
                        '([A-Za-zÀ-ú ]+)\s*-\s*RQE\s*N?[º°o]?\.?\s*:?\s*(\d+)', 'g') x
    join cat c on c.k = public.especialidade_chave(x[1])
   group by 1, 2)
insert into lead_especialidades (lead_id, especialidade_id, rqe, fonte)
select lead_id, esp_id, rqe, 'rqe_texto_2026-10' from pares
on conflict (lead_id, especialidade_id) do update
  set rqe = excluded.rqe
  where coalesce(lead_especialidades.rqe, '') = '';

-- 2) Médico com lead e nenhuma especialidade estruturada: usa o texto antigo que bate com o
--    catálogo ("Anestesiologia, Terapia Intensiva" vira duas).
with cat as (
  select distinct on (k) k, id from (
    select public.especialidade_chave(nome) k, id, 0 pri from especialidades where ativo
    union all
    select public.especialidade_chave(a), e.id, 1 from especialidades e, unnest(e.aliases) a where e.ativo
  ) z order by k, pri)
insert into lead_especialidades (lead_id, especialidade_id, fonte)
select distinct m.lead_id, c.id, 'legado_texto_2026-10'
  from medicos m join leads l on l.id = m.lead_id,
       unnest(coalesce(m.especialidade, '{}') || coalesce(l.especialidades, '{}')) t,
       regexp_split_to_table(t, '\s*[,;/&]\s*') p
  join cat c on c.k = public.especialidade_chave(p)
 where not exists (select 1 from lead_especialidades le where le.lead_id = m.lead_id)
on conflict (lead_id, especialidade_id) do nothing;

-- 3) RQE só com o número ("53367", "27178/SC") e o médico com uma especialidade só: o número é
--    dela. Com duas ou mais especialidades não dá para saber; fica para a equipe completar.
update lead_especialidades le
   set rqe = substring(l.rqe from '(\d{3,6})'), fonte = 'rqe_numero_2026-10'
  from leads l
 where l.id = le.lead_id
   and coalesce(le.rqe, '') = '' and not le.sem_rqe
   and l.rqe ~ '^\D*\d{3,6}\D*$'
   and l.id in (select lead_id from medicos where lead_id is not null)
   and (select count(*) from lead_especialidades x where x.lead_id = le.lead_id) = 1;
