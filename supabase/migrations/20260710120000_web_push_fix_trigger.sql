-- FIX web push: o trigger dependia de current_setting('app.settings.supabase_url') e
-- '...service_role_key', que NUNCA foram configurados no banco → o net.http_post falhava
-- e o EXCEPTION engolia o erro → a notificação push nunca saía (falha silenciosa).
--
-- Correção: usar a URL do projeto e o ANON key DIRETO na função. Ambos são PÚBLICOS
-- (o anon key já vive no front, em src/integrations/supabase/client.ts). A edge
-- send-web-push aceita o anon no Authorization (ela usa o service_role dela internamente),
-- então não é preciso expor o service_role em setting nenhum.

create or replace function public.tg_web_push_comunicacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_msg text; v_nome text; v_canal text;
begin
  select m.mensagem, m.user_nome into v_msg, v_nome from public.comunicacao_mensagens m where m.id = NEW.mensagem_id;
  select c.nome into v_canal from public.comunicacao_canais c where c.id = NEW.canal_id;
  perform net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/send-web-push',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cHNiZ3RvZW9peGZva3pranJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTQwODEsImV4cCI6MjA5MDczMDA4MX0.BKhpdlsDdH13j9pJYwZgvuOeBS10DDH5GehQ3efpqkw',
      'Content-Type', 'application/json'
    ),
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
