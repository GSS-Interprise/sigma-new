-- SLA de laudos: estação parada avisa também por WhatsApp (antes só e-mail; o fim de semana de 19 a 22/11 passou em
-- branco) e lembra a cada 3 h enquanto continua parada. CEPON entra como segunda unidade (PC da Brenda).
alter table public.sla_coletor_quedas add column if not exists whatsapp_em timestamptz;

-- Quem recebe o WhatsApp da estação: JSON [{nome, fone}]. Vazio = vai para sla_teste_destino (o Raul).
insert into public.config_lista_items (campo_nome, valor)
select 'sla_estacao_destinos', '[]'
where not exists (select 1 from public.config_lista_items where campo_nome = 'sla_estacao_destinos');
