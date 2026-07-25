-- =====================================================================
-- pncp_comparativo - alimenta a aba "PNCP x Effecti" do Sigma.
--
-- Responde de bate-pronto a pergunta do dono: "o robo pega tudo que a
-- Effecti pega?" e, mais importante para vender o projeto, "o que o robo
-- acha que a Effecti NAO acha?".
--
-- Tres baldes por edital na janela:
--   casado     - os dois viram (robo confirma a Effecti)
--   so_effecti - a Effecti trouxe e o robo nao pontuou. E o RISCO do corte.
--   so_pncp    - o robo achou e a Effecti nunca trouxe. E o GANHO do robo.
--
-- Casamento por (codigo_ibge, numero do edital). O numero do lado Effecti
-- sai do TITULO (o campo numero_edital guarda o id interno da Effecti, nao
-- o numero real do edital). Mesma regra do pncp_cobertura_medir, para os
-- dois numeros da tela nunca se contradizerem.
--
-- SQL 100% ASCII de proposito: a Management API corrompe literal acentuado
-- no transporte. Acento so' via imm_unaccent() em tempo de execucao.
-- =====================================================================

create or replace function pncp_comparativo(
  p_desde date default (current_date - 90),
  p_ate   date default current_date,
  p_score_min int default 3,
  p_so_abertas boolean default false,
  p_so_disputavel boolean default true
)
returns table (
  balde        text,
  ibge         text,
  municipio    text,
  uf           text,
  numero       text,
  objeto       text,
  modalidade   text,
  valor        numeric,
  encerramento timestamptz,
  score        int,
  link         text,
  card_id      uuid
)
language sql stable security definer set search_path to 'public' as $$
with ef as (
  -- lado Effecti: cards do captador n8n na janela
  select l.id, l.titulo, l.valor_estimado, l.data_disputa, l.status,
         nullif(trim(regexp_replace(coalesce(l.municipio_uf,''), '\s*[-/]\s*[A-Za-z]{2}$', '')), '') mun_campo,
         case when l.municipio_uf ~ '[-/]\s*[A-Za-z]{2}$' then upper(right(trim(l.municipio_uf),2)) end uf_campo,
         nullif(trim(split_part(regexp_replace(l.titulo,'^.* - ',''), '/', 1)), '') mun_tit,
         nullif(trim(split_part(regexp_replace(l.titulo,'^.* - ',''), '/', 2)), '') uf_tit,
         coalesce((regexp_match(l.titulo,'(\d+)\s*/\s*(\d{4})'))[1],
                  (regexp_match(l.titulo,'\y(\d{1,6})(20\d{2})\y'))[1],
                  (regexp_match(l.titulo,'\y[A-Za-z]{2,5}\s+(\d+)\y'))[1]) num_txt
    from licitacoes l
   where l.fonte = 'n8n'
     and coalesce(l.data_disputa::date, l.created_at::date) between p_desde and p_ate
),
ef_res as (
  -- cast blindado: titulo da Effecti as vezes traz numero colado de 13
  -- digitos (ex.: '14133211002026'), que estoura integer. So converte o
  -- que tem cara de numero de edital (<=6 digitos sem zero a esquerda).
  select ef.*,
         (select array_agg(distinct x) from unnest(array[rc.codigo_ibge, rt.codigo_ibge]) x where x is not null) ibges,
         case when regexp_replace(coalesce(num_txt,''), '^0+', '') ~ '^\d{1,6}$'
              then regexp_replace(num_txt, '^0+', '')::int end num
    from ef
    left join lateral resolve_municipio_ibge(ef.mun_campo, ef.uf_campo) rc on true
    left join lateral resolve_municipio_ibge(ef.mun_tit,   ef.uf_tit)   rt on true
),
pn as (
  -- lado PNCP: o que o classificador deterministico marcou como relevante
  -- A janela e' por data de DISPUTA nos dois lados (Effecti usa data_disputa),
  -- senao a comparacao mistura semanticas: edital publicado ha 60 dias com
  -- disputa amanha aparecia so' do lado Effecti e inflava o balde de risco.
  -- Quando o PNCP nao publica encerramento (~50% dos casos, concentrado em
  -- Inexigibilidade), cai pra data de publicacao.
  select m.numero_controle_pncp, m.codigo_ibge, m.municipio, m.uf, m.objeto_compra,
         m.modalidade_nome, m.valor_estimado, m.data_encerramento_proposta,
         m.score_gss, m.link_sistema_origem,
         case when regexp_replace(coalesce((regexp_match(coalesce(m.raw->>'numeroCompra',''),'(\d{1,6})'))[1],''), '^0+','') ~ '^\d{1,6}$'
              then regexp_replace((regexp_match(m.raw->>'numeroCompra','(\d{1,6})'))[1], '^0+','')::int end num
    from pncp_mirror m
   where m.score_gss >= p_score_min
     -- Com p_so_abertas o teto da janela vai pro futuro: uma licitacao ABERTA
     -- tem encerramento depois de hoje e ficaria fora de [desde, hoje].
     and coalesce(m.data_encerramento_proposta, m.data_publicacao)::date
         between p_desde and (case when p_so_abertas then p_ate + 365 else p_ate end)
     and (not p_so_abertas or m.data_encerramento_proposta > now())
     -- Inexigibilidade (9) = contratacao direta ja decidida. Vale como
     -- inteligencia de mercado, nao como oportunidade de disputa: 82% do
     -- que o filtro aprova cai aqui e afogaria a tela.
     and (not p_so_disputavel or m.modalidade_id <> 9)
),
-- casamento: mesmo municipio (IBGE) + mesmo numero de edital
casados as (
  select distinct pn.numero_controle_pncp, ef_res.id card
    from pn join ef_res
      on pn.codigo_ibge = any(ef_res.ibges::text[])
     and pn.num is not null and ef_res.num is not null
     and pn.num = ef_res.num
)
-- 1) o robo achou E a Effecti trouxe
select 'casado'::text, pn.codigo_ibge, pn.municipio, pn.uf,
       pn.num::text, left(pn.objeto_compra, 300), pn.modalidade_nome,
       pn.valor_estimado, pn.data_encerramento_proposta, pn.score_gss::int,
       pn.link_sistema_origem, c.card
  from pn join casados c using (numero_controle_pncp)
union all
-- 2) o robo achou e a Effecti NAO trouxe  (o ganho)
select 'so_pncp', pn.codigo_ibge, pn.municipio, pn.uf,
       pn.num::text, left(pn.objeto_compra, 300), pn.modalidade_nome,
       pn.valor_estimado, pn.data_encerramento_proposta, pn.score_gss::int,
       pn.link_sistema_origem, null::uuid
  from pn
 where not exists (select 1 from casados c where c.numero_controle_pncp = pn.numero_controle_pncp)
union all
-- 3) a Effecti trouxe e o robo NAO pontuou  (o risco do corte)
select 'so_effecti', (ef_res.ibges)[1]::text, coalesce(ef_res.mun_campo, ef_res.mun_tit), ef_res.uf_campo,
       ef_res.num::text, ef_res.titulo, null, ef_res.valor_estimado, ef_res.data_disputa,
       null::int, null, ef_res.id
  from ef_res
 where not exists (
   select 1 from casados c join pn on pn.numero_controle_pncp = c.numero_controle_pncp
    where c.card = ef_res.id)
$$;

grant execute on function pncp_comparativo(date, date, int, boolean, boolean) to authenticated, service_role;
