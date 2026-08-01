-- Casamento por SEMELHANCA DE TEXTO, nao por numero.
--
-- Medido em 01/08 investigando os 15 "nao capturados": 9 estavam no espelho e
-- o que falhou foi o casamento. O numero do edital nao tem formato:
--   card "010/2026/2026" -> PNCP "CP010/2026"
--   card "8/2026"        -> PNCP "08"
--   card "002/2026"      -> PNCP "CREDENCIAMENTO No 002/2026 - SMS"
--   card "34/2026"       -> PNCP "PRI 21"
-- Nenhuma normalizacao cobre isso. Ja a similaridade do OBJETO achou os 9,
-- com confianca de 0,45 a 0,98.
--
-- Ancora em municipio + UF (barato e confiavel: o IBGE valida a coluna
-- municipio_uf em 44/44 casos) e escolhe o objeto mais parecido acima de
-- 0,35. Abaixo disso e ruido - medido: "servicos graficos" casou 0,42 com
-- "credenciamento de psicologos", entao o piso sozinho nao basta e o
-- resultado carrega a similaridade pra auditoria.
create or replace view paridade_veredito_v2 as
select u.id, u.titulo, u.municipio_uf, u.created_at::date dia,
       m.numero_controle_pncp, m.score_gss, m.sim,
       case
         when m.numero_controle_pncp is null then 'NAO_CAPTUROU'
         when coalesce(m.score_gss, 0) < 3    then 'SCORE_BAIXO'
         else 'PEGOU'
       end veredito
  from paridade_universo_v2 u
  left join lateral (
    select m2.numero_controle_pncp, m2.score_gss,
           round(similarity(lower(imm_unaccent(m2.objeto_compra)),
                            lower(imm_unaccent(coalesce(nullif(u.objeto,''), u.titulo))))::numeric, 2) sim
      from pncp_mirror m2
     where m2.uf = u.uf
       and upper(imm_unaccent(coalesce(m2.municipio, ''))) = u.municipio
       and m2.objeto_compra is not null
       and similarity(lower(imm_unaccent(m2.objeto_compra)),
                      lower(imm_unaccent(coalesce(nullif(u.objeto,''), u.titulo)))) >= 0.35
     order by similarity(lower(imm_unaccent(m2.objeto_compra)),
                         lower(imm_unaccent(coalesce(nullif(u.objeto,''), u.titulo)))) desc
     limit 1
  ) m on true
 where u.uf ~ '^[A-Z]{2}$' and coalesce(nullif(u.objeto,''), u.titulo) is not null;

-- Indice que torna a similaridade viavel no acervo de 522k.
create index if not exists idx_pncp_mirror_objeto_trgm
  on pncp_mirror using gin (lower(imm_unaccent(objeto_compra)) gin_trgm_ops);

-- LIMITE CONHECIDO: mesmo com o indice, a similaridade dentro do lateral
-- estoura o statement timeout da Management API em municipio grande (o
-- imm_unaccent roda por linha). A medicao de referencia esta em
-- scratchpad/recall_final.py, que traz os candidatos e compara fora do banco:
-- 61 cards contra 22.732 editais leva segundos.
