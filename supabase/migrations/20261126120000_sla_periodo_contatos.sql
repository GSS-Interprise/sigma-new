-- Período dos contatos do SLA (Wagner, 26/11/2026, "a liberação dos avisos.pdf"):
--   Coordenação (quem recebe a ligação quando ninguém assume): Brenda no horário comercial (seg-sex, 7h às 19h),
--   Wagner à noite e no fim de semana, Ramone em última instância, sempre.
--   Estação parada (VPN da Marieta etc.): Brenda confere no fim do turno; fora do horário o aviso vai para o Wagner.
-- periodo: 'sempre' | 'comercial' | 'fora'. O motor decide na hora do aviso (noPeriodo em _shared/slaEscada.ts).

alter table public.sla_aviso_passos add column if not exists periodo text not null default 'sempre';
alter table public.sla_aviso_passos drop constraint if exists sla_aviso_passos_periodo;
alter table public.sla_aviso_passos add constraint sla_aviso_passos_periodo check (periodo in ('sempre', 'comercial', 'fora'));

create or replace function public.sla_avisos_salvar(p_destino text, p_passos jsonb, p_unidade text default 'marieta')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb; v_ids uuid[] := '{}'; v_id uuid; i int := 0; v_periodo text;
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  if p_destino not in ('plantonista', 'contato') then raise exception 'destino inválido'; end if;
  if jsonb_typeof(p_passos) <> 'array' or jsonb_array_length(p_passos) > 12 then raise exception 'no máximo 12 passos'; end if;

  for v in select * from jsonb_array_elements(p_passos) loop
    i := i + 1;
    v_id := nullif(v->>'id', '')::uuid;
    v_periodo := coalesce(nullif(v->>'periodo', ''), 'sempre');
    if v_id is not null and exists (select 1 from sla_aviso_passos where id = v_id and unidade = p_unidade and destino = p_destino) then
      update sla_aviso_passos set ordem = i, minutos = (v->>'minutos')::int, canal = v->>'canal',
        ativo = coalesce((v->>'ativo')::boolean, true), contato_nome = nullif(trim(v->>'contato_nome'), ''),
        contato_papel = nullif(v->>'contato_papel', ''), contato_telefone = nullif(v->>'contato_telefone', ''),
        contato_email = nullif(trim(v->>'contato_email'), ''), periodo = v_periodo, atualizado_em = now()
       where id = v_id;
    else
      insert into sla_aviso_passos (unidade, destino, ordem, minutos, canal, ativo, contato_nome, contato_papel, contato_telefone, contato_email, periodo)
      values (p_unidade, p_destino, i, (v->>'minutos')::int, v->>'canal', coalesce((v->>'ativo')::boolean, true),
        nullif(trim(v->>'contato_nome'), ''), nullif(v->>'contato_papel', ''), nullif(v->>'contato_telefone', ''),
        nullif(trim(v->>'contato_email'), ''), v_periodo)
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  delete from sla_aviso_passos where unidade = p_unidade and destino = p_destino and not (id = any(v_ids));
  return sla_avisos(p_unidade);
end;
$$;
revoke all on function public.sla_avisos_salvar(text, jsonb, text) from public, anon;
grant execute on function public.sla_avisos_salvar(text, jsonb, text) to authenticated;

create or replace function public.sla_estacao_destinos_salvar(p_destinos jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb; v_lista jsonb := '[]'::jsonb; v_fone text; v_email text; v_periodo text;
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  if jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) > 10 then raise exception 'no máximo 10 pessoas'; end if;
  for v in select * from jsonb_array_elements(p_destinos) loop
    v_fone := regexp_replace(coalesce(v->>'fone', ''), '\D', '', 'g');
    if nullif(trim(v->>'nome'), '') is null then raise exception 'informe o nome'; end if;
    v_email := lower(nullif(trim(coalesce(v->>'email', '')), ''));
    v_periodo := coalesce(nullif(v->>'periodo', ''), 'sempre');
    if v_periodo not in ('sempre', 'comercial', 'fora') then raise exception 'período inválido: %', v->>'nome'; end if;
    if v_fone <> '' and length(v_fone) < 12 then raise exception 'telefone com DDI e DDD: %', v->>'nome'; end if;
    if v_email is not null and v_email !~ '^\S+@\S+\.\S+$' then raise exception 'e-mail inválido: %', v->>'nome'; end if;
    if v_fone = '' and v_email is null then raise exception 'informe WhatsApp ou e-mail: %', v->>'nome'; end if;
    v_lista := v_lista || jsonb_strip_nulls(jsonb_build_object('nome', trim(v->>'nome'), 'fone', nullif(v_fone, ''), 'email', v_email,
      'periodo', nullif(v_periodo, 'sempre')));
  end loop;
  update config_lista_items set valor = v_lista::text where campo_nome = 'sla_estacao_destinos';
  if not found then insert into config_lista_items (campo_nome, valor) values ('sla_estacao_destinos', v_lista::text); end if;
  return v_lista;
end $$;
revoke all on function public.sla_estacao_destinos_salvar(jsonb) from public, anon;
grant execute on function public.sla_estacao_destinos_salvar(jsonb) to authenticated;

-- A escala do documento do Wagner. Ligação 10 min depois do vencimento para quem está no período; Ramone 30 min.
-- Os contatos valem para todas as unidades (o motor lê a lista da marieta).
insert into public.sla_aviso_passos (unidade, destino, ordem, minutos, canal, ativo, contato_nome, contato_papel, contato_telefone, periodo)
select 'marieta', 'contato', o, m, 'ligacao', true, n, p, t, pe from (values
  (1, 10, 'Brenda Rezende', 'coordenacao', '5547996472547', 'comercial'),
  (2, 10, 'Wagner Oliveira', 'coordenacao', '5547992338374', 'fora'),
  (3, 30, 'Ramone Oliveira', 'diretoria', '5547996175923', 'sempre')
) as x(o, m, n, p, t, pe)
where not exists (select 1 from public.sla_aviso_passos where unidade = 'marieta' and destino = 'contato');

update public.config_lista_items set valor = (
  select jsonb_agg(case d->>'nome' when 'Brenda Rezende' then d || '{"periodo":"comercial"}' when 'Wagner Oliveira' then d || '{"periodo":"fora"}' else d end)::text
    from jsonb_array_elements(valor::jsonb) d)
 where campo_nome = 'sla_estacao_destinos' and valor like '%Brenda%';
