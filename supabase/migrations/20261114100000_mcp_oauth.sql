-- Claude dos sócios da GSS, T7 (docs/arquitetura/claude-socios-gss.md): login OAuth 2.1 no sigma-mcp.
-- O Claude.ai, o app do celular e o Claude Desktop só conectam MCP remoto por OAuth. A edge sigma-mcp faz o papel de
-- servidor de login: o Claude se registra sozinho (mcp_oauth_clientes), o sócio aprova na tela /conectar-claude do
-- Sigma (já logado), a edge grava um código de uso único (mcp_oauth_codigos) e troca por token de acesso + refresh.
-- O token OAuth mora na mesma mcp_tokens do token manual (T5): uma linha por conexão, revogar desliga as duas chaves.
-- Tudo guardado só como hash sha256; as tabelas novas são só da service_role (a edge), sem acesso pela API pública.

alter table public.mcp_tokens
  add column if not exists origem text not null default 'manual',
  add column if not exists client_id text,
  add column if not exists expira_em timestamptz,          -- null = token manual, não expira (revoga-se na tela)
  add column if not exists refresh_hash text unique,
  add column if not exists refresh_expira_em timestamptz;
do $$ begin
  alter table public.mcp_tokens add constraint mcp_tokens_origem_ck check (origem in ('manual', 'oauth'));
exception when duplicate_object then null; end $$;

-- O dono lê as próprias conexões, mas não os hashes (column grant: só as colunas que a tela mostra).
revoke select on public.mcp_tokens from authenticated;
grant select (id, user_id, nome, prefixo, criado_em, ultimo_uso_em, revogado_em, origem, client_id, expira_em, refresh_expira_em)
  on public.mcp_tokens to authenticated;

create table if not exists public.mcp_oauth_clientes (
  client_id text primary key,
  nome text not null,
  redirect_uris text[] not null,
  criado_em timestamptz not null default now(),
  ultimo_uso_em timestamptz
);
alter table public.mcp_oauth_clientes enable row level security;
grant all on public.mcp_oauth_clientes to service_role;

create table if not exists public.mcp_oauth_codigos (
  code_hash text primary key,
  client_id text not null references public.mcp_oauth_clientes(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  expira_em timestamptz not null,
  usado_em timestamptz,
  token_id uuid references public.mcp_tokens(id) on delete set null,  -- conexão criada com este código
  criado_em timestamptz not null default now()
);
create index if not exists mcp_oauth_codigos_expira_idx on public.mcp_oauth_codigos (expira_em);
alter table public.mcp_oauth_codigos enable row level security;
grant all on public.mcp_oauth_codigos to service_role;

-- Código usado de novo = alguém interceptou (RFC 6749 §4.1.2): a edge revoga a conexão que ele criou.
-- Limpeza: código vencido há mais de 1 dia não serve para nada.
do $$
begin
  perform cron.unschedule('mcp-oauth-limpeza') where exists (select 1 from cron.job where jobname = 'mcp-oauth-limpeza');
  perform cron.schedule('mcp-oauth-limpeza', '17 4 * * *', $c$
    delete from public.mcp_oauth_codigos where expira_em < now() - interval '1 day';
  $c$);
end $$;
