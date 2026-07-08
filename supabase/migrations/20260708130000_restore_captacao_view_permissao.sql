-- Fix (08/07): o módulo `captacao` sumiu da tabela `permissoes` no re-seed de 18/06
-- (migration 20260618165400 recriou bi/comunicacao/contratos/licitacoes/suporte mas NÃO
-- captacao). Isso derrubou o BI Prospec pra todos os gestor_captacao/lideres, porque a
-- RPC get_bi_prospec_dashboard exige has_permission(user,'captacao','view'). Restaura de
-- forma versionada pra não sumir num próximo re-seed. Idempotente.
insert into public.permissoes (modulo, acao, perfil, ativo)
select v.m, v.a, v.p::app_role, true
from (values ('captacao','view','gestor_captacao'), ('captacao','view','lideres')) as v(m, a, p)
where not exists (
  select 1 from public.permissoes x where x.modulo = v.m and x.acao = v.a and x.perfil = v.p::app_role
);
