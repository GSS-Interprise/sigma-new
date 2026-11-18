-- Deliberação (equipe de licitações GSS, 18/11): campo próprio no card para o Luiz registrar o que foi combinado
-- na reunião de deliberação (a reunião em que decidem sobre a licitação). Separado da Decorrência de Análise, que
-- é a análise do edital.
alter table public.licitacoes add column if not exists deliberacao text;
comment on column public.licitacoes.deliberacao is 'O que foi combinado na reunião de deliberação (HTML do editor rico).';
