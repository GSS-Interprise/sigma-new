-- Fase 5.3 do plano GSS dono no comando: rotina lifeshub_lista.
-- Payload: {"especialidade": "GINECOLOGIA E OBSTETRÍCIA", "ufs": ["GO"], "limite": 0}
-- O worker da VPS extrai do Life's Hub (The Connection) e o Sigma importa como lista de disparo
-- pela edge import-leads-excel (via rotinas-fila action importar_lista).
create or replace function public.rotina_pedir(p_tipo text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'authentication_required';
  end if;
  if p_tipo not in ('ping', 'lifeshub_lista') then
    raise exception 'rotina_desconhecida: %', p_tipo;
  end if;
  insert into rotina_pedidos (tipo, payload) values (p_tipo, coalesce(p_payload, '{}'::jsonb)) returning id into v_id;
  return v_id;
end;
$$;
