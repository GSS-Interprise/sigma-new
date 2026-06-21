-- #4 do plano chips-antiban-estabilidade: view de saúde/capacidade dos chips.
-- Mostra por chip: estado real, fase, se é usável p/ disparo, há quanto tempo no
-- estado atual, última queda, quedas em 24h e health score. Base do painel.
create or replace view public.vw_chip_saude as
select c.id, c.nome, c.connection_state, c.pode_disparar, c.categoria_uso, c.provedor,
  cs.fase, c.updated_at as estado_desde,
  (c.connection_state='open' and cs.fase in ('pronto','producao') and coalesce(c.pode_disparar,false)) as usavel,
  (select max(l.created_at) from chip_auto_reconnect_log l where l.chip_id=c.id and l.action='needs_qr') as ultima_queda,
  (select count(*) from chip_auto_reconnect_log l where l.chip_id=c.id and l.action='needs_qr' and l.created_at>now()-interval '24 hours') as quedas_24h,
  public.chip_health_score(c.id) as health
from chips c left join chip_state cs on cs.chip_id=c.id
where c.status='ativo';
grant select on public.vw_chip_saude to authenticated, service_role, anon;
