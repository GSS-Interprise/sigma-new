-- Claude dos sócios da GSS, T1 (docs/arquitetura/claude-socios-gss.md §3b).
-- Escalas do Dr. Escala trazidas pelo robô da VPS (rotina drescala_escalas, vps/sigma-rotinas/drescala.py).
-- Fonte separada de escalas_integradas: aquela vem da API de BI (sem furo, sem CRM) e alimenta as telas antigas
-- e o financeiro; estas vêm da API interna do app e têm furo, situação e tipo.
-- Ids são os do próprio Dr. Escala, para o upsert ser idempotente entre execuções.

create table if not exists public.drescala_locais (
  id bigint primary key,
  nome text not null,
  cidade text,
  uf text,
  habilitado boolean not null default true,
  raw jsonb,
  atualizado_em timestamptz not null default now()
);
grant select on public.drescala_locais to authenticated;
grant all on public.drescala_locais to service_role;

create table if not exists public.drescala_setores (
  id bigint primary key,
  local_id bigint references public.drescala_locais(id) on delete set null,
  nome text not null,
  raw jsonb,
  atualizado_em timestamptz not null default now()
);
grant select on public.drescala_setores to authenticated;
grant all on public.drescala_setores to service_role;

create table if not exists public.drescala_sincronizacoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.rotina_pedidos(id) on delete set null,
  periodo_inicio date not null,
  periodo_fim date not null,
  local_ids bigint[],             -- null = todos os locais
  status text not null default 'executando' check (status in ('executando', 'ok', 'erro')),
  locais int not null default 0,
  setores int not null default 0,
  plantoes int not null default 0,
  furos int not null default 0,
  removidos int not null default 0,
  erro text,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create index if not exists drescala_sincronizacoes_ok_idx on public.drescala_sincronizacoes (status, concluido_em desc);
grant select on public.drescala_sincronizacoes to authenticated;
grant all on public.drescala_sincronizacoes to service_role;

create table if not exists public.drescala_plantoes (
  id bigint primary key,
  local_id bigint,
  setor_id bigint,
  data date not null,             -- dia de início em hora de Brasília (plantão noturno termina no dia seguinte)
  inicio timestamptz not null,
  fim timestamptz,
  profissional_id bigint,
  profissional_nome text,
  profissional_crm text,
  situacao text,
  tipo text,
  furo boolean not null default false,
  anunciado boolean not null default false,
  ultima_sync uuid,
  raw jsonb,
  atualizado_em timestamptz not null default now()
);
create index if not exists drescala_plantoes_data_idx on public.drescala_plantoes (data, local_id);
create index if not exists drescala_plantoes_furo_idx on public.drescala_plantoes (data) where furo;
create index if not exists drescala_plantoes_prof_idx on public.drescala_plantoes (profissional_id, data);
grant select on public.drescala_plantoes to authenticated;
grant all on public.drescala_plantoes to service_role;

-- Leitura: quem cuida de escala e a diretoria. Escrita só pela service role (robô via edge rotinas-fila).
do $$
declare t text;
begin
  foreach t in array array['drescala_locais', 'drescala_setores', 'drescala_plantoes', 'drescala_sincronizacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ler', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (
      public.is_admin(auth.uid())
      or public.has_role(auth.uid(), 'diretoria'::app_role)
      or public.has_role(auth.uid(), 'coordenador_escalas'::app_role))$p$, t || '_ler', t);
  end loop;
end $$;

-- Plantão com nome do hospital e do setor: base das ferramentas do MCP (sigma-mcp).
create or replace view public.drescala_escala_v
with (security_invoker = true) as
select p.id, p.data, p.inicio, p.fim,
       p.local_id, l.nome as hospital, l.cidade,
       p.setor_id, s.nome as setor,
       p.profissional_id, p.profissional_nome, p.profissional_crm,
       p.situacao, p.tipo, p.furo, p.anunciado, p.atualizado_em
  from public.drescala_plantoes p
  left join public.drescala_locais l on l.id = p.local_id
  left join public.drescala_setores s on s.id = p.setor_id
 -- O Dr. Escala tem locais de teste ("EMPRESA DR ESCALA - LOCAL TESTE", "EMPRESA LOCAL TESTE 2") que
 -- apareciam como furo nas respostas dos sócios.
 where coalesce(l.nome, '') not ilike '%local teste%';
