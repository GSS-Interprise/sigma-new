-- Robô "Perguntar ao Sigma" no Claude da GSS (Raul, 25/11/2026; docs/arquitetura/motor-ia-hermes-claude.md).
-- A edge sigma-assistente pede a rotina ia_claude_robo_sigma (service_role) a cada passo do laço de ferramentas e cai
-- no Gemini sem login, com erro ou demora. O pedido leva a conversa e os resultados das ferramentas (pode ter nome de
-- médico), então:
-- 1) rotina_pedir aceita o tipo novo (a lista mantém o ia_claude_sugerir_resposta de 20261125110000);
-- 2) rotina_concluir apaga o payload do robô quando o pedido termina (a edge apaga o resultado depois de ler);
-- 3) a fila, legível por qualquer usuário logado, deixa de mostrar as linhas do robô (como já faz com a sugestão);
-- 4) motor_ia_processos() diz à tela Motor de IA qual motor respondeu por último em cada processo, sem abrir o
--    conteúdo de nenhum pedido. Só administrador.

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
                    'ia_claude_assistente_campanha', 'ia_claude_sugerir_resposta', 'ia_claude_robo_sigma') then
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
         payload = case when tipo in ('ia_claude_codigo', 'ia_claude_sugerir_resposta', 'ia_claude_robo_sigma') then '{}'::jsonb else payload end
   where id = p_id and status = 'executando';
$$;
revoke all on function public.rotina_concluir(uuid, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.rotina_concluir(uuid, boolean, jsonb, text) to service_role;

drop policy if exists rotina_pedidos_ler on public.rotina_pedidos;
create policy rotina_pedidos_ler on public.rotina_pedidos for select to authenticated
  using (tipo not in ('ia_claude_sugerir_resposta', 'ia_claude_robo_sigma'));

-- Último motor que respondeu em cada processo do Claude. 'claude' | 'gemini' | null (nunca usado).
-- Assistente de campanha: só os pedidos ao Claude ficam na fila; pedido com erro = o Gemini respondeu. Enquanto não há
-- login o Gemini responde sem passar pela fila, e aí não há registro (a tela diz isso).
-- Robô: assistente_mensagens.modelo de cada resposta. Sugestão: conversa_sugestoes (motor ou modelo_ia), com guarda
-- para a tabela ou a coluna ainda não existirem.
create or replace function public.motor_ia_processos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_campanha record;
  v_robo record;
  v_sug_motor text;
  v_sug_em timestamptz;
  v_col text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'so_administrador';
  end if;

  select status, concluido_em into v_campanha from rotina_pedidos
   where tipo = 'ia_claude_assistente_campanha' and status in ('feito', 'erro')
   order by concluido_em desc nulls last, id limit 1;

  select modelo, criado_em into v_robo from assistente_mensagens
   where papel = 'assistente' and modelo is not null
   order by criado_em desc, id limit 1;

  if to_regclass('public.conversa_sugestoes') is not null then
    select case when exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = 'conversa_sugestoes' and column_name = 'motor')
                then 'coalesce(motor, modelo_ia)' else 'modelo_ia' end into v_col;
    execute format('select %s, created_at from public.conversa_sugestoes where %s is not null order by created_at desc, id limit 1', v_col, v_col)
      into v_sug_motor, v_sug_em;
  end if;

  return jsonb_build_array(
    jsonb_build_object('processo', 'assistente_campanha',
      'motor', case v_campanha.status when 'feito' then 'claude' when 'erro' then 'gemini' end,
      'em', v_campanha.concluido_em),
    jsonb_build_object('processo', 'robo_sigma',
      'motor', case when v_robo.modelo ilike 'claude%' then 'claude' when v_robo.modelo is not null then 'gemini' end,
      'em', v_robo.criado_em),
    jsonb_build_object('processo', 'sugerir_resposta',
      'motor', case when v_sug_motor ilike '%claude%' then 'claude' when v_sug_motor is not null then 'gemini' end,
      'em', v_sug_em)
  );
end;
$$;
revoke all on function public.motor_ia_processos() from public, anon;
grant execute on function public.motor_ia_processos() to authenticated, service_role;
