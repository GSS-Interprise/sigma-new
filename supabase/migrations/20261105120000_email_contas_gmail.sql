-- E-mail da campanha enviado pelas caixas Gmail da equipe (05/11).
-- A equipe já mandava cerca de 2.000 e-mails por dia por conta, à mão, pelo Google (mala direta).
-- Agora cada pessoa conecta o próprio Gmail uma vez e o Sigma divide a fila da campanha entre as
-- contas escolhidas, respeitando a cota de cada uma; cada envio fica gravado com a conta que enviou.
-- App OAuth "Interno" no Google Cloud da GSS (projeto sigma-gmail-513811, conta bi@): só contas
-- @gestaoservicosaude.com.br conectam, sem verificação do Google. Escopo: só gmail.send.

create table if not exists public.email_contas_gmail (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null unique,
  nome text,
  refresh_token text not null,          -- só service_role lê (sem grant para authenticated)
  status text not null default 'conectada' check (status in ('conectada', 'erro', 'desconectada')),
  erro text,
  -- abaixo dos 2.000/dia do Google Workspace: a cota conta também os e-mails normais da pessoa
  cota_diaria int not null default 1800 check (cota_diaria between 1 and 2000),
  pausada_ate timestamptz,              -- Google respondeu "cota esgotada": volta no dia seguinte
  ultimo_envio_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_contas_gmail_user_idx on public.email_contas_gmail (user_id);
alter table public.email_contas_gmail enable row level security;
revoke all on public.email_contas_gmail from public, anon, authenticated;
grant all on public.email_contas_gmail to service_role;

-- "state" do OAuth: liga a volta do Google ao usuário do Sigma que clicou em conectar
create table if not exists public.gmail_oauth_states (
  state text primary key,
  user_id uuid not null,
  volta text,
  created_at timestamptz not null default now()
);
alter table public.gmail_oauth_states enable row level security;
revoke all on public.gmail_oauth_states from public, anon, authenticated;
grant all on public.gmail_oauth_states to service_role;

alter table public.campanhas
  add column if not exists email_envio_via text not null default 'marketing',
  add column if not exists email_contas_gmail_ids uuid[] not null default '{}';
do $$ begin
  alter table public.campanhas add constraint campanhas_email_envio_via_chk check (email_envio_via in ('marketing', 'gmail'));
exception when duplicate_object then null; end $$;

alter table public.email_envios
  add column if not exists conta_gmail_id uuid references public.email_contas_gmail(id) on delete set null,
  add column if not exists gmail_message_id text;
create index if not exists email_envios_conta_gmail_dia_idx on public.email_envios (conta_gmail_id, enviado_em)
  where conta_gmail_id is not null;

-- Contas para a tela: sem o token, com quanto cada uma já enviou hoje (todas as campanhas somadas).
create or replace function public.email_contas_gmail_uso()
returns table (id uuid, user_id uuid, email text, nome text, status text, erro text,
               cota_diaria int, enviados_hoje int, pausada boolean, minha boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.user_id, c.email, c.nome, c.status, c.erro, c.cota_diaria,
    (select count(*)::int from email_envios e
      where e.conta_gmail_id = c.id
        and e.enviado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')),
    coalesce(c.pausada_ate > now(), false),
    c.user_id = auth.uid()
  from email_contas_gmail c
  where c.status <> 'desconectada' and auth.uid() is not null
  order by c.nome nulls last, c.email;
$$;
revoke all on function public.email_contas_gmail_uso() from public, anon;
grant execute on function public.email_contas_gmail_uso() to authenticated, service_role;
