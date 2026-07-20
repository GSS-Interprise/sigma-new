-- =====================================================================
-- pncp_casa_effecti_ibge — casamento Effecti × espelho por CÓDIGO IBGE.
--
-- Substitui pncp_casa_effecti (similarity de nome). Duas correções de
-- rigor sobre a versão antiga, que inflavam a cobertura:
--
--  1) 'provavel' antes era "município tem QUALQUER licitação dessa
--     modalidade" — não olhava o número do edital. Isso é quase sempre
--     verdade e entrava no numerador. Agora exige o NÚMERO batendo.
--  2) 'ausente' antes exigia o município não ter NENHUMA licitação em
--     todo o espelho, sem janela de data — com 5.197 municípios no
--     espelho isso praticamente nunca acontece, então o bucket que
--     decide o corte da Effecti vinha zero por construção. Agora a
--     comparação é dentro da janela.
--
-- p_ibge é ARRAY porque campo e título da Effecti divergem em 5,4% dos
-- casos e nenhum dos dois é autoridade — o número do edital desempata.
-- =====================================================================

create index if not exists idx_pncp_mirror_ibge_ano  on pncp_mirror (codigo_ibge, ano);
create index if not exists idx_pncp_mirror_ibge_pub  on pncp_mirror (codigo_ibge, data_publicacao);

create or replace function pncp_casa_effecti_ibge(
  p_ibge  integer[],
  p_num   text,
  p_mod   integer default null,
  p_ano   integer default null,
  p_desde date    default null
) returns text
language sql stable security definer set search_path to 'public' as $$
  select case
    -- município não resolveu pro IBGE (consórcio, nome de estado, lixo).
    -- Bucket PRÓPRIO: não pode virar 'ausente', senão contamina o número
    -- que decide o corte.
    when p_ibge is null or array_length(p_ibge, 1) is null then 'nao_resolvido'

    -- número + ano + modalidade batem → coberto, sem dúvida
    when p_num is not null and exists (
      select 1 from pncp_mirror m
       where m.codigo_ibge = any(p_ibge::text[])
         and (p_ano is null or m.ano = p_ano)
         and (p_mod is null or m.modalidade_id = p_mod)
         and (
           regexp_replace(coalesce(m.raw->>'numeroCompra',''), '[^0-9]', '', 'g') ~ ('^0*' || p_num || '$')
           or m.sequencial::text = p_num
         )
    ) then 'casado'

    -- número + ano batem, modalidade diverge. A Effecti classifica
    -- modalidade de forma inconsistente; o número é o discriminante forte.
    when p_num is not null and exists (
      select 1 from pncp_mirror m
       where m.codigo_ibge = any(p_ibge::text[])
         and (p_ano is null or m.ano = p_ano)
         and (
           regexp_replace(coalesce(m.raw->>'numeroCompra',''), '[^0-9]', '', 'g') ~ ('^0*' || p_num || '$')
           or m.sequencial::text = p_num
         )
    ) then 'provavel'

    -- Município ESTÁ no espelho, mas este número de edital não foi achado.
    -- NÃO conta como coberto, e também NÃO é prova de fonte externa: pode
    -- ser falha de parse do número (o título da Effecti é caótico) ou
    -- edital realmente fora do PNCP. Bucket de revisão.
    --
    -- Sem filtro de data de propósito: a Effecti entrega hoje edital
    -- publicado semanas atrás. Exigir publicação recente marcava como
    -- "ausente" município que está no PNCP — inflava o número do corte.
    when exists (
      select 1 from pncp_mirror m
       where m.codigo_ibge = any(p_ibge::text[])
    ) then 'incerto'

    -- Município resolvido e sem NENHUM registro no espelho inteiro →
    -- único caso que sugere fonte fora do PNCP. Este é o número que decide.
    else 'ausente'
  end
$$;

grant execute on function pncp_casa_effecti_ibge(integer[], text, integer, integer, date)
  to authenticated, service_role;
