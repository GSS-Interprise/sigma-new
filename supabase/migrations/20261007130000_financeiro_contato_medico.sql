-- Tela de Notas fiscais: o financeiro corrige o WhatsApp ou o e-mail do médico sem sair
-- do fluxo (pedido da Mavi, 06/10). O financeiro não tem permissão de edição no cadastro
-- de médicos; esta função libera só esses dois campos.
create or replace function public.financeiro_atualizar_contato_medico(
  p_medico_id uuid, p_telefone text default null, p_email text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not exists (select 1 from user_roles r where r.user_id = auth.uid()
                  and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')) then
    raise exception 'sem_permissao';
  end if;

  if p_telefone is not null then
    -- DDD + número digitado sem o 55: completa. Guarda no padrão do cadastro (+55...).
    if length(v_fone) in (10, 11) then v_fone := '55' || v_fone; end if;
    if v_fone !~ '^55\d{10,11}$' then raise exception 'telefone_invalido'; end if;
    update medicos set telefone = '+' || v_fone, updated_at = now() where id = p_medico_id;
  end if;

  if p_email is not null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
    update medicos set email = v_email, updated_at = now() where id = p_medico_id;
  end if;

  return (select jsonb_build_object('telefone', telefone, 'email', email) from medicos where id = p_medico_id);
end;
$$;

revoke all on function public.financeiro_atualizar_contato_medico(uuid, text, text) from public, anon;
grant execute on function public.financeiro_atualizar_contato_medico(uuid, text, text) to authenticated, service_role;
