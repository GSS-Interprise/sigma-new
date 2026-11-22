-- Assinatura do webhook da Chakra em modo de observação (22/11/2026). O chakra-webhook confere o cabeçalho
-- x-chakra-signature-256 contra o CHAKRA_WEBHOOK_SECRET e conta aqui o resultado, sem recusar nada, até a contagem
-- provar que o segredo do painel da Chakra e o do Supabase são iguais. Depois liga CHAKRA_WEBHOOK_ENFORCE=1.
create table if not exists public.chakra_assinatura_obs (
  status text primary key check (status in ('ok', 'sem_cabecalho', 'diferente')),
  vezes bigint not null default 0,
  primeira timestamptz not null default now(),
  ultima timestamptz not null default now()
);
alter table public.chakra_assinatura_obs enable row level security;
grant all on public.chakra_assinatura_obs to service_role;

create or replace function public.chakra_assinatura_contar(p_status text) returns void
language sql security definer set search_path = public as $$
  insert into chakra_assinatura_obs (status, vezes) values (p_status, 1)
  on conflict (status) do update set vezes = chakra_assinatura_obs.vezes + 1, ultima = now();
$$;
revoke all on function public.chakra_assinatura_contar(text) from public, anon, authenticated;
grant execute on function public.chakra_assinatura_contar(text) to service_role;
