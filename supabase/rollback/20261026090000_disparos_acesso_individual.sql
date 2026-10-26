-- Desfaz 20261026090000_disparos_acesso_individual.sql.
-- Rodar ANTES de reverter o front (o front trata a coluna ausente como "sem acesso individual").
-- Danilo não tinha registro de captação antes (snapshot de 03/04 em import_sql/), então volta a
-- não ter Chips & Instâncias. Brenda já tinha pode_seigzaps_config = true antes desta migration;
-- por isso a chave dela não é desligada aqui.
update public.captacao_permissoes_usuario c
set pode_seigzaps_config = false,
    updated_at = now()
from public.profiles p
where p.id = c.user_id
  and lower(p.email) = lower('danilo.souza@gestaoservicosaude.com.br');

alter table public.captacao_permissoes_usuario
  drop column if exists pode_acessar_disparos;
