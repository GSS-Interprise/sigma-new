-- =====================================================================
-- municipios_ibge — dicionário canônico de municípios (fonte: IBGE).
--
-- POR QUE EXISTE: nomes de município que chegam de terceiros (Effecti,
-- e futuramente qualquer cliente novo) vêm sujos — acento inconsistente,
-- pontuação ("Xangri lá" vs "Xangri-Lá"), estado por extenso, e caractere
-- comido por encoding quebrado ("ão rancisco" = São Francisco). Casar
-- string↔string gera falso "ausente", que polui justamente o número que
-- decide o corte da Effecti. Resolvemos tudo contra código IBGE — que o
-- pncp_mirror já tem em 100% das linhas — e casamos por inteiro.
-- =====================================================================

-- unaccent() é STABLE, não IMMUTABLE → não pode ser usada em coluna
-- gerada. A forma de 2 args (dicionário explícito) é IMMUTABLE.
create or replace function imm_unaccent(text)
returns text language sql immutable strict parallel safe as
$$ select public.unaccent('public.unaccent', $1) $$;

create table if not exists municipios_ibge (
  codigo_ibge integer primary key,
  nome        text not null,
  uf          text not null,
  nome_norm   text generated always as (
    regexp_replace(lower(imm_unaccent(nome)), '[^a-z0-9]', '', 'g')
  ) stored
);

-- tabela criada por SQL direto não herda GRANT default → sem isto as
-- edges estouram 42501 em runtime.
grant select on municipios_ibge to authenticated, service_role;

create index if not exists idx_municipios_ibge_norm     on municipios_ibge (nome_norm);
create index if not exists idx_municipios_ibge_uf       on municipios_ibge (uf);
create index if not exists idx_municipios_ibge_trgm     on municipios_ibge using gin (nome_norm gin_trgm_ops);