grant select on public.drescala_escala_v to authenticated, service_role;

-- ---- gravação pelo robô ------------------------------------------------------------------------------

create or replace function public.drescala_abrir_sync(p_pedido uuid, p_inicio date, p_fim date, p_local_ids bigint[])
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into drescala_sincronizacoes (pedido_id, periodo_inicio, periodo_fim, local_ids)
  values (p_pedido, p_inicio, p_fim, nullif(p_local_ids, '{}'))
  returning id;
$$;

-- Um lote do robô: locais, setores e plantões já normalizados pelo worker (drescala.py).
-- Plantão: {id, local_id, setor_id, inicio, fim, profissional_id, profissional_nome, profissional_crm,
--           situacao, tipo, furo, anunciado, raw}
create or replace function public.drescala_gravar_lote(p_sync uuid, p_locais jsonb, p_setores jsonb, p_plantoes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_loc int := 0; v_set int := 0; v_pl int := 0;
begin
  if not exists (select 1 from drescala_sincronizacoes where id = p_sync and status = 'executando') then
    raise exception 'sync_invalida';
  end if;

  insert into drescala_locais (id, nome, cidade, uf, habilitado, raw, atualizado_em)
  select (x->>'id')::bigint, x->>'nome', x->>'cidade', x->>'uf', coalesce((x->>'habilitado')::boolean, true), x->'raw', now()
    from jsonb_array_elements(coalesce(p_locais, '[]')) x
  on conflict (id) do update set nome = excluded.nome, cidade = excluded.cidade, uf = excluded.uf,
    habilitado = excluded.habilitado, raw = excluded.raw, atualizado_em = now();
  get diagnostics v_loc = row_count;

  insert into drescala_setores (id, local_id, nome, raw, atualizado_em)
  select (x->>'id')::bigint, (x->>'local_id')::bigint, x->>'nome', x->'raw', now()
    from jsonb_array_elements(coalesce(p_setores, '[]')) x
  on conflict (id) do update set local_id = excluded.local_id, nome = excluded.nome, raw = excluded.raw, atualizado_em = now();
  get diagnostics v_set = row_count;

  insert into drescala_plantoes (id, local_id, setor_id, data, inicio, fim, profissional_id, profissional_nome,
                                 profissional_crm, situacao, tipo, furo, anunciado, ultima_sync, raw, atualizado_em)
  select (x->>'id')::bigint, (x->>'local_id')::bigint, (x->>'setor_id')::bigint,
         ((x->>'inicio')::timestamptz at time zone 'America/Sao_Paulo')::date,
         (x->>'inicio')::timestamptz, nullif(x->>'fim', '')::timestamptz,
         (x->>'profissional_id')::bigint, nullif(x->>'profissional_nome', ''), nullif(x->>'profissional_crm', ''),
         x->>'situacao', x->>'tipo', coalesce((x->>'furo')::boolean, false), coalesce((x->>'anunciado')::boolean, false),
         p_sync, x->'raw', now()
    from jsonb_array_elements(coalesce(p_plantoes, '[]')) x
  on conflict (id) do update set local_id = excluded.local_id, setor_id = excluded.setor_id, data = excluded.data,
    inicio = excluded.inicio, fim = excluded.fim, profissional_id = excluded.profissional_id,
    profissional_nome = excluded.profissional_nome, profissional_crm = excluded.profissional_crm,
    situacao = excluded.situacao, tipo = excluded.tipo, furo = excluded.furo, anunciado = excluded.anunciado,
    ultima_sync = excluded.ultima_sync, raw = excluded.raw, atualizado_em = now();
  get diagnostics v_pl = row_count;

  update drescala_sincronizacoes set locais = locais + v_loc, setores = setores + v_set, plantoes = plantoes + v_pl
   where id = p_sync;
  return jsonb_build_object('locais', v_loc, 'setores', v_set, 'plantoes', v_pl);
end;
$$;

-- Fecha a execução. Com sucesso, apaga do período (e dos locais pedidos) os plantões que esta execução não viu:
-- foram apagados no Dr. Escala. Com erro, não apaga nada (a carga pode ter vindo pela metade).
create or replace function public.drescala_fechar_sync(p_sync uuid, p_ok boolean, p_erro text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s drescala_sincronizacoes; v_rem int := 0; v_furos int := 0;
begin
  select * into s from drescala_sincronizacoes where id = p_sync and status = 'executando';
  if not found then raise exception 'sync_invalida'; end if;

  if p_ok then
    delete from drescala_plantoes p
     where p.data between s.periodo_inicio and s.periodo_fim
       and (s.local_ids is null or p.local_id = any(s.local_ids))
       and p.ultima_sync is distinct from p_sync;
    get diagnostics v_rem = row_count;
    select count(*) into v_furos from drescala_plantoes p
     where p.ultima_sync = p_sync and p.furo;
  end if;

  update drescala_sincronizacoes
     set status = case when p_ok then 'ok' else 'erro' end, erro = p_erro, removidos = v_rem, furos = v_furos,
         concluido_em = now()
   where id = p_sync;
  return jsonb_build_object('removidos', v_rem, 'furos', v_furos);
end;
$$;

revoke all on function public.drescala_abrir_sync(uuid, date, date, bigint[]) from public, anon, authenticated;
revoke all on function public.drescala_gravar_lote(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.drescala_fechar_sync(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.drescala_abrir_sync(uuid, date, date, bigint[]) to service_role;
grant execute on function public.drescala_gravar_lote(uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.drescala_fechar_sync(uuid, boolean, text) to service_role;

-- Rotina nova na fila.
create or replace function public.rotina_pedir(p_tipo text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'authentication_required';
  end if;
  if p_tipo not in ('ping', 'lifeshub_lista', 'drescala_escalas') then
    raise exception 'rotina_desconhecida: %', p_tipo;
  end if;
  insert into rotina_pedidos (tipo, payload) values (p_tipo, coalesce(p_payload, '{}'::jsonb)) returning id into v_id;
  return v_id;
end;
$$;

-- ---- MCP dos sócios (sigma-mcp): token pessoal e trilha de auditoria ------------------------------

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null default 'Claude',
  token_hash text not null unique,       -- sha256 hex do token; o token em si só aparece uma vez para o dono
  prefixo text not null,                 -- 8 primeiros caracteres, para o dono reconhecer qual é
  criado_em timestamptz not null default now(),
  ultimo_uso_em timestamptz,
  revogado_em timestamptz
);
alter table public.mcp_tokens enable row level security;
drop policy if exists mcp_tokens_dono on public.mcp_tokens;
create policy mcp_tokens_dono on public.mcp_tokens for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists mcp_tokens_revogar on public.mcp_tokens;
create policy mcp_tokens_revogar on public.mcp_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Update só nas colunas de revogar/renomear: o dono não pode trocar o hash nem o user_id.
grant select on public.mcp_tokens to authenticated;
grant update (nome, revogado_em) on public.mcp_tokens to authenticated;
grant all on public.mcp_tokens to service_role;

create table if not exists public.mcp_chamadas (
  id bigint generated always as identity primary key,
  user_id uuid,
  token_id uuid references public.mcp_tokens(id) on delete set null,
  metodo text not null,
  ferramenta text,
  argumentos jsonb,
  ok boolean not null default true,
  erro text,
  duracao_ms int,
  criado_em timestamptz not null default now()
);
create index if not exists mcp_chamadas_user_idx on public.mcp_chamadas (user_id, criado_em desc);
alter table public.mcp_chamadas enable row level security;
drop policy if exists mcp_chamadas_ler on public.mcp_chamadas;
create policy mcp_chamadas_ler on public.mcp_chamadas for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
grant select on public.mcp_chamadas to authenticated;
grant all on public.mcp_chamadas to service_role;

-- O dono gera o próprio token (só quem tem papel liberado para o MCP). Devolve o token em claro uma única vez.
create or replace function public.mcp_gerar_token(p_nome text default 'Claude')
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'diretoria'::app_role)) then
    raise exception 'sem_permissao';
  end if;
  v_token := 'sgm_' || encode(gen_random_bytes(24), 'hex');
  insert into mcp_tokens (user_id, nome, token_hash, prefixo)
  values (auth.uid(), left(coalesce(nullif(trim(p_nome), ''), 'Claude'), 60), encode(digest(v_token, 'sha256'), 'hex'), left(v_token, 12));
  return v_token;
end;
$$;
revoke all on function public.mcp_gerar_token(text) from public, anon;
grant execute on function public.mcp_gerar_token(text) to authenticated;
