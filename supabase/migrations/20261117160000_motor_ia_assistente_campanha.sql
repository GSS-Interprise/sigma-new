-- Primeiro processo do Claude da GSS (Raul, 17/11/2026): o assistente de campanha interpreta a "regra especial" pelo
-- Claude (Hermes na VPS) e cai no Gemini quando não há login. A edge campanha-assistente-ia pede a rotina com a
-- service_role; o worker a executa no laço rápido do motor de IA (motor_claude.assistente_campanha).
-- Só muda a lista de tipos aceitos: o resto de rotina_pedir é igual ao de 20261113170000.

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
  if p_tipo not in ('ping', 'lifeshub_lista', 'drescala_escalas',
                    'ia_claude_situacao', 'ia_claude_login', 'ia_claude_codigo', 'ia_claude_teste', 'ia_claude_sair',
                    'ia_claude_assistente_campanha') then
    raise exception 'rotina_desconhecida: %', p_tipo;
  end if;
  if p_tipo like 'ia\_claude\_%' and auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'so_administrador';
  end if;
  insert into rotina_pedidos (tipo, payload) values (p_tipo, coalesce(p_payload, '{}'::jsonb)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.rotina_pedir(text, jsonb) from public, anon;
grant execute on function public.rotina_pedir(text, jsonb) to authenticated, service_role;
