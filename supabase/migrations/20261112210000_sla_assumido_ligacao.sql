-- Laudo assumido pela tecla 1 na ligação de alerta (sla-voz).
alter table public.sla_exames drop constraint if exists sla_exames_assumido_via_check;
alter table public.sla_exames add constraint sla_exames_assumido_via_check check (assumido_via in ('whatsapp', 'sigma', 'ligacao'));
