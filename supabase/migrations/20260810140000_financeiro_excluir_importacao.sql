-- 10/08 — "é bom podermos excluir uma importação" (Mavi).
-- Apagar a importação precisa levar junto o registro no log, senão o arquivo continua
-- marcado como já importado. O log só tinha política de leitura.

drop policy if exists "fin import log rw" on public.financeiro_import_log;
create policy "fin import log rw" on public.financeiro_import_log
  for all to authenticated
  using (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'gestor_financeiro'::app_role))
  with check (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'gestor_financeiro'::app_role));

grant select, insert, update, delete on public.financeiro_import_log to authenticated, service_role;
