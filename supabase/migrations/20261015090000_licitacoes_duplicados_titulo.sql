-- Correção (15/10, revisão da reunião de 07/10): o aviso de duplicado não achava os cards criados pelo
-- robô do Effecti, porque eles guardam o código do aviso (ex.: 7768042) em numero_edital e o número do
-- edital só no título ("PE 103/2026 - Cidade/UF"). Agora compara o número também pelo título.

create or replace function public.licitacoes_possiveis_duplicados(_numero text, _orgao text, _municipio_uf text, _cnpj text, _empresa text default 'GSS', _ignorar uuid default null)
returns table (id uuid, titulo text, numero_edital text, orgao text, municipio_uf text, status text, arquivado_em timestamptz, data_disputa timestamptz, motivo text)
language sql stable as $$
  with alvo as (
    select licitacao_numero_nucleo(_numero) as nucleo,
           licitacao_uf(_municipio_uf, null) as uf,
           nullif(regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g'), '') as cnpj,
           lower(unaccent(coalesce(_orgao, ''))) as orgao,
           btrim(lower(unaccent(regexp_replace(coalesce(_municipio_uf, ''), '\s*[-/]\s*[A-Za-z]{2}\s*$', '')))) as cidade
  )
  select l.id, l.titulo, l.numero_edital, l.orgao, l.municipio_uf, l.status::text, l.arquivado_em, l.data_disputa,
         concat_ws(', ',
           case when a.cnpj is not null and regexp_replace(coalesce(l.cnpj_orgao, ''), '\D', '', 'g') = a.cnpj then 'mesmo CNPJ do órgão' end,
           case when length(a.cidade) > 2 and lower(unaccent(coalesce(l.municipio_uf, '') || ' ' || coalesce(l.titulo, '') || ' ' || coalesce(l.orgao, ''))) like '%' || a.cidade || '%' then 'mesma cidade' end,
           case when length(a.orgao) > 5 and similarity(lower(unaccent(coalesce(l.orgao, ''))), a.orgao) > 0.45 then 'órgão parecido' end) as motivo
    from licitacoes l, alvo a
   where a.nucleo is not null
     and l.board = 'effecti'
     and l.empresa = coalesce(nullif(_empresa, ''), 'GSS')
     and (_ignorar is null or l.id <> _ignorar)
     -- card do robô guarda o código do aviso do Effecti em numero_edital; o número de verdade está no título
     and (licitacao_numero_nucleo(l.numero_edital) = a.nucleo or licitacao_numero_nucleo(l.titulo) = a.nucleo)
     and (
       (a.cnpj is not null and regexp_replace(coalesce(l.cnpj_orgao, ''), '\D', '', 'g') = a.cnpj)
       or (length(a.cidade) > 2 and lower(unaccent(coalesce(l.municipio_uf, '') || ' ' || coalesce(l.titulo, '') || ' ' || coalesce(l.orgao, ''))) like '%' || a.cidade || '%')
       or (length(a.orgao) > 5 and similarity(lower(unaccent(coalesce(l.orgao, ''))), a.orgao) > 0.45)
     )
   order by l.arquivado_em nulls first, l.created_at desc
   limit 5;
$$;

