-- =====================================================================
-- pncp_casa_effecti_ibge v2 — conserta a comparação do número do edital.
--
-- DEFEITO ANTERIOR (inflava 'incerto', escondia cobertura real):
-- a comparação fazia regexp_replace(numeroCompra,'[^0-9]','') e casava
-- contra '^0*<num>$'. Mas o numeroCompra do PNCP costuma carregar o ano
-- e sufixo de secretaria:
--     "34/2026"            -> vira "342026"        (nunca casa com 34)
--     "014/2026"           -> vira "0142026"       (nunca casa com 14)
--     "003/2026- SMS/PMLA" -> vira "00320261"      (nunca casa com 3)
--     "92 | Processo 146"  -> vira "92146"         (nunca casa com 146)
-- Resultado: licitação que ESTAVA no espelho, com número idêntico, era
-- classificada 'incerto' — e 'incerto' era lido como duvida sobre a
-- Effecti, quando era defeito do medidor.
--
-- AGORA: compara GRUPO NUMÉRICO a GRUPO NUMÉRICO, como inteiro (o que
-- mata zero à esquerda dos dois lados), contra qualquer grupo presente no
-- numeroCompra. O ano continua vindo de m.ano, que é campo próprio.
-- =====================================================================

create or replace function pncp_casa_effecti_ibge(
  p_ibge  integer[],
  p_num   text,
  p_mod   integer default null,
  p_ano   integer default null,
  p_desde date    default null
) returns text
language sql stable security definer set search_path to 'public' as $$
  with alvo as (
    -- Tira zero à esquerda ANTES de medir o tamanho: "0000002" é o edital
    -- 2, não lixo. Só depois descarta o que tem >6 dígitos, que aí sim é
    -- parse ruim do título (ex.: "14133211002026", "PCE1162020260038").
    select case
             when regexp_replace(coalesce(p_num, ''), '^0+', '') ~ '^\d{1,6}$'
             then regexp_replace(p_num, '^0+', '')::int
           end as n
  ),
  hit as (
    select m.codigo_ibge, m.modalidade_id, m.ano
      from pncp_mirror m, alvo a
     where m.codigo_ibge = any(p_ibge::text[])
       and a.n is not null
       and (p_ano is null or m.ano = p_ano)
       and (
         exists (
           select 1
             from regexp_matches(coalesce(m.raw->>'numeroCompra',''), '(\d{1,6})', 'g') g
            where g[1]::int = a.n
         )
         or m.sequencial = a.n
       )
  )
  select case
    when p_ibge is null or array_length(p_ibge, 1) is null then 'nao_resolvido'

    -- número (+ano) e modalidade batem
    when exists (select 1 from hit where p_mod is null or hit.modalidade_id = p_mod)
      then 'casado'

    -- número (+ano) bate, modalidade diverge. A Effecti classifica
    -- modalidade de forma inconsistente; o número é o discriminante forte.
    when exists (select 1 from hit) then 'provavel'

    -- Município ESTÁ no espelho, mas este número não foi achado. Pode ser
    -- edital fora do PNCP ou falha de parse do título (que é caótico).
    -- Bucket de revisão — NÃO conta como coberto e NÃO é prova de nada.
    when exists (
      select 1 from pncp_mirror m where m.codigo_ibge = any(p_ibge::text[])
    ) then 'incerto'

    -- Município resolvido e sem NENHUM registro no espelho → único caso
    -- que sugere fonte fora do PNCP. Este é o número que decide o corte.
    else 'ausente'
  end
$$;

grant execute on function pncp_casa_effecti_ibge(integer[], text, integer, integer, date)
  to authenticated, service_role;
