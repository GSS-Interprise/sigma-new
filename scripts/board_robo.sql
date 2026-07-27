-- =====================================================================
-- Board do robo: o kanban do PNCP ao lado do kanban da Effecti.
--
-- POR QUE: recall e cobertura medem se o edital CHEGOU. Nao medem se ele e
-- UTIL - se da pra ler, se o anexo abre, se vale disputar. Isso so quem
-- trabalha o edital sabe. Dois boards identicos deixam a equipe comparar as
-- FONTES com as maos, em vez de comparar planilha nossa.
--
-- POR QUE COLUNA E NAO TABELA SEPARADA: 12 tabelas penduram em licitacao_id
-- (anexos, descartes, itens, atividades, resultados, locks, proposta...).
-- Tabela gemea exigiria duplicar todas para ter "fluxo identico" - semanas de
-- trabalho e o dobro da manutencao do modulo mais usado, para sustentar um
-- experimento de 4-6 semanas. Como 15 das 20 queries do front vivem num
-- unico componente, o filtro entra em UM lugar.
--
-- O incidente que isto previne: em 24/07 o promotor escreveu 5 cards sem
-- nenhuma marca de board, e o kanban da equipe nao tinha o que filtrar -
-- apareceram no meio do trabalho da Sarah. Com board NOT NULL isso deixa de
-- ser possivel: todo card nasce declarando de que lado esta.
-- =====================================================================

alter table licitacoes
  add column if not exists board text not null default 'effecti';

-- Trava o dominio: 'robo' e 'effecti' e so. Sem isso um typo ('Robo',
-- 'pncp') criaria um terceiro board fantasma que nenhuma tela mostra - o
-- card sumiria sem erro, que e o modo de falha classico desta frente.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'licitacoes_board_check') then
    alter table licitacoes
      add constraint licitacoes_board_check check (board in ('effecti', 'robo'));
  end if;
end $$;

-- Todo acesso ao board filtra por esta coluna; e o primeiro predicado.
create index if not exists idx_licitacoes_board on licitacoes (board, status);

comment on column licitacoes.board is
  'De que board o card e: effecti (o que a equipe trabalha hoje) ou robo (o '
  'espelho PNCP, em validacao). NOT NULL de proposito - card sem board '
  'declarado foi o que vazou robo pro kanban da equipe em 24/07.';

-- =====================================================================
-- Promotor: espelho -> card no board do robo.
--
-- Roda SOB DEMANDA (o Raul liga o cron depois de ver a tela funcionando).
-- Escreve exclusivamente com board='robo'; nao existe caminho neste codigo
-- que produza card no board da Effecti.
-- =====================================================================
create or replace function promover_pncp_para_board_robo(
  p_limite     int default 5,
  p_score_min  int default 5
) returns TABLE (promovidos int, ja_existiam int) language plpgsql
security definer set search_path to 'public' as $$
declare
  v_promovidos int := 0;
  v_ja int := 0;
begin
  with candidatos as (
    select m.*
      from pncp_mirror m
     where m.portal = 'pncp'
       and m.score_gss >= p_score_min
       and m.modalidade_id <> 9                        -- inexigibilidade: ja decidida
       and m.data_encerramento_proposta > now()        -- so o que da pra disputar
       and not exists (
             select 1 from licitacoes l
              where l.board = 'robo'
                and l.licitacao_codigo = m.numero_controle_pncp)
     order by m.score_gss desc, m.data_publicacao desc
     limit p_limite
  ), inseridos as (
    insert into licitacoes (
      board, fonte, licitacao_codigo, numero_edital, orgao, objeto, titulo,
      municipio_uf, valor_estimado, data_disputa, tipo_modalidade,
      cnpj_orgao, etiquetas
    )
    select 'robo', 'PNCP',
           c.numero_controle_pncp,
           coalesce(nullif(c.raw->>'numeroCompra', ''), c.numero_controle_pncp),
           coalesce(nullif(c.orgao_razao_social, ''), 'Nao informado'),
           coalesce(nullif(c.objeto_compra, ''), 'Sem objeto'),
           coalesce(nullif(c.objeto_compra, ''), 'Sem objeto'),
           nullif(concat_ws(' - ', c.municipio, c.uf), ' - '),
           c.valor_estimado,
           c.data_encerramento_proposta,
           c.modalidade_nome,
           c.cnpj_orgao,
           array['PNCP']
      from candidatos c
    returning 1
  )
  select count(*) into v_promovidos from inseridos;

  select count(*) into v_ja
    from licitacoes where board = 'robo';

  return query select v_promovidos, v_ja;
end $$;

grant execute on function promover_pncp_para_board_robo(int, int) to authenticated, service_role;

comment on function promover_pncp_para_board_robo(int, int) is
  'Promove editais do espelho PNCP para o board do robo. Nunca escreve no '
  'board da Effecti. Dedup por licitacao_codigo = numero_controle_pncp.';
