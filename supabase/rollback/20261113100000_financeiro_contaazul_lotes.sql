-- Desfaz 20261113100000_financeiro_contaazul_lotes.sql. Apaga o histórico de lotes gravado desde então;
-- a edge financeiro-conta-azul só registra o erro no log e o lançamento segue funcionando.
drop table if exists public.financeiro_contaazul_lotes;
