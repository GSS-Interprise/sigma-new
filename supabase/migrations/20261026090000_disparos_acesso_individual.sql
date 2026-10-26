-- Danilo e Brenda (gestor_radiologia) pediram em 26/10 acesso a "Disparos & Chips" para cadastrar
-- médicos; o Raul autorizou só os dois. A rota /disparos exige `disparos.visualizar` no PERFIL, e
-- liberar isso no gestor_radiologia abriria o módulo inteiro (Campanhas, Prospecção, Leads...) para
-- todo gestor de radiologia. Por isso a liberação é individual: uma chave nova na matriz de
-- permissões de captação que abre só a central /disparos e Chips & Instâncias (/disparos/config).
-- Chips & Instâncias continua exigindo `pode_seigzaps_config` (tela, RLS de chips e chakra-connect).
-- Não liga disparos_zap/email nem mexe nas demais chaves; Monitor e Webhook seguem só para admin.
-- Idempotente.
alter table public.captacao_permissoes_usuario
  add column if not exists pode_acessar_disparos boolean not null default false;

comment on column public.captacao_permissoes_usuario.pode_acessar_disparos is
  'Acesso individual à central /disparos e a Chips & Instâncias (/disparos/config) para quem não tem disparos.visualizar no perfil. Não libera as demais telas do módulo.';

insert into public.captacao_permissoes_usuario (user_id, pode_acessar_disparos, pode_seigzaps_config)
select p.id, true, true
from public.profiles p
where lower(p.email) in (
  lower('danilo.souza@gestaoservicosaude.com.br'),
  lower('brenda.rezende@gestaoservicosaude.com.br')
)
on conflict (user_id) do update
set pode_acessar_disparos = true,
    pode_seigzaps_config = true,
    updated_at = now();
