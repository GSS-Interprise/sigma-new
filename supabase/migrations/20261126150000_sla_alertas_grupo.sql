-- Aviso agrupado do SLA (26/11/2026, Raul: "agrupa as mensagens por pessoa"). Vários exames para a mesma pessoa na
-- mesma rodada saem numa mensagem (modelo gss_sla_laudo_varios_v1) ou numa ligação. Cada exame continua com a sua
-- linha em sla_alertas (é o que impede repetir o passo); grupo liga as linhas que saíram juntas, para o botão
-- "Assumir laudos" e a tecla 1 da ligação assumirem todos.
alter table public.sla_alertas add column if not exists grupo uuid;
create index if not exists sla_alertas_grupo on public.sla_alertas (grupo) where grupo is not null;
