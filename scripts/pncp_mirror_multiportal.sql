-- =====================================================================
-- Espelho passa a aceitar MAIS DE UMA FONTE.
--
-- POR QUE: a validacao mostrou que ~99% do que a Effecti entrega esta no
-- PNCP, mas sobra uma cauda de municipios que publicam SO em portal
-- privado (confirmados ao vivo: Santana dos Garrotes/PB e Arenapolis/MT).
-- E' a cauda que ainda justifica pagar a Effecti. O BLL Compras e' um
-- desses portais - e aparece como etiqueta nos proprios cards da Effecti.
--
-- O espelho hoje e' PNCP-only por construcao (a PK e' numero_controle_pncp).
-- Com a coluna `portal`, todo o resto - score_gss, trigger, triagem,
-- comparativo, promote - passa a funcionar para qualquer fonte sem mudanca.
--
-- Registro do que ja foi verificado ao vivo em 25/07 (nao repetir o teste):
--   BLL Compras  HTTP 200, listagem publica de 100 editais, SEM auth. Traz
--                orgao, numero, modalidade, MUNICIPIO-UF, situacao e datas;
--                o objeto so' vem na pagina de detalhe (ProcessView).
--   SEBRAE       HTTP 200, ~250 editais em JSON. Sistema S: nao compra
--                servico medico municipal. Baixa relevancia p/ GSS.
--   FIEP         HTTP 403 hoje (a doc do repo de referencia dizia publico -
--                mudou). SESI/SENAI PR. Baixa relevancia.
--   ComprasNet   redundante com o PNCP por forca da Lei 14.133/2021.
-- Conclusao: so' o BLL vale o esforco agora.
-- =====================================================================

alter table pncp_mirror
  add column if not exists portal text not null default 'pncp';

-- consultas filtram por portal o tempo todo; e' seletivo o suficiente
create index if not exists idx_pncp_mirror_portal on pncp_mirror (portal);

-- score + portal juntos: e' o acesso da triagem e do comparativo
create index if not exists idx_pncp_mirror_portal_score
  on pncp_mirror (portal, score_gss) where score_gss >= 3;

comment on column pncp_mirror.portal is
  'Fonte do registro: pncp (padrao) | bll | outro portal. numero_controle_pncp '
  'guarda a chave natural da fonte - no PNCP e o controle oficial, em portal '
  'externo e um id sintetico prefixado (ex.: bll:<token>).';
