-- Artes do e-mail marketing (06/10): imagens que entram no corpo do e-mail.
-- Bucket PÚBLICO de propósito — o Gmail/Outlook do médico precisa abrir a imagem sem login.
-- Só imagem, até 2 MB (imagem pesada derruba a entrega e demora no celular).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-artes', 'email-artes', true, 2097152, array['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "email artes leitura publica" on storage.objects;
create policy "email artes leitura publica" on storage.objects for select
  using (bucket_id = 'email-artes');

drop policy if exists "email artes envio" on storage.objects;
create policy "email artes envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'email-artes');

drop policy if exists "email artes exclusao" on storage.objects;
create policy "email artes exclusao" on storage.objects for delete to authenticated
  using (bucket_id = 'email-artes');
