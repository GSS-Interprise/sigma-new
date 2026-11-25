-- Aviso "assumiu e o prazo venceu sem laudo" (Ramone, 25/11/2026): novo tipo de alerta do SLA de laudos.
-- Gravado pelo sla-alertas (avisarAssumidosVencidos), um por exame; papel "assumiu".
alter table public.sla_alertas drop constraint if exists sla_alertas_tipo_check;
alter table public.sla_alertas add constraint sla_alertas_tipo_check
  check (tipo = any (array['prazo', 'vencido', 'sem_escala', 'assumido_vencido']));
