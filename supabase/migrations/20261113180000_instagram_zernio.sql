-- Instagram assistido + respostas no Sigma pelo Zernio (docs/arquitetura/linkedin-instagram-campanha.md, Instagram).
-- A primeira mensagem é enviada à mão pela equipe, no app do Instagram (a API da Meta não deixa a empresa escrever
-- primeiro). Quando o médico responde, a edge instagram-zernio traz a conversa para cá e a equipe responde do Sigma
-- dentro da janela de 24 h da Meta.
-- PRIVACIDADE: a conta do Zernio é o Instagram pessoal do Dr. Maikon (@maikonmadeira), que também conversa com
-- pacientes. Só entra aqui conversa com médico que está numa campanha e recebeu toque de Instagram pela fila; o resto
-- da caixa nunca é gravado. Por isso não há webhook: a edge consulta a lista e filtra pelo @ antes de gravar.

create table if not exists public.instagram_conversas (
  zernio_conversation_id text primary key,
  zernio_account_id text not null,
  lead_id uuid not null references public.leads (id) on delete cascade,
  campanha_lead_id uuid references public.campanha_leads (id) on delete set null,
  handle text not null,
  ultima_do_medico_em timestamptz,      -- abre a janela de 24 h para responder
  ultima_mensagem_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists instagram_conversas_lead on public.instagram_conversas (lead_id);

create table if not exists public.instagram_mensagens (
  id uuid primary key default gen_random_uuid(),
  zernio_conversation_id text not null references public.instagram_conversas (zernio_conversation_id) on delete cascade,
  zernio_message_id text unique,
  lead_id uuid not null references public.leads (id) on delete cascade,
  direcao text not null check (direcao in ('recebida', 'enviada')),
  texto text not null default '',
  tipo text not null default 'texto',
  enviado_por uuid,                    -- quem respondeu pelo Sigma (nulo = veio do app do Instagram)
  enviado_em timestamptz not null default now()
);
create index if not exists instagram_mensagens_lead on public.instagram_mensagens (lead_id, enviado_em);

-- Ponto de partida da próxima consulta (a lista do Zernio vem da mais recente para a mais antiga).
create table if not exists public.instagram_sync (
  id int primary key default 1 check (id = 1),
  ate timestamptz,
  rodou_em timestamptz,
  erro text
);
insert into public.instagram_sync (id) values (1) on conflict do nothing;

alter table public.instagram_conversas enable row level security;
alter table public.instagram_mensagens enable row level security;
alter table public.instagram_sync enable row level security;
drop policy if exists instagram_conversas_ler on public.instagram_conversas;
create policy instagram_conversas_ler on public.instagram_conversas for select to authenticated using (true);
drop policy if exists instagram_mensagens_ler on public.instagram_mensagens;
create policy instagram_mensagens_ler on public.instagram_mensagens for select to authenticated using (true);
grant select on public.instagram_conversas, public.instagram_mensagens to authenticated;
grant all on public.instagram_conversas, public.instagram_mensagens, public.instagram_sync to service_role;

-- Consulta a cada 3 minutos.
select cron.unschedule(jobname) from cron.job where jobname = 'instagram-zernio-sync';
select cron.schedule('instagram-zernio-sync', '*/3 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/instagram-zernio',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"action":"sincronizar"}'::jsonb, timeout_milliseconds := 60000);
$$);
