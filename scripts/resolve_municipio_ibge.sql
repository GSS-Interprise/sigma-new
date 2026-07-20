-- =====================================================================
-- resolve_municipio_ibge — string suja de município → código IBGE.
--
-- Devolve `metodo` de propósito: o comparador de cobertura precisa saber
-- SE resolveu e COMO. "não resolvi o município" tem que ser um bucket
-- próprio, nunca virar "ausente do PNCP" — senão infla justamente o
-- número que decide o corte da Effecti.
--
-- p_uf aceita sigla ("SC") ou nome por extenso ("Santa Catarina"), porque
-- o título da Effecti traz estado escrito por extenso.
-- =====================================================================

create table if not exists ufs_ibge (
  sigla     text primary key,
  nome      text not null,
  nome_norm text generated always as (
    regexp_replace(lower(imm_unaccent(nome)), '[^a-z0-9]', '', 'g')
  ) stored
);
grant select on ufs_ibge to authenticated, service_role;

create or replace function resolve_municipio_ibge(p_nome text, p_uf text default null)
returns table (codigo_ibge int, nome text, uf text, metodo text, score real)
language plpgsql stable as $$
declare
  v_in   text;
  v_uf   text;
begin
  v_in := regexp_replace(lower(imm_unaccent(coalesce(p_nome, ''))), '[^a-z0-9]', '', 'g');
  if v_in = '' or length(v_in) < 3 then return; end if;

  -- UF: aceita sigla ou nome por extenso
  v_uf := nullif(upper(trim(coalesce(p_uf, ''))), '');
  if v_uf is not null and length(v_uf) <> 2 then
    select u.sigla into v_uf from ufs_ibge u
     where u.nome_norm = regexp_replace(lower(imm_unaccent(p_uf)), '[^a-z0-9]', '', 'g');
  end if;

  -- 1) exato
  return query
    select m.codigo_ibge, m.nome, m.uf, 'exato'::text, 1.0::real
      from municipios_ibge m
     where m.nome_norm = v_in and (v_uf is null or m.uf = v_uf)
     limit 1;
  if found then return; end if;

  -- 2) contido — cobre caractere comido no início ("lves" ⊂ "luizalves").
  --    Só aceita se for ÚNICO na UF; ambíguo cai pro fuzzy.
  return query
    with c as (
      select m.codigo_ibge, m.nome, m.uf,
             similarity(m.nome_norm, v_in) as sim,
             count(*) over () as n
        from municipios_ibge m
       where (v_uf is null or m.uf = v_uf)
         and length(v_in) >= 4
         and m.nome_norm like '%' || v_in || '%'
    )
    select c.codigo_ibge, c.nome, c.uf, 'contido'::text, c.sim::real
      from c where c.n = 1 limit 1;
  if found then return; end if;

  -- 3) trigram — último recurso, limiar conservador. Abaixo disso é
  --    revisão humana, não chute.
  return query
    select m.codigo_ibge, m.nome, m.uf, 'fuzzy'::text,
           similarity(m.nome_norm, v_in)::real
      from municipios_ibge m
     where (v_uf is null or m.uf = v_uf)
       and similarity(m.nome_norm, v_in) >= 0.55
     order by similarity(m.nome_norm, v_in) desc
     limit 1;
end $$;

grant execute on function resolve_municipio_ibge(text, text) to authenticated, service_role;
