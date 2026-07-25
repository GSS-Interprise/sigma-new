-- =====================================================================
-- licitacao_ja_existe - o MESMO edital ja tem card no Sigma, de QUALQUER
-- fonte?
--
-- POR QUE PRECISA: o robo (pncp-promote) deduplica por licitacao_codigo =
-- numero_controle_pncp; a Effecti grava licitacao_codigo = effect_id
-- numerico. Chaves DISJUNTAS: nunca colidem. Sem esta checagem, os 314
-- editais que as duas fontes enxergam viram 2 cards cada - exatamente a
-- duplicata que a equipe acabou de reclamar no kanban.
--
-- Casa por municipio (codigo IBGE) + numero do edital, a mesma regra do
-- pncp_comparativo e do pncp_cobertura_medir, pra os tres nunca se
-- contradizerem. O numero do lado Effecti sai do TITULO (o campo
-- numero_edital guarda o id interno da Effecti, nao o numero real).
-- =====================================================================

create or replace function licitacao_ja_existe(p_ibge text, p_num int)
returns uuid language sql stable security definer set search_path to 'public' as $$
  with ef as (
    select l.id, l.created_at,
      nullif(trim(regexp_replace(coalesce(l.municipio_uf,''), '\s*[-/]\s*[A-Za-z]{2}$', '')), '') mun_campo,
      case when l.municipio_uf ~ '[-/]\s*[A-Za-z]{2}$' then upper(right(trim(l.municipio_uf),2)) end uf_campo,
      nullif(trim(split_part(regexp_replace(l.titulo,'^.* - ',''), '/', 1)), '') mun_tit,
      nullif(trim(split_part(regexp_replace(l.titulo,'^.* - ',''), '/', 2)), '') uf_tit,
      coalesce((regexp_match(l.titulo,'(\d+)\s*/\s*(\d{4})'))[1],
               (regexp_match(l.titulo,'\y(\d{1,6})(20\d{2})\y'))[1],
               (regexp_match(l.titulo,'\y[A-Za-z]{2,5}\s+(\d+)\y'))[1]) num_txt
      from licitacoes l
     where l.titulo is not null
  )
  select ef.id
    from ef
    left join lateral resolve_municipio_ibge(ef.mun_campo, ef.uf_campo) rc on true
    left join lateral resolve_municipio_ibge(ef.mun_tit,   ef.uf_tit)   rt on true
   where p_ibge is not null and p_num is not null
     and p_ibge in (rc.codigo_ibge::text, rt.codigo_ibge::text)
     and regexp_replace(coalesce(ef.num_txt,''), '^0+', '') ~ '^\d{1,6}$'
     and regexp_replace(ef.num_txt, '^0+', '')::int = p_num
   order by ef.created_at nulls first
   limit 1
$$;

grant execute on function licitacao_ja_existe(text, int) to authenticated, service_role;
