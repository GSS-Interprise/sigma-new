-- Fase 2 do plano docs/arquitetura/plano-goal-gss-dono-no-comando.md:
-- campanha com vários números oficiais + funções do assistente de criação de campanha.

-- 2.1 — vários números oficiais por campanha.
-- O template é aprovado por conta (WABA), não por número: a campanha guarda o NOME do modelo e
-- cada número usa a sua cópia aprovada (content_sid 'chakra:<plugin_id>:<id>').
alter table public.campanhas
  add column if not exists official_sender_ids uuid[] not null default '{}',
  add column if not exists official_template_name text,
  add column if not exists official_sender_cursor integer not null default 0,
  add column if not exists official_senders_pausados uuid[] not null default '{}',
  add column if not exists criada_via text,
  add column if not exists aprovado_por uuid references auth.users(id),
  add column if not exists aprovado_em timestamptz;

update public.campanhas c
   set official_sender_ids = array[c.official_sender_id]
 where c.official_sender_id is not null and cardinality(c.official_sender_ids) = 0;

update public.campanhas c
   set official_template_name = t.friendly_name
  from public.whatsapp_official_templates t
 where t.id = c.official_template_id and c.official_template_name is null;

-- Cópia aprovada de um modelo (pelo nome) na conta de um número.
create or replace function public.campanha_template_do_numero(p_sender_id uuid, p_template_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from whatsapp_official_senders s
  join whatsapp_official_templates t
    on t.provider = 'chakra'
   and t.approval_status = 'approved'
   and t.friendly_name = p_template_name
   and t.content_sid like 'chakra:' || s.chakra_plugin_id || ':%'
  where s.id = p_sender_id
  order by t.updated_at desc nulls last
  limit 1;
$$;

revoke all on function public.campanha_template_do_numero(uuid, text) from public, anon;
grant execute on function public.campanha_template_do_numero(uuid, text) to authenticated, service_role;

-- 2.2 — Números oficiais de prospecção, com os modelos aprovados em cada um.
create or replace function public.campanha_assistente_numeros()
returns table (
  sender_id uuid,
  phone_e164 text,
  display_name text,
  disponibilidade text,
  disponibilidade_motivo text,
  responsavel_nome text,
  templates text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    c.phone_e164,
    c.display_name,
    c.disponibilidade,
    c.disponibilidade_motivo,
    p.nome_completo,
    coalesce((
      select array_agg(distinct t.friendly_name order by t.friendly_name)
      from whatsapp_official_templates t
      where t.provider = 'chakra' and t.approval_status = 'approved' and t.language = 'pt_BR'
        and t.content_sid like 'chakra:' || c.plugin_id || ':%'
        and coalesce(t.twilio_payload ->> 'category', 'MARKETING') = 'MARKETING'
        and t.body !~ '�|Ã'
    ), '{}')
  from whatsapp_chakra_connections c
  join whatsapp_official_senders s on s.provider = 'chakra' and s.chakra_phone_number_id = c.phone_number_id
  left join profiles p on p.id = c.responsavel_id
  where c.uso = 'prospeccao'
    and coalesce(c.status, '') <> 'desconectado'
    and auth.uid() is not null
  order by case c.disponibilidade when 'disponivel' then 0 when 'atencao' then 1 else 2 end, c.phone_e164;
$$;

revoke all on function public.campanha_assistente_numeros() from public, anon;
grant execute on function public.campanha_assistente_numeros() to authenticated, service_role;

-- Modelos aprovados (marketing, pt_BR) com o texto e em quantos números cada um existe.
create or replace function public.campanha_assistente_modelos()
returns table (friendly_name text, body text, variables jsonb, numeros integer)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (t.friendly_name)
    t.friendly_name,
    t.body,
    t.variables,
    (select count(distinct split_part(t2.content_sid, ':', 2))::int
       from whatsapp_official_templates t2
      where t2.provider = 'chakra' and t2.approval_status = 'approved' and t2.friendly_name = t.friendly_name)
  from whatsapp_official_templates t
  where t.provider = 'chakra' and t.approval_status = 'approved' and t.language = 'pt_BR'
    and coalesce(t.twilio_payload ->> 'category', 'MARKETING') = 'MARKETING'
    and t.body !~ '�|Ã'
    and t.friendly_name !~ '^gss_teste'
    and auth.uid() is not null
  order by t.friendly_name, t.updated_at desc nulls last;
$$;

revoke all on function public.campanha_assistente_modelos() from public, anon;
grant execute on function public.campanha_assistente_modelos() to authenticated, service_role;

-- Leads que entram numa campanha nova: mesmos filtros do campanha_wizard_preview
-- (sem opt-out, blacklist, protegido/proibido, cooldown), aceitando várias UFs.
create or replace function public.campanha_assistente_leads(
  p_especialidade_ids uuid[],
  p_ufs text[] default null,
  p_cidades text[] default null,
  p_lista_id uuid default null
)
returns table (lead_id uuid, cidade text, em_outra boolean)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (l.id)
    l.id,
    l.cidade,
    exists (
      select 1 from campanha_leads cl join campanhas c on c.id = cl.campanha_id
      where cl.lead_id = l.id and c.status in ('ativa', 'pausada')
    )
  from leads l
  where l.merged_into_id is null
    and nullif(l.phone_e164, '') is not null
    and coalesce(l.opt_out, false) = false
    and (l.classificacao is null or l.classificacao not in ('protegido', 'proibido'))
    and (l.cooldown_ate is null or l.cooldown_ate <= now())
    and not exists (select 1 from blacklist bl where bl.phone_e164 = l.phone_e164)
    and (
      p_lista_id is not null
        and exists (select 1 from disparo_lista_itens i where i.lista_id = p_lista_id and i.lead_id = l.id)
      or p_lista_id is null
        and exists (
          select 1 from lead_especialidades le
          where le.lead_id = l.id and le.especialidade_id = any(coalesce(p_especialidade_ids, '{}'))
        )
        and (p_ufs is null or cardinality(p_ufs) = 0 or l.uf = any(p_ufs))
        and (p_cidades is null or cardinality(p_cidades) = 0 or l.cidade = any(p_cidades))
    );
$$;

revoke all on function public.campanha_assistente_leads(uuid[], text[], text[], uuid) from public, anon;
grant execute on function public.campanha_assistente_leads(uuid[], text[], text[], uuid) to authenticated, service_role;

-- Universo do CFM por especialidade (Brasil e UFs). O texto do CFM vem como
-- "&PEDIATRIA - RQE Nº: 1261&NEONATOLOGIA - RQE Nº: 99": casa o nome exato entre "&" e " -"/"&"/fim.
-- (A Fase 7.1 troca isto por uma tabela normalizada.)
create or replace function public.campanha_assistente_universo_cfm(p_especialidade_ids uuid[], p_ufs text[] default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with nomes as (
    select upper(e.nome) as nome from especialidades e where e.id = any(coalesce(p_especialidade_ids, '{}'))
  ),
  medicos as (
    select distinct m.nu_crm, m.sg_uf
    from cfm_medicos_staging m
    join nomes n
      on m.especialidade like '%&' || n.nome || ' -%'
      or m.especialidade like '%&' || n.nome || '&%'
      or m.especialidade like '%&' || n.nome
    where coalesce(m.situacao, '') !~* 'falecid|cassad|cancelad'
  )
  select jsonb_build_object(
    'brasil', (select count(*) from medicos),
    'nas_ufs', case when p_ufs is null or cardinality(p_ufs) = 0 then null
                    else (select count(*) from medicos where sg_uf = any(p_ufs)) end,
    'atualizado_em', (select max(importado_em) from cfm_medicos_staging)
  )
  where auth.uid() is not null;
$$;

revoke all on function public.campanha_assistente_universo_cfm(uuid[], text[]) from public, anon;
grant execute on function public.campanha_assistente_universo_cfm(uuid[], text[]) to authenticated, service_role;

-- Prévia da lista para o passo 2 do assistente.
create or replace function public.campanha_assistente_previa(
  p_especialidade_ids uuid[],
  p_ufs text[] default null,
  p_cidades text[] default null,
  p_lista_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select * from campanha_assistente_leads(p_especialidade_ids, p_ufs, p_cidades, p_lista_id)
  )
  select jsonb_build_object(
    'entram', (select count(*) from base where not em_outra),
    'em_outras_campanhas', (select count(*) from base where em_outra),
    'top_cidades', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(cidade, ''), '(sem cidade)') as cidade, count(*) as n
        from base where not em_outra group by 1 order by n desc limit 8
      ) x
    )
  )
  where auth.uid() is not null;
