-- =====================================================================
-- Carga completa do board do robo.
--
-- DECISAO DO RAUL (01/08): jogar TODOS os editais que batem no padrao, nao
-- so os abertos. O argumento e de VOLUME - se o robo capta muito mais edital
-- bom que a Effecti, isso e ganho pra GSS, e o edital fechado tambem conta
-- pra demonstrar isso.
--
-- Levantei a ressalva (9.291 cards contra 1.469 da Effecti afogam a equipe)
-- e ele reafirmou. Fica registrado: o volume E o argumento.
--
-- Pre-requisito ja aplicado: useLicitacoesBI passou a filtrar board='effecti'.
-- Sem isso todo indicador da diretoria viraria robo - foi o que aconteceu no
-- CRM da AGES, 46% do dashboard.
-- =====================================================================

create or replace function promover_pncp_para_board_robo(
  p_limite     int default 5,
  p_score_min  int default 5,
  p_so_abertos boolean default true
) returns TABLE (promovidos int, total_no_board int) language plpgsql
security definer set search_path to 'public' as $$
declare
  v_promovidos int := 0;
  v_total int;
begin
  with candidatos as (
    select m.*
      from pncp_mirror m
     where m.portal = 'pncp'
       and m.score_gss >= p_score_min
       and m.modalidade_id <> 9                     -- inexigibilidade: ja decidida
       and (not p_so_abertos or m.data_encerramento_proposta > now())
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

  select count(*) into v_total from licitacoes where board = 'robo';
  return query select v_promovidos, v_total;
end $$;

grant execute on function promover_pncp_para_board_robo(int, int, boolean) to authenticated, service_role;
