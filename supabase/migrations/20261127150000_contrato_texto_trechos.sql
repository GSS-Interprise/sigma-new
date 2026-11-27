-- Texto dos contratos para a IA (27/11/2026). O Maikon perguntou à IA do Sigma "Braço do Norte: o particular no PS é
-- nosso ou do hospital?" e ela não soube: o domínio contratos lia número, itens e vigência, mas não as cláusulas. Os
-- PDFs anexados ao contrato (contrato_anexos) têm o texto extraído e guardado aqui em trechos de ~1.500 caracteres,
-- com busca em português sem acento. Leitura só pelo service role (o domínio do agente e a extração); o front não lê.
create or replace function public.contrato_tsv(t text) returns tsvector
language sql immutable parallel safe set search_path = public, extensions as $$
  select to_tsvector('portuguese', public.unaccent('public.unaccent', coalesce(t, '')));
$$;

create table if not exists public.contrato_anexo_leitura (
  anexo_id uuid primary key references public.contrato_anexos(id) on delete cascade,
  contrato_id uuid not null,
  status text not null check (status in ('ok', 'sem_texto', 'erro', 'ignorado')),
  paginas int,
  caracteres int,
  erro text,
  lido_em timestamptz not null default now()
);

create table if not exists public.contrato_texto_trechos (
  id bigserial primary key,
  anexo_id uuid not null references public.contrato_anexos(id) on delete cascade,
  contrato_id uuid not null,
  ordem int not null,
  pagina int,
  texto text not null,
  tsv tsvector generated always as (public.contrato_tsv(texto)) stored,
  unique (anexo_id, ordem)
);
create index if not exists contrato_texto_trechos_tsv_idx on public.contrato_texto_trechos using gin (tsv);
create index if not exists contrato_texto_trechos_contrato_idx on public.contrato_texto_trechos (contrato_id);

alter table public.contrato_anexo_leitura enable row level security;
alter table public.contrato_texto_trechos enable row level security;
revoke all on public.contrato_anexo_leitura, public.contrato_texto_trechos from anon, authenticated;
grant select, insert, update, delete on public.contrato_anexo_leitura, public.contrato_texto_trechos to service_role;
grant usage, select on sequence public.contrato_texto_trechos_id_seq to service_role;

-- Busca: os trechos mais relevantes para a pergunta, opcionalmente só de alguns contratos. Desempate fixo (id) para o
-- mesmo resultado sair sempre na mesma ordem (hash do agente).
create or replace function public.contratos_buscar_trechos(p_consulta text, p_contrato_ids uuid[] default null, p_limite int default 8)
returns table (contrato_id uuid, anexo_id uuid, arquivo text, pagina int, trecho text, relevancia real)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select websearch_to_tsquery('portuguese', public.unaccent('public.unaccent', p_consulta)) as tq),
  q2 as (
    -- websearch exige todos os termos; sem resultado, cai para "qualquer termo" (or).
    select case when exists (select 1 from contrato_texto_trechos t, q where t.tsv @@ q.tq
                              and (p_contrato_ids is null or t.contrato_id = any(p_contrato_ids)))
                then (select tq from q)
                else (select to_tsquery('portuguese', string_agg(lexema, ' | '))
                        from unnest(tsvector_to_array(public.contrato_tsv(p_consulta))) lexema) end as tq
  )
  select t.contrato_id, t.anexo_id, a.arquivo_nome, t.pagina, t.texto, ts_rank_cd(t.tsv, q2.tq)::real
    from contrato_texto_trechos t
    join contrato_anexos a on a.id = t.anexo_id
    cross join q2
   where q2.tq is not null and t.tsv @@ q2.tq
     and (p_contrato_ids is null or t.contrato_id = any(p_contrato_ids))
   order by ts_rank_cd(t.tsv, q2.tq) desc, t.id
   limit greatest(1, least(coalesce(p_limite, 8), 20));
$$;
revoke all on function public.contratos_buscar_trechos(text, uuid[], int) from public, anon, authenticated;
grant execute on function public.contratos_buscar_trechos(text, uuid[], int) to service_role;
