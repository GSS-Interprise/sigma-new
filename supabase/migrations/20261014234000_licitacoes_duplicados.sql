-- T3 do plano licitacoes-contratos-gss.md (14/10): aviso de duplicado na criação manual.
-- Denise (reunião de 07/10, 20:16): "antes de inserir, verificar se já existe" (hoje usa Ctrl+F);
-- Bianca (20:27) pediu bloqueio — fica aviso até a GSS decidir. Procura no quadro da mesma
-- empresa, inclusive arquivados (o mesmo edital volta meses depois).
--
-- Número do edital em formatos diferentes ("PE 012/2026", "12/2026", "Pregão nº 12.2026") vira
-- "12/2026". Mesmo número + (mesma cidade, mesmo CNPJ ou órgão parecido) = provável duplicado. A UF
-- sozinha não basta: "26/2026" existe em dezenas de cidades de Minas.

create or replace function public.licitacao_numero_nucleo(_numero text)
returns text language sql immutable as $$
  select case when m is null then null else (m[1]::bigint)::text || '/' || m[2] end
  from (select regexp_match(coalesce(_numero, ''), '(\d{1,7})\s*[/.\-]\s*((?:19|20)\d{2})') as m) x;
$$;

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
     and licitacao_numero_nucleo(l.numero_edital) = a.nucleo
     and (
       (a.cnpj is not null and regexp_replace(coalesce(l.cnpj_orgao, ''), '\D', '', 'g') = a.cnpj)
       or (length(a.cidade) > 2 and lower(unaccent(coalesce(l.municipio_uf, '') || ' ' || coalesce(l.titulo, '') || ' ' || coalesce(l.orgao, ''))) like '%' || a.cidade || '%')
       or (length(a.orgao) > 5 and similarity(lower(unaccent(coalesce(l.orgao, ''))), a.orgao) > 0.45)
     )
   order by l.arquivado_em nulls first, l.created_at desc
   limit 5;
$$;

grant execute on function public.licitacao_numero_nucleo(text), public.licitacoes_possiveis_duplicados(text, text, text, text, text, uuid) to authenticated;
