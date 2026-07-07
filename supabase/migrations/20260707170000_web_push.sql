-- Web Push (07/07): notificações do sistema no celular (via navegador) pras mensagens
-- de canal e notificações do sistema. Guarda as inscrições push por dispositivo e
-- dispara a edge send-web-push por trigger quando nasce uma notificação.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_sub_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subs" on public.push_subscriptions;
create policy "own push subs" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated, service_role;

-- Notificação do sistema (kanban, financeiro, etc.) → push
create or replace function public.tg_web_push_system() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-web-push',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'), 'Content-Type', 'application/json'),
    body := jsonb_build_object('user_ids', jsonb_build_array(NEW.user_id), 'title', coalesce(NEW.titulo, 'Sigma - GSS'), 'body', coalesce(NEW.mensagem, ''), 'url', coalesce(NEW.link, '/'))
  );
  return NEW;
exception when others then return NEW; -- push nunca deve quebrar a inserção
end $$;

drop trigger if exists trg_web_push_system on public.system_notifications;
create trigger trg_web_push_system after insert on public.system_notifications
  for each row execute function public.tg_web_push_system();

-- Notificação de mensagem de canal → push (busca texto/autor/canal)
create or replace function public.tg_web_push_comunicacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_msg text; v_nome text; v_canal text;
begin
  select m.mensagem, m.user_nome into v_msg, v_nome from public.comunicacao_mensagens m where m.id = NEW.mensagem_id;
  select c.nome into v_canal from public.comunicacao_canais c where c.id = NEW.canal_id;
  perform net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-web-push',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'), 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'user_ids', jsonb_build_array(NEW.user_id),
      'title', 'Nova mensagem em #' || coalesce(v_canal, 'Canal'),
      'body', coalesce(v_nome || ': ', '') || left(coalesce(v_msg, ''), 120),
      'url', '/comunicacao?canal=' || NEW.canal_id,
      'tag', 'canal-' || NEW.canal_id
    )
  );
  return NEW;
exception when others then return NEW;
end $$;

drop trigger if exists trg_web_push_comunicacao on public.comunicacao_notificacoes;
create trigger trg_web_push_comunicacao after insert on public.comunicacao_notificacoes
  for each row execute function public.tg_web_push_comunicacao();
