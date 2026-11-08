-- Fase 5 do plano GSS dono no comando: fila de rotinas que a VPS da GSS executa
-- (consultas que precisam de navegador ou de sessão logada: Life's Hub, CNES, CFM).
-- O Sigma grava o pedido; o worker da VPS (vps/sigma-rotinas) pega pela edge rotinas-fila,
-- executa e devolve o resultado. A VPS nunca recebe a service role do Sigma.

create table if not exists public.rotina_pedidos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'executando', 'feito', 'erro')),
  resultado jsonb,
  erro text,
  tentativas int not null default 0,
  worker text,
  pedido_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz
);

create index if not exists rotina_pedidos_fila_idx on public.rotina_pedidos (status, criado_em);

alter table public.rotina_pedidos enable row level security;
drop policy if exists rotina_pedidos_ler on public.rotina_pedidos;
create policy rotina_pedidos_ler on public.rotina_pedidos for select to authenticated using (true);
grant select on public.rotina_pedidos to authenticated;
grant all on public.rotina_pedidos to service_role;

-- Tipos aceitos: cada rotina nova da VPS entra nesta lista.
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
  if p_tipo not in ('ping') then
    raise exception 'rotina_desconhecida: %', p_tipo;
  end if;
  insert into rotina_pedidos (tipo, payload) values (p_tipo, coalesce(p_payload, '{}'::jsonb)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.rotina_pedir(text, jsonb) from public, anon;
grant execute on function public.rotina_pedir(text, jsonb) to authenticated, service_role;

-- O worker pega até p_limite pedidos. Pedido preso em "executando" há mais de 10 min
-- (worker caiu no meio) volta para a fila; na 3ª tentativa vira erro.
create or replace function public.rotina_pegar(p_worker text, p_tipos text[], p_limite int default 1)
returns setof public.rotina_pedidos
language plpgsql
security definer
set search_path = public
as $$
begin
  update rotina_pedidos
     set status = case when tentativas >= 3 then 'erro' else 'pendente' end,
         erro = case when tentativas >= 3 then 'worker parou no meio 3 vezes' else erro end,
         concluido_em = case when tentativas >= 3 then now() else null end
   where status = 'executando' and iniciado_em < now() - interval '10 minutes';

  return query
  update rotina_pedidos r
     set status = 'executando', iniciado_em = now(), tentativas = r.tentativas + 1, worker = p_worker
   where r.id in (
     select id from rotina_pedidos
      where status = 'pendente' and tipo = any(p_tipos)
      order by criado_em
      limit greatest(1, least(p_limite, 10))
      for update skip locked)
  returning r.*;
end;
$$;
revoke all on function public.rotina_pegar(text, text[], int) from public, anon, authenticated;
grant execute on function public.rotina_pegar(text, text[], int) to service_role;

create or replace function public.rotina_concluir(p_id uuid, p_ok boolean, p_resultado jsonb, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update rotina_pedidos
     set status = case when p_ok then 'feito' else 'erro' end,
         resultado = p_resultado, erro = left(p_erro, 2000), concluido_em = now()
   where id = p_id and status = 'executando';
$$;
revoke all on function public.rotina_concluir(uuid, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.rotina_concluir(uuid, boolean, jsonb, text) to service_role;
