-- Robô do Sigma (assistente de IA) só para uma lista nominal (docs/arquitetura/assistente-ia-sigma.md, 24/11/2026).
-- Por que lista e não papel: entre os admins do banco há gente desligada ou que não deve ver o robô ainda (Ewerton,
-- Frederico). A edge sigma-assistente recusa (403) quem não está aqui; o front nem mostra o robô nem o Ctrl+J.

create table if not exists public.assistente_liberados (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  criado_em timestamptz not null default now(),
  criado_por uuid
);

grant select on public.assistente_liberados to authenticated;
grant all on public.assistente_liberados to service_role;
alter table public.assistente_liberados enable row level security;

-- Cada um sabe se ele mesmo está liberado; admin vê a lista toda. Escrita só pela RPC de admin abaixo.
drop policy if exists assistente_liberados_ler on public.assistente_liberados;
create policy assistente_liberados_ler on public.assistente_liberados for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- Lista inicial (24/11): Raul, Ramone, Maikon (as duas contas dele), Vinícius, Heron e João Vilela.
insert into public.assistente_liberados (user_id) values
  ('dd9e3c9f-ad54-4843-a686-0142ca997eac'), -- Raul Seixas
  ('a23cf841-d9f1-4131-905b-765d712c5f80'), -- Ramone Matos de Oliveira
  ('2e0c9567-8867-47d0-8314-d61278be30c3'), -- Maikon Lucian Madeira (gmail)
  ('658448a1-22f0-4194-880e-d5b832df0a4b'), -- Maikon Lucian Madeira (GSS)
  ('dc88e78d-a3d0-4adc-b716-a910cf5c2df1'), -- vinicius salomao
  ('4adda3cf-a777-492b-bdf7-eed66962fcd6'), -- Heron Zini
  ('47884f79-1583-4f41-9d0a-403388f42ec7')  -- João Vilela
on conflict (user_id) do nothing;

-- A pessoa logada vê o robô?
create or replace function public.assistente_liberado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from assistente_liberados where user_id = auth.uid());
$$;
grant execute on function public.assistente_liberado() to authenticated, service_role;

-- Configurações › Agente do Sigma: quem está liberado e quem dá para liberar (perfis ativos). Só admin.
create or replace function public.assistente_liberados_painel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'liberados', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome_completo, 'email', p.email) order by p.nome_completo, p.id)
      from assistente_liberados l join profiles p on p.id = l.user_id), '[]'::jsonb),
    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome_completo, 'email', p.email) order by p.nome_completo, p.id)
      from profiles p
      where p.status = 'ativo' and not exists (select 1 from assistente_liberados l where l.user_id = p.id)), '[]'::jsonb)
  );
end $$;
grant execute on function public.assistente_liberados_painel() to authenticated;

create or replace function public.assistente_definir_liberado(p_user_id uuid, p_liberado boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'sem_permissao'; end if;
  if p_liberado then
    insert into assistente_liberados (user_id, criado_por) values (p_user_id, auth.uid()) on conflict (user_id) do nothing;
  else
    delete from assistente_liberados where user_id = p_user_id;
  end if;
end $$;
grant execute on function public.assistente_definir_liberado(uuid, boolean) to authenticated;
