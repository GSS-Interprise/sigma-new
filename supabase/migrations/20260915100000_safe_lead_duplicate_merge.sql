-- Exclusão segura de duplicados na tela de Leads.
--
-- Um lead que já participou da operação não pode ser apagado fisicamente:
-- várias tabelas guardam histórico, conversas e referências de auditoria com
-- ON DELETE NO ACTION. Este wrapper mantém a validação de permissão no banco
-- e delega a mesclagem para a rotina transacional existente.

create or replace function public.merge_lead_cluster_for_captacao(
  p_canonical_id uuid,
  p_duplicate_id uuid,
  p_batch_tag text default 'manual_ui'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.has_captacao_permission(auth.uid(), 'leads') then
    raise exception using
      errcode = '42501',
      message = 'Você não tem permissão para mesclar leads';
  end if;

  if p_canonical_id is null or p_duplicate_id is null then
    raise exception using
      errcode = '22004',
      message = 'Os dois leads são obrigatórios para a mesclagem';
  end if;

  if p_canonical_id = p_duplicate_id then
    raise exception using
      errcode = '22023',
      message = 'O registro canônico e o duplicado precisam ser diferentes';
  end if;

  return public.merge_lead_cluster(p_canonical_id, p_duplicate_id, coalesce(nullif(trim(p_batch_tag), ''), 'manual_ui'));
end;
$$;

revoke all on function public.merge_lead_cluster_for_captacao(uuid, uuid, text) from public;
grant execute on function public.merge_lead_cluster_for_captacao(uuid, uuid, text) to authenticated;

comment on function public.merge_lead_cluster_for_captacao(uuid, uuid, text) is
  'Mescla um lead duplicado no registro canônico, preservando histórico e exigindo permissão de captação.';
