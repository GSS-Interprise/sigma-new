-- =====================================================================
-- Paridade robo x Effecti - VERSAO 2, com a chave CERTA.
--
-- POR QUE A V1 ERRAVA: eu extraia so os digitos iniciais do numero e
-- comparava como INTEIRO. Isso destruia o dado:
--   card "CRE 012/2026"               -> espelho numeroCompra "012/2026"
--   card "CRE 002/2026/FMS/SEMSA/2026"-> espelho "002/2026/FMS/SEMSA"
-- O numero SEMPRE bateu; a normalizacao e que transformava "012/2026" em
-- 122026 e nunca casava. Tres medicoes erradas seguidas com essa causa
-- (recall reportado como 90,7%, depois 59,4%, depois 60%).
--
-- CHAVE CERTA: comparar o numero como TEXTO, por PREFIXO (a Effecti as vezes
-- concatena "/2026" no fim), ancorado em municipio + UF. Nunca como inteiro.
-- =====================================================================

-- Numero do edital como a Effecti escreve no titulo: tudo entre o prefixo de
-- modalidade e o " - Municipio/Estado" do fim.
create or replace function numero_do_titulo_effecti(p_titulo text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(
    -- tira o prefixo de modalidade (CRE, PE, DL, CONC, OUT, PP, CRED...)
    regexp_replace(
      -- tira o " - Municipio/Estado" do fim
      regexp_replace(coalesce(p_titulo, ''), '\s+-\s+[^/]+/[^/]+$', ''),
      '^[A-Za-z]+\s*', ''),
    '\s+', '', 'g')), '')
$$;

comment on function numero_do_titulo_effecti(text) is
  'Extrai o numero do edital do titulo da Effecti, preservando barras e '
  'sufixos (012/2026, 002/2026/FMS/SEMSA). NUNCA converter para inteiro - '
  'foi o que quebrou tres medicoes de recall.';

-- Universo: o que a equipe recebeu da Effecti e NAO descartou.
create or replace view paridade_universo_v2 as
select l.id, l.titulo, l.municipio_uf, l.created_at, l.objeto,
       upper(trim(split_part(l.municipio_uf, ' - ', 2)))               uf,
       upper(imm_unaccent(trim(split_part(l.municipio_uf, ' - ', 1)))) municipio,
       numero_do_titulo_effecti(l.titulo)                              numero
  from licitacoes l
 where l.board = 'effecti'
   and l.fonte = 'n8n'
   and not exists (select 1 from licitacao_descartes d where d.licitacao_id = l.id);

grant select on paridade_universo_v2 to authenticated, service_role;

-- Veredito por edital, com a chave nova.
create or replace view paridade_veredito_v2 as
select u.id, u.titulo, u.municipio_uf, u.created_at::date dia,
       m.numero_controle_pncp, m.score_gss,
       case
         when m.numero_controle_pncp is null then 'NAO_CAPTUROU'
         when coalesce(m.score_gss, 0) < 3    then 'SCORE_BAIXO'
         else 'PEGOU'
       end veredito
  from paridade_universo_v2 u
  left join lateral (
    select m2.numero_controle_pncp, m2.score_gss
      from pncp_mirror m2
     where m2.uf = u.uf
       and upper(imm_unaccent(coalesce(m2.municipio, ''))) = u.municipio
       -- numero como TEXTO, por prefixo nos dois sentidos: a Effecti as vezes
       -- concatena "/2026" e as vezes o PNCP e que traz o sufixo do processo
       and (
         upper(regexp_replace(coalesce(m2.raw->>'numeroCompra', ''), '\s+', '', 'g')) = u.numero
         or upper(regexp_replace(coalesce(m2.raw->>'numeroCompra', ''), '\s+', '', 'g')) like u.numero || '%'
         or u.numero like upper(regexp_replace(coalesce(m2.raw->>'numeroCompra', ''), '\s+', '', 'g')) || '%'
       )
     order by m2.capturado_em desc
     limit 1
  ) m on true
 where u.numero is not null and u.uf ~ '^[A-Z]{2}$';

grant select on paridade_veredito_v2 to authenticated, service_role;

-- Placar diario.
create or replace view paridade_diaria_v2 as
select dia,
       count(*)                                          mantidos_pela_equipe,
       count(*) filter (where veredito = 'PEGOU')        robo_pegou,
       count(*) filter (where veredito = 'SCORE_BAIXO')  falha_classificacao,
       count(*) filter (where veredito = 'NAO_CAPTUROU') falha_cobertura,
       round(100.0 * count(*) filter (where veredito = 'PEGOU')
             / nullif(count(*), 0), 1)                   pct_recall,
       (count(*) filter (where veredito <> 'PEGOU') = 0) dia_limpo
  from paridade_veredito_v2
 group by dia
 order by dia desc;

grant select on paridade_diaria_v2 to authenticated, service_role;

comment on view paridade_diaria_v2 is
  'Placar diario robo x Effecti sobre o que a equipe MANTEVE. Chave de '
  'casamento por numero-como-texto + municipio + UF (a v1 comparava como '
  'inteiro e errava 3 em cada 10).';
