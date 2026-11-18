-- Bloquear um módulo para UMA pessoa (Bianca Santos, 18/11: "quero que vc tire os meus acessos e as notificações da
-- licitação do sigma"). A permissão de módulo no Sigma é por perfil (permissoes.perfil), e os perfis dela
-- (gestor_contratos, lideres) dão Licitações também a outras 9 pessoas; mexer no perfil tiraria de todos.
-- Então: uma lista de bloqueios por pessoa.
--   - usePermissions (front) tira o módulo bloqueado: some do menu e a rota recusa.
--   - Notificação do sino de tipo licitacao_* para quem tem Licitações bloqueado não é gravada (gatilho abaixo),
--     qualquer que seja a origem (gatilhos de licitação, edges de tarefa, alarme de captação).
-- O que NÃO muda: as políticas de RLS das tabelas de licitação continuam por perfil.

create table if not exists public.usuario_modulos_bloqueados (
  user_id uuid not null references auth.users (id) on delete cascade,
  modulo text not null,
  motivo text,
  criado_em timestamptz not null default now(),
  primary key (user_id, modulo)
);
alter table public.usuario_modulos_bloqueados enable row level security;
drop policy if exists usuario_modulos_bloqueados_ler on public.usuario_modulos_bloqueados;
create policy usuario_modulos_bloqueados_ler on public.usuario_modulos_bloqueados for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists usuario_modulos_bloqueados_admin on public.usuario_modulos_bloqueados;
create policy usuario_modulos_bloqueados_admin on public.usuario_modulos_bloqueados for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
grant select, insert, update, delete on public.usuario_modulos_bloqueados to authenticated;
grant all on public.usuario_modulos_bloqueados to service_role;

create or replace function public.fn_notificacao_respeita_bloqueio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo like 'licitac%' and exists (
    select 1 from public.usuario_modulos_bloqueados b where b.user_id = new.user_id and b.modulo = 'licitacoes'
  ) then
    return null; -- não grava
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificacao_respeita_bloqueio on public.system_notifications;
create trigger trg_notificacao_respeita_bloqueio before insert on public.system_notifications
  for each row execute function public.fn_notificacao_respeita_bloqueio();

insert into public.usuario_modulos_bloqueados (user_id, modulo, motivo)
values ('5fc86254-ee42-4afb-b9da-c143d68c5995', 'licitacoes', 'Pedido da Bianca Santos ao Raul em 17/11/2026')
on conflict do nothing;

-- As notificações de licitação que ela ainda não leu (cerca de 8 mil) saem do sino: marcadas como lidas, não apagadas.
update public.system_notifications set lida = true
 where user_id = '5fc86254-ee42-4afb-b9da-c143d68c5995' and tipo like 'licitac%' and not lida;
