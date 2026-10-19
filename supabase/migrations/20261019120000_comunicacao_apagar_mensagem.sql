-- Apagar mensagem nos canais (Mavi, 19/10). O apagar é marcar deleted_at, mas a regra de leitura esconde
-- mensagem apagada de quem não é admin do Sigma, e o Postgres recusa um UPDATE cuja linha nova o próprio
-- usuário deixaria de enxergar ("new row violates row-level security policy"). Na prática só admin
-- conseguia apagar, nem o autor. A função confere a mesma permissão da regra de edição (admin, autor ou
-- criador do canal) e grava sem passar pela regra de leitura.
create or replace function public.comunicacao_apagar_mensagem(p_mensagem_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sem_permissao'; end if;
  if not exists (
    select 1 from comunicacao_mensagens m
    left join comunicacao_canais c on c.id = m.canal_id
    where m.id = p_mensagem_id
      and (is_admin(v_uid) or m.user_id = v_uid or c.criado_por = v_uid)
  ) then
    raise exception 'sem_permissao';
  end if;
  update comunicacao_mensagens set deleted_at = now() where id = p_mensagem_id and deleted_at is null;
end;
$$;

revoke all on function public.comunicacao_apagar_mensagem(uuid) from public, anon;
grant execute on function public.comunicacao_apagar_mensagem(uuid) to authenticated, service_role;
