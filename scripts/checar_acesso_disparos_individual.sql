-- Checagem (só leitura) da migration 20261026090000_disparos_acesso_individual.
-- Uma linha por usuário com a chave individual ligada, mais Danilo e Brenda mesmo se faltar algo.
-- Esperado: só Danilo e Brenda, abre_central_e_chips = chips_instancias = true, e false em
-- admin_monitor_webhook e perfil_disparos_modulo_inteiro. envio_zap/envio_email mostram o que cada
-- um já tinha antes (a migration não liga essas chaves e as telas de envio seguem fechadas para eles).
select
  p.nome_completo,
  p.email,
  coalesce((select string_agg(ur.role::text, ', ' order by ur.role::text)
            from public.user_roles ur where ur.user_id = p.id), '') as perfis,
  coalesce(c.pode_acessar_disparos, false) as abre_central_e_chips,
  public.has_captacao_permission(p.id, 'seigzaps_config') as chips_instancias,
  public.is_admin(p.id) as admin_monitor_webhook,
  exists (select 1 from public.user_roles ur
          join public.permissoes pe on pe.perfil = ur.role
          where ur.user_id = p.id and pe.modulo = 'disparos' and pe.acao = 'visualizar' and pe.ativo)
    as perfil_disparos_modulo_inteiro,
  public.has_captacao_permission(p.id, 'disparos_zap') as envio_zap,
  public.has_captacao_permission(p.id, 'disparos_email') as envio_email
from public.profiles p
left join public.captacao_permissoes_usuario c on c.user_id = p.id
where c.pode_acessar_disparos
   or lower(p.email) in ('danilo.souza@gestaoservicosaude.com.br', 'brenda.rezende@gestaoservicosaude.com.br')
order by p.nome_completo;
