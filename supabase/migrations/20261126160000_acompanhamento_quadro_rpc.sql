-- Aba "Quentes (IA)" da tela Campanhas: o front trazia a view vw_acompanhamento_kanban inteira (10.696 linhas em
-- 11 páginas em fila, ~15 s de tela vazia) e contava tudo no navegador. Esta função faz o trabalho no servidor numa
-- passada só: aplica a busca e o filtro, conta por filtro e por coluna e devolve só os primeiros cards de cada coluna.
--
-- Por que uma função e não filtros do PostgREST na view: etapa_crm é calculada (depende de unread_messages, que sai
-- de um LATERAL sobre sigzap_conversations), então qualquer filtro por coluna obriga o Postgres a calcular a view
-- inteira (~0,5 s). Fazer isso uma vez só e cortar por coluna aqui dentro custa o mesmo que uma contagem.
--
-- A view continua igual: o badge quentesSemDono (CampanhasProspeccao) e o CampanhaProspeccaoKanban
-- (vw_acompanhamento_kanban_full) não dependem desta função.

create or replace function public.acompanhamento_quadro(
  p_filtro text default 'todos',
  p_busca text default null,
  p_por_coluna integer default 25,
  p_etapa text default null,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with
  termo as (
    select
      nullif(btrim(coalesce(p_busca, '')), '') as txt,
      nullif(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '') as digitos
  ),
  base as materialized (
    select v.*,
      -- "Aguarda Maikon/equipe" só faz sentido para quem está na coluna Qualificado. Antes o filtro olhava a
      -- validação de TODOS os leads e, como quase ninguém tem validação marcada, mostrava a base inteira.
      (v.etapa_crm = 'qualificado'
        and coalesce((v.validacoes -> 'validacao_maikon' ->> 'ok')::boolean, false) = false) as aguarda_maikon,
      (v.etapa_crm = 'qualificado'
        and coalesce((v.validacoes -> 'validacao_equipe' ->> 'ok')::boolean, false) = false) as aguarda_equipe
    from vw_acompanhamento_kanban v, termo t
    where t.txt is null
       or unaccent(v.lead_nome) ilike '%' || unaccent(t.txt) || '%'
       or unaccent(coalesce(v.campanha_nome, '')) ilike '%' || unaccent(t.txt) || '%'
       -- telefone em qualquer formato: compara só os dígitos (a partir de 4, para "21" não casar com meio mundo)
       or (length(t.digitos) >= 4 and regexp_replace(coalesce(v.lead_phone, ''), '\D', '', 'g') like '%' || t.digitos || '%')
  ),
  filtrado as materialized (
    select b.*
    from base b
    where case coalesce(p_filtro, 'todos')
      when 'minha_fila' then b.assumido_por = auth.uid()
      when 'sem_dono' then b.assumido_por is null
      when 'aguarda_maikon' then b.aguarda_maikon
      when 'aguarda_equipe' then b.aguarda_equipe
      else true
    end
  ),
  ordenado as (
    select f.*,
      row_number() over (
        partition by f.etapa_crm
        order by (f.unread_messages > 0) desc,
          coalesce(f.last_incoming_at, f.data_ultimo_contato, f.data_status) desc nulls last,
          f.campanha_lead_id
      ) as pos
    from filtrado f
  )
  select jsonb_build_object(
    'filtros', (
      select jsonb_build_object(
        'todos', count(*),
        'minha_fila', count(*) filter (where assumido_por = auth.uid()),
        'sem_dono', count(*) filter (where assumido_por is null),
        'aguarda_maikon', count(*) filter (where aguarda_maikon),
        'aguarda_equipe', count(*) filter (where aguarda_equipe)
      ) from base
    ),
    'colunas', coalesce((select jsonb_object_agg(etapa_crm, n) from (
      select etapa_crm, count(*) as n from filtrado group by etapa_crm
    ) c), '{}'::jsonb),
    'leads', coalesce((
      select jsonb_agg(to_jsonb(o) - 'pos' - 'aguarda_maikon' - 'aguarda_equipe' order by o.etapa_crm, o.pos)
      from ordenado o
      where case
        when p_etapa is null then o.pos <= greatest(p_por_coluna, 0) and o.etapa_crm <> 'perdido'
        else o.etapa_crm = p_etapa
          and o.pos > greatest(p_offset, 0)
          and o.pos <= greatest(p_offset, 0) + greatest(p_por_coluna, 0)
      end
    ), '[]'::jsonb),
    -- Banner de quentes esperando: independe do filtro e da busca; perdido não espera ninguém (antes o banner
    -- listava leads quentes já perdidos, com 4.776 h de "espera").
    'quentes_sem_dono', coalesce((
      select jsonb_agg(jsonb_build_object(
          'campanha_lead_id', v.campanha_lead_id,
          'lead_nome', v.lead_nome,
          'campanha_nome', v.campanha_nome,
          'data_status', v.data_status
        ) order by v.data_status, v.campanha_lead_id)
      from vw_acompanhamento_kanban v
      where v.etapa_acompanhamento = 'quente'
        and v.assumido_por is null
        and v.etapa_crm <> 'perdido'
        and v.data_status is not null
    ), '[]'::jsonb)
  );
$$;

comment on function public.acompanhamento_quadro(text, text, integer, text, integer) is
  'Aba Quentes (IA): contagens por filtro e por coluna + primeiros cards de cada coluna (ou uma página de p_etapa), com busca por nome, campanha ou telefone. Tudo no servidor.';

grant execute on function public.acompanhamento_quadro(text, text, integer, text, integer) to authenticated, service_role;
