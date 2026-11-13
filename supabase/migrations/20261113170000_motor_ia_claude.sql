-- Motor de IA do Sigma: Hermes na VPS da GSS pela assinatura Max do Claude da GSS
-- (docs/arquitetura/motor-ia-hermes-claude.md). A tela Configurações › Motor de IA pede as rotinas
-- ia_claude_* (situação, login em dois passos, teste, desconectar) pela fila que já existe.
-- 1) rotina_pedir aceita os tipos novos, e só administrador pede rotina do motor de IA.
-- 2) rotina_concluir apaga o código do login do payload assim que o pedido termina: a fila é lida por
--    qualquer usuário logado, e o código não tem por que ficar guardado (sozinho ele não serve, mas não fica).

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
                    'ia_claude_situacao', 'ia_claude_login', 'ia_claude_codigo', 'ia_claude_teste', 'ia_claude_sair') then
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

create or replace function public.rotina_concluir(p_id uuid, p_ok boolean, p_resultado jsonb, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update rotina_pedidos
     set status = case when p_ok then 'feito' else 'erro' end,
         resultado = p_resultado, erro = left(p_erro, 2000), concluido_em = now(),
         payload = case when tipo = 'ia_claude_codigo' then '{}'::jsonb else payload end
   where id = p_id and status = 'executando';
$$;
revoke all on function public.rotina_concluir(uuid, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.rotina_concluir(uuid, boolean, jsonb, text) to service_role;
