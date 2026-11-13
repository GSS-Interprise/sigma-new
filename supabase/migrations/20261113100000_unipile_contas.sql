-- Fase 9.2: contas de LinkedIn (e depois Instagram) conectadas pela Unipile (Hosted Auth). Desenho:
-- docs/arquitetura/linkedin-instagram-campanha.md. A credencial fica só na Unipile; aqui só o account_id.

alter table public.linkedin_contas add column if not exists provedor text not null default 'linkedin'
  check (provedor in ('linkedin', 'instagram'));
alter table public.linkedin_contas add column if not exists produtos text[];
alter table public.linkedin_contas add column if not exists status_unipile text;
alter table public.linkedin_contas add column if not exists conectada_por uuid;
alter table public.linkedin_contas add column if not exists ultimo_evento_em timestamptz;
-- dono da conta no Sigma (usuario_id) precisa existir; uma pessoa pode ter LinkedIn e Instagram
create index if not exists linkedin_contas_usuario on public.linkedin_contas (usuario_id, provedor);

-- Log bruto dos eventos da Unipile (auditoria e reprocessamento). Mensagem e nova conexão entram aqui até a 9.5.
create table if not exists public.unipile_eventos (
  id text primary key,                 -- evt_xxx da Unipile (idempotência: a Unipile reenvia em falha)
  tipo text not null,
  account_id text,
  recebido_em timestamptz not null default now(),
  processado boolean not null default false,
  payload jsonb not null
);
create index if not exists unipile_eventos_tipo on public.unipile_eventos (tipo, recebido_em desc);
alter table public.unipile_eventos enable row level security;
-- só as edges (service_role) leem e escrevem; nenhuma policy para authenticated
grant all on public.unipile_eventos to service_role;