$$;

revoke all on function public.campanha_assistente_previa(uuid[], text[], text[], uuid) from public, anon;
grant execute on function public.campanha_assistente_previa(uuid[], text[], text[], uuid) to authenticated, service_role;

-- Cria a campanha montada pelo assistente e coloca os leads na estratégia principal.
-- Só a API oficial (Chakra) — decisão de 08/11. Quem confirmou fica registrado.
create or replace function public.campanha_assistente_criar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_nome_user text;
  v_campanha uuid;
  v_strategy uuid;
  v_senders uuid[];
  v_template_name text := nullif(p ->> 'template_name', '');
  v_template_id uuid;
  v_esp uuid[];
  v_ufs text[];
  v_cidades text[];
  v_lista uuid := nullif(p ->> 'lista_id', '')::uuid;
  v_por_numero int := greatest(1, least(coalesce((p ->> 'limite_por_numero')::int, 50), 250));
  v_lead_ids uuid[];
  v_inseridos int := 0;
  v_status text := case when coalesce((p ->> 'comecar')::boolean, false) then 'ativa' else 'pausada' end;
begin
  if v_user is null then raise exception 'authentication_required'; end if;

  select array_agg(x::uuid) into v_senders from jsonb_array_elements_text(coalesce(p -> 'sender_ids', '[]')) x;
  select array_agg(x::uuid) into v_esp from jsonb_array_elements_text(coalesce(p -> 'especialidade_ids', '[]')) x;
  select array_agg(x) into v_ufs from jsonb_array_elements_text(coalesce(p -> 'ufs', '[]')) x;
  select array_agg(x) into v_cidades from jsonb_array_elements_text(coalesce(p -> 'cidades', '[]')) x;

  if coalesce(cardinality(v_senders), 0) = 0 then raise exception 'escolha_ao_menos_um_numero'; end if;
  if v_template_name is null then raise exception 'escolha_um_modelo'; end if;
  if v_lista is null and coalesce(cardinality(v_esp), 0) = 0 then raise exception 'escolha_especialidade_ou_lista'; end if;

  -- Todo número escolhido precisa ter a cópia aprovada do modelo.
  if exists (select 1 from unnest(v_senders) s where campanha_template_do_numero(s, v_template_name) is null) then
    raise exception 'modelo_nao_aprovado_em_algum_numero';
  end if;
  v_template_id := campanha_template_do_numero(v_senders[1], v_template_name);

  select nome_completo into v_nome_user from profiles where id = v_user;

  insert into campanhas (
    nome, canal, status, tipo_campanha, tipo_envio,
    especialidade_ids, especialidade_id, regiao_estados, regiao_estado, regiao_cidades,
    whatsapp_provider, official_sender_ids, official_sender_id, official_template_name, official_template_id,
    official_template_variables, limite_diario_campanha,
    horario_inteligente_ativo, horario_inicio_brt, horario_fim_brt, dias_semana,
    briefing_ia, cadencia_ativa, responsavel_id, nome_remetente,
    criada_via, aprovado_por, aprovado_em, criado_por, created_by, created_by_name
  ) values (
    coalesce(nullif(p ->> 'nome', ''), 'Campanha ' || to_char(now(), 'DD/MM')),
    'whatsapp', v_status, 'prospeccao', 'ia',
    v_esp, v_esp[1], v_ufs, v_ufs[1], v_cidades,
    'chakra', v_senders, v_senders[1], v_template_name, v_template_id,
    coalesce(p -> 'template_variables', '{}'::jsonb), v_por_numero * cardinality(v_senders),
    true, 7, 17, array[1, 2, 3, 4, 5],
    coalesce(p -> 'briefing', '{}'::jsonb), true, v_user, 'Equipe GSS',
    'assistente', v_user, now(), v_user, v_user, v_nome_user
  ) returning id into v_campanha;

  -- A estratégia principal nasce pelo trigger da campanha.
  select id into v_strategy from campaign_strategies where campanha_id = v_campanha order by prioridade asc limit 1;
  if v_strategy is null then raise exception 'estrategia_principal_nao_criada'; end if;

  if v_lista is not null then
    insert into campanha_listas (campanha_id, lista_id, created_by) values (v_campanha, v_lista, v_user)
    on conflict do nothing;
  end if;

  -- Quem já está em campanha ativa/pausada fica de fora (não falar duas vezes com o mesmo médico).
  select array_agg(lead_id) into v_lead_ids
    from campanha_assistente_leads(v_esp, v_ufs, v_cidades, v_lista)
   where not em_outra;
  if coalesce(cardinality(v_lead_ids), 0) > 0 then
    v_inseridos := adicionar_leads_estrategia(v_campanha, v_strategy, v_lead_ids);
  end if;

  return jsonb_build_object('campanha_id', v_campanha, 'leads', v_inseridos, 'status', v_status);
end;
$$;

revoke all on function public.campanha_assistente_criar(jsonb) from public, anon;
grant execute on function public.campanha_assistente_criar(jsonb) to authenticated, service_role;
