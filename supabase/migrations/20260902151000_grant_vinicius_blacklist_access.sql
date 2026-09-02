-- O gestor de captação já possui as permissões de disparos no RBAC,
-- mas manter o acesso à Black List explícito evita que a UI dependa
-- exclusivamente do papel agregado durante a sessão do usuário.
insert into public.captacao_permissoes_usuario (user_id, pode_blacklist)
select p.id, true
from public.profiles p
where lower(p.email) = lower('vinicius.salomao@gestaoservicosaude.com.br')
on conflict (user_id) do update
set pode_blacklist = true,
    updated_at = now();
