-- Permissões operacionais combinadas na reunião com a equipe de captação:
-- Vinicius pode corrigir duplicidades e retirar contatos da blacklist sem
-- depender de um administrador a cada ajuste.

insert into public.captacao_permissoes_usuario (
  user_id,
  pode_leads,
  pode_blacklist
)
select p.id, true, true
from public.profiles p
where lower(p.email) = lower('vinicius.salomao@gestaoservicosaude.com.br')
on conflict (user_id) do update
set pode_leads = true,
    pode_blacklist = true,
    updated_at = now();

-- As políticas antigas de delete/update da blacklist só reconheciam
-- administradores/gestores, embora a UI já trabalhasse com a permissão de
-- captação. Removemos as variantes antigas para evitar que a regra fique
-- divergente entre ambientes e reaplicamos a mesma permissão em cada ação.
-- gestor_contratos continua podendo, como nas políticas antigas (27/10).
drop policy if exists "Authorized users can insert blacklist" on public.blacklist;
drop policy if exists "Authorized users can manage blacklist" on public.blacklist;
drop policy if exists "Admins and managers can update/delete blacklist" on public.blacklist;

create policy "Captacao users can insert blacklist"
  on public.blacklist
  for insert
  to authenticated
  with check ((public.has_captacao_permission(auth.uid(), 'blacklist') or public.has_role(auth.uid(), 'gestor_contratos'::app_role)));

create policy "Captacao users can update blacklist"
  on public.blacklist
  for update
  to authenticated
  using ((public.has_captacao_permission(auth.uid(), 'blacklist') or public.has_role(auth.uid(), 'gestor_contratos'::app_role)))
  with check ((public.has_captacao_permission(auth.uid(), 'blacklist') or public.has_role(auth.uid(), 'gestor_contratos'::app_role)));

create policy "Captacao users can delete blacklist"
  on public.blacklist
  for delete
  to authenticated
  using ((public.has_captacao_permission(auth.uid(), 'blacklist') or public.has_role(auth.uid(), 'gestor_contratos'::app_role)));

-- Agenda de escalonamento do teto diário. As chaves são datas em BRT e os
-- valores representam novos contatos (não mensagens de respostas da IA).
alter table public.campanhas
  add column if not exists limite_diario_programado jsonb not null default '{}'::jsonb;

comment on column public.campanhas.limite_diario_programado is
  'Mapa YYYY-MM-DD (BRT) -> limite diário de novos contatos. O processor usa a última etapa válida.';

-- (27/10) Removido o agendamento de setembro da campanha de Anestesiologia do SMO: aplicado
-- agora, a última etapa (500) passaria a valer na hora.
