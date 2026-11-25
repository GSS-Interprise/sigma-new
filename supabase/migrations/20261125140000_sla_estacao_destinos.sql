-- Quem recebe o aviso de estação do SLA parada / voltou (25/11/2026). A lista vive em config_lista_items
-- (sla_estacao_destinos, JSON [{nome, fone}]) e o alertas-equipe já lê dela; sem ninguém, o aviso vai só para o número
-- de teste (sla_teste_destino), que é o do Raul: em 24/11 a equipe da GSS não soube que o Marieta tinha caído.
-- A aba Coordenação edita a lista por esta função, com a mesma permissão das outras configurações do SLA.
create or replace function public.sla_estacao_destinos_salvar(p_destinos jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb; v_lista jsonb := '[]'::jsonb; v_fone text;
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  if jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) > 10 then raise exception 'no máximo 10 pessoas'; end if;
  for v in select * from jsonb_array_elements(p_destinos) loop
    v_fone := regexp_replace(coalesce(v->>'fone', ''), '\D', '', 'g');
    if nullif(trim(v->>'nome'), '') is null then raise exception 'informe o nome'; end if;
    if length(v_fone) < 12 then raise exception 'telefone com DDI e DDD: %', v->>'nome'; end if;
    v_lista := v_lista || jsonb_build_object('nome', trim(v->>'nome'), 'fone', v_fone);
  end loop;
  update config_lista_items set valor = v_lista::text where campo_nome = 'sla_estacao_destinos';
  if not found then insert into config_lista_items (campo_nome, valor) values ('sla_estacao_destinos', v_lista::text); end if;
  return v_lista;
end $$;

revoke all on function public.sla_estacao_destinos_salvar(jsonb) from public, anon;
grant execute on function public.sla_estacao_destinos_salvar(jsonb) to authenticated;
