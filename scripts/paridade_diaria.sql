-- =====================================================================
-- paridade_diaria - o placar que autoriza (ou nao) cortar a Effecti.
--
-- O criterio combinado: 21 dias corridos sem NENHUMA licitacao que a equipe
-- manteria e o robo nao achou. Este arquivo e o instrumento que mede isso
-- todo dia, sem ninguem precisar conferir na mao.
--
-- A pergunta NAO e "o robo achou tudo que a Effecti mandou?" - a Effecti
-- entrega 72% de lixo (110 de 153 descartados pela equipe), entao perder
-- lixo e ganho, nao perda. A pergunta certa e:
--
--     de tudo que a equipe MANTEVE, o que o robo teria perdido?
--
-- Por isso o universo aqui e "card da Effecti que a equipe NAO descartou".
--
-- E separa DOIS tipos de falha, que pedem consertos opostos:
--   NAO_CAPTUROU  o edital nem existe no espelho -> falha de COBERTURA,
--                 pede fonte nova (portal fora do PNCP) ou varredura mais larga
--   SCORE_BAIXO   o edital esta no espelho mas o classificador o descartou ->
--                 falha de CLASSIFICACAO, pede ajuste de regex
-- Somar os dois num numero so esconderia qual conserto fazer.
--
-- CHAVE DE CASAMENTO (medida em 27/07, nao re-derivar):
--   ancora em NUMERO + ANO + UF; municipio so corrobora.
--   Municipio sozinho tem 7,7% de ruido (44 divergencias em 572): o titulo
--   traz consorcio (CISSUL, CONISA), nome de estado ou texto truncado. O
--   IBGE valida a coluna municipio_uf em 44/44 e o titulo em so 23/44.
--   numeroCompra chega com ate 24 digitos - comparar como TEXTO sem zeros
--   a esquerda; bigint estoura.
-- =====================================================================

-- O join precisa desta expressao dos dois lados; sem indice, varrer 496k
-- linhas normalizando numeroCompra a cada consulta estoura o statement timeout.
create index if not exists idx_pncp_mirror_chave_paridade
  on pncp_mirror (
    uf, ano,
    (nullif(ltrim(regexp_replace(coalesce(raw->>'numeroCompra', ''), '[^0-9]', '', 'g'), '0'), ''))
  );

-- Lado Effecti: o que a equipe recebeu e NAO descartou.
create or replace view paridade_universo as
with base as (
  select l.id, l.titulo, l.municipio_uf, l.created_at,
         upper(trim(split_part(l.municipio_uf, ' - ', 2)))               uf,
         upper(imm_unaccent(trim(split_part(l.municipio_uf, ' - ', 1)))) municipio,
         -- tolera numero composto: "002/2026/FMS/SEMSA/2026", "06/2026-CR/2026"
         (regexp_match(l.titulo, '^[A-Za-z]+ *([0-9]+)/([0-9]{2,4})'))   g
    from licitacoes l
   where l.fonte = 'n8n'
     and not exists (select 1 from licitacao_descartes d where d.licitacao_id = l.id)
)
select id, titulo, municipio_uf, created_at, uf, municipio,
       nullif(ltrim(g[1], '0'), '') numero,
       (case when length(g[2]) = 2 then '20' || g[2] else g[2] end)::int ano
  from base
 where g is not null and uf ~ '^[A-Z]{2}$';

grant select on paridade_universo to authenticated, service_role;

-- Veredito por edital: o robo teria pego?
create or replace view paridade_veredito as
select u.id, u.titulo, u.municipio_uf, u.created_at::date dia,
       m.numero_controle_pncp, m.score_gss,
       -- corroboracao: o municipio bate? (nao decide o casamento, so sinaliza
       -- confianca - 4% dos casos sao ambiguos e nao tem terceira fonte)
       (m.numero_controle_pncp is not null
        and upper(imm_unaccent(coalesce(m.municipio, ''))) = u.municipio) municipio_confere,
       case
         when m.numero_controle_pncp is null then 'NAO_CAPTUROU'
         when coalesce(m.score_gss, 0) < 3    then 'SCORE_BAIXO'
         else 'PEGOU'
       end veredito
  from paridade_universo u
  left join lateral (
    select m2.numero_controle_pncp, m2.score_gss, m2.municipio
      from pncp_mirror m2
     where m2.uf = u.uf
       and m2.ano = u.ano
       and nullif(ltrim(regexp_replace(coalesce(m2.raw->>'numeroCompra', ''), '[^0-9]', '', 'g'), '0'), '') = u.numero
     order by (upper(imm_unaccent(coalesce(m2.municipio, ''))) = u.municipio) desc,
              m2.capturado_em desc
     limit 1
  ) m on true;

grant select on paridade_veredito to authenticated, service_role;

-- O placar diario. E esta view que responde "ja posso cortar?".
create or replace view paridade_diaria as
select dia,
       count(*)                                          mantidos_pela_equipe,
       count(*) filter (where veredito = 'PEGOU')        robo_pegou,
       count(*) filter (where veredito = 'SCORE_BAIXO')  falha_classificacao,
       count(*) filter (where veredito = 'NAO_CAPTUROU') falha_cobertura,
       round(100.0 * count(*) filter (where veredito = 'PEGOU')
             / nullif(count(*), 0), 1)                   pct_recall,
       -- o dia so "passa" se o robo nao perdeu NADA que a equipe manteve
       (count(*) filter (where veredito <> 'PEGOU') = 0) dia_limpo
  from paridade_veredito
 group by dia
 order by dia desc;

grant select on paridade_diaria to authenticated, service_role;

comment on view paridade_diaria is
  'Placar diario robo x Effecti sobre o que a equipe MANTEVE (descarte nao '
  'conta - a Effecti entrega 72% de lixo). dia_limpo = robo nao perdeu nada '
  'naquele dia. Criterio de corte: 21 dias corridos limpos + a perna de '
  'consumo da decisao 35.';

-- Responde direto: "quantos dias limpos seguidos ate hoje?"
create or replace function paridade_streak()
returns table (dias_limpos_seguidos int, ultimo_dia_sujo date, faltam_para_21 int)
language sql stable set search_path to 'public' as $$
  with d as (
    select dia, dia_limpo from paridade_diaria where dia <= current_date
  ), sujo as (
    select max(dia) dia from d where not dia_limpo
  )
  select
    (select count(*)::int from d, sujo
      where d.dia > coalesce(sujo.dia, date '1900-01-01')),
    (select dia from sujo),
    greatest(0, 21 - (select count(*)::int from d, sujo
      where d.dia > coalesce(sujo.dia, date '1900-01-01')))
$$;

grant execute on function paridade_streak() to authenticated, service_role;
