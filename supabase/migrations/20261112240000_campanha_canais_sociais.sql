-- Fase 9 (LinkedIn e Instagram na campanha): modelo. Desenho: docs/arquitetura/linkedin-instagram-campanha.md.
-- Nada de sessão de LinkedIn aqui: a sessão fica só no gateway (cifrada); o Sigma guarda id e situação da conta.

alter table public.leads add column if not exists linkedin_url text;
alter table public.leads add column if not exists instagram_handle text;
-- confiança da busca automática de perfil (find_person do gateway, 0-100); null = cadastrado à mão
alter table public.leads add column if not exists linkedin_confianca int;

-- Canais da campanha. campanhas.canal (enum, um só) continua para o que já existe; canais é a lista nova.
alter table public.campanhas add column if not exists canais text[];
update public.campanhas set canais = array[canal::text] where canais is null and canal is not null;

-- Cada ação por canal num lead da campanha (o "toque"). Sugerido pela fila, feito pela pessoa ou pelo gateway.
create table if not exists public.campanha_toques (
  id uuid primary key default gen_random_uuid(),
  campanha_lead_id uuid not null references public.campanha_leads (id) on delete cascade,
  canal text not null check (canal in ('whatsapp', 'email', 'linkedin', 'instagram')),
  tipo text not null check (tipo in ('conexao', 'mensagem', 'seguir', 'dm', 'email', 'whatsapp', 'curtir')),
  status text not null default 'sugerido' check (status in ('sugerido', 'feito', 'respondido', 'falhou', 'pulado')),
  texto_sugerido text,
  url_perfil text,
  modo text not null default 'assistido' check (modo in ('assistido', 'automatico')),
  sugerido_para uuid,
  executado_por uuid,
  executado_em timestamptz,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists campanha_toques_cl on public.campanha_toques (campanha_lead_id, canal);
create index if not exists campanha_toques_fila on public.campanha_toques (status, sugerido_para, criado_em) where status = 'sugerido';

-- Contas de LinkedIn conectadas pelo Sigma (pessoa da GSS). Sessão NÃO fica aqui.
create table if not exists public.linkedin_contas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  gateway_account_id text unique,
  nome_perfil text,
  url_perfil text,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'conectada', 'pausada', 'reconectar', 'desconectada')),
  motivo text,
  ip_reservado text,
  convites_dia_max int not null default 5,
  convites_semana_max int not null default 80,
  conectada_em timestamptz,
  atualizado_em timestamptz not null default now()
);

alter table public.campanha_toques enable row level security;
alter table public.linkedin_contas enable row level security;
-- mesmo critério de campanha_leads (equipe logada opera as campanhas)
drop policy if exists campanha_toques_equipe on public.campanha_toques;
create policy campanha_toques_equipe on public.campanha_toques for all to authenticated using (true) with check (true);
-- conta de LinkedIn: a pessoa vê a própria; admin vê todas
drop policy if exists linkedin_contas_ver on public.linkedin_contas;
create policy linkedin_contas_ver on public.linkedin_contas for select to authenticated
  using (usuario_id = auth.uid() or coalesce(is_admin(auth.uid()), false));
-- Tabela criada por SQL não ganha GRANT sozinha (incidente 18/05).
grant select, insert, update, delete on public.campanha_toques to authenticated;
grant select on public.linkedin_contas to authenticated;
grant all on public.campanha_toques, public.linkedin_contas to service_role;
