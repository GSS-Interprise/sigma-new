-- T3 do plano licitacoes-contratos-gss.md (14/10): colunas do quadro editáveis pela equipe, como
-- no Trello (pedido da Bianca e da Denise na reunião de 07/10): renomear, mudar cor, arrastar para
-- reordenar, criar e excluir coluna direto no quadro.
--
-- Por que funções: o status do card é o enum status_licitacao. A tela antiga de "Gerenciar status"
-- só gravava em kanban_status_config, então uma coluna criada por ela não aceitava card (o enum
-- recusava o valor). Criar coluna agora acrescenta o valor ao enum e a linha de configuração juntos.
--
-- AGES: o quadro da AGES passa a ter o próprio conjunto de colunas (modulo licitacoes_ages, cópia
-- do atual). Assim o que a GSS renomeia, cria ou exclui não muda nada para a AGES.

create or replace function public.pode_editar_quadro_licitacoes(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = _uid
                  and role::text in ('admin', 'lider_licitacao', 'licitador', 'gestor_contratos', 'lideres'));
$$;

-- cópia das colunas atuais para o quadro da AGES (uma vez só)
insert into kanban_status_config (modulo, status_id, label, ordem, cor, ativo)
select 'licitacoes_ages', status_id, label, ordem, cor, ativo
  from kanban_status_config k
 where k.modulo = 'licitacoes'
   and not exists (select 1 from kanban_status_config a where a.modulo = 'licitacoes_ages');

-- colunas com regra própria no Sigma: podem ser renomeadas, não excluídas. Fracassado fica de fora
-- para poder ser unida a "Não ganhamos" (as duas arquivam igual; pedido da Bianca)
create or replace function public.licitacoes_coluna_protegida(_status text)
returns boolean language sql immutable as $$
  select _status in ('captacao_edital', 'arrematados', 'descarte_edital', 'nao_ganhamos', 'suspenso_revogado');
$$;

create or replace function public.licitacoes_coluna_criar(_label text, _cor text default null, _depois_de text default null)
returns text language plpgsql security definer set search_path = public as $$
declare base text; slug text; n int := 1; pos int;
begin
  if not pode_editar_quadro_licitacoes(auth.uid()) then raise exception 'Sem permissão para editar as colunas'; end if;
  _label := btrim(coalesce(_label, ''));
  if _label = '' then raise exception 'Dê um nome para a coluna'; end if;
  base := left(btrim(regexp_replace(lower(unaccent(_label)), '[^a-z0-9]+', '_', 'g'), '_'), 50);
  if base = '' then base := 'coluna'; end if;
  slug := base;
  while exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'status_licitacao' and e.enumlabel = slug)
     or exists (select 1 from kanban_status_config where modulo = 'licitacoes' and status_id = slug) loop
    n := n + 1; slug := base || '_' || n;
  end loop;
  execute format('alter type public.status_licitacao add value %L', slug);

  select ordem + 1 into pos from kanban_status_config where modulo = 'licitacoes' and status_id = _depois_de and ativo;
  if pos is null then
    select coalesce(max(ordem), 0) + 1 into pos from kanban_status_config where modulo = 'licitacoes' and ativo;
  else
    update kanban_status_config set ordem = ordem + 1, updated_at = now()
     where modulo = 'licitacoes' and ativo and ordem >= pos;
  end if;
  insert into kanban_status_config (modulo, status_id, label, ordem, cor, ativo)
  values ('licitacoes', slug, _label, pos, coalesce(nullif(_cor, ''), '#64748b'), true);
  return slug;
end $$;

-- exclui a coluna do quadro da GSS levando os cards dela (inclusive arquivados) para outra coluna
create or replace function public.licitacoes_coluna_excluir(_status text, _destino text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not pode_editar_quadro_licitacoes(auth.uid()) then raise exception 'Sem permissão para editar as colunas'; end if;
  if licitacoes_coluna_protegida(_status) then raise exception 'Essa coluna tem regra própria no Sigma e não pode ser excluída (pode ser renomeada)'; end if;
  if _destino is null or _destino = _status
     or not exists (select 1 from kanban_status_config where modulo = 'licitacoes' and status_id = _destino and ativo) then
    raise exception 'Escolha para qual coluna os cards vão';
  end if;
  update licitacoes set status = _destino::status_licitacao
   where status::text = _status and empresa = 'GSS';
  get diagnostics n = row_count;
  update kanban_status_config set ativo = false, updated_at = now() where modulo = 'licitacoes' and status_id = _status;
  return n;
end $$;

-- grava a ordem inteira de uma vez (arrastar coluna)
create or replace function public.licitacoes_colunas_reordenar(_status_ids text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pode_editar_quadro_licitacoes(auth.uid()) then raise exception 'Sem permissão para editar as colunas'; end if;
  update kanban_status_config k set ordem = x.i, updated_at = now()
    from unnest(_status_ids) with ordinality as x(sid, i)
   where k.modulo = 'licitacoes' and k.ativo and k.status_id = x.sid;
end $$;

-- renomear e mudar cor
create or replace function public.licitacoes_coluna_editar(_status text, _label text default null, _cor text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pode_editar_quadro_licitacoes(auth.uid()) then raise exception 'Sem permissão para editar as colunas'; end if;
  if _label is not null and btrim(_label) = '' then raise exception 'O nome da coluna não pode ficar vazio'; end if;
  update kanban_status_config
     set label = coalesce(btrim(_label), label), cor = coalesce(nullif(_cor, ''), cor), updated_at = now()
   where modulo = 'licitacoes' and status_id = _status and ativo;
end $$;

revoke all on function public.licitacoes_coluna_criar(text, text, text) from public, anon;
revoke all on function public.licitacoes_coluna_excluir(text, text) from public, anon;
revoke all on function public.licitacoes_colunas_reordenar(text[]) from public, anon;
revoke all on function public.licitacoes_coluna_editar(text, text, text) from public, anon;
grant execute on function public.licitacoes_coluna_criar(text, text, text) to authenticated;
grant execute on function public.licitacoes_coluna_excluir(text, text) to authenticated;
grant execute on function public.licitacoes_colunas_reordenar(text[]) to authenticated;
grant execute on function public.licitacoes_coluna_editar(text, text, text) to authenticated;
grant execute on function public.pode_editar_quadro_licitacoes(uuid) to authenticated;
