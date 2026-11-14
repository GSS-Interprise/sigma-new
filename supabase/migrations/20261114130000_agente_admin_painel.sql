-- Protocolo do agente do Sigma, T4: dados da aba Configurações › Agente do Sigma (só admin).
-- docs/arquitetura/protocolo-agente-sigma.md §3g. O guia e a constituição vêm da edge (GET sigma-mcp/admin/protocolo),
-- para o admin ler o mesmo texto que o agente lê; aqui ficam as pessoas, conexões e chamadas.
-- Teste: supabase/tests/agente_acessos.sql (bloco 6).

-- Tudo que a aba precisa numa ida só. p_dias: janela dos números e das perguntas.
create or replace function public.agente_admin_painel(p_dias int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 90)));
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not public.is_admin(auth.uid()) then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    -- Só admin e diretoria entram no MCP (sigma-mcp PAPEIS_LIBERADOS); a matriz mostra esses dois papéis.
    'papeis', (
      select coalesce(jsonb_agg(jsonb_build_object('papel', x.papel, 'pessoas', x.pessoas) order by x.papel), '[]')
      from (
        select r.role::text papel,
               jsonb_agg(jsonb_build_object('id', p.id, 'nome', coalesce(nullif(p.nome_completo, ''), p.email), 'email', p.email)
                         order by coalesce(nullif(p.nome_completo, ''), p.email)) pessoas
        from user_roles r join profiles p on p.id = r.user_id
        where r.role in ('admin', 'diretoria') and coalesce(p.status, 'ativo') = 'ativo'
        group by r.role
      ) x),
    'acessos', (
      select coalesce(jsonb_agg(jsonb_build_object('papel', a.papel, 'dominio', a.dominio, 'liberado_em', a.liberado_em)), '[]')
      from agente_dominio_acessos a),
    'conexoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'user_id', t.user_id, 'pessoa', coalesce(nullif(p.nome_completo, ''), p.email, 'sem nome'),
        'nome', t.nome, 'origem', t.origem, 'prefixo', t.prefixo, 'cliente', c.nome,
        'criado_em', t.criado_em, 'ultimo_uso_em', t.ultimo_uso_em) order by t.ultimo_uso_em desc nulls last), '[]')
      from mcp_tokens t
      left join profiles p on p.id = t.user_id
      left join mcp_oauth_clientes c on c.client_id = t.client_id
      where t.revogado_em is null and (t.expira_em is null or t.expira_em > now())),
    'chamadas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'criado_em', m.criado_em, 'user_id', m.user_id,
        'pessoa', coalesce(nullif(p.nome_completo, ''), p.email, 'sem nome'),
        'metodo', m.metodo, 'ferramenta', m.ferramenta, 'dominio', m.dominio, 'argumentos', m.argumentos,
        'ok', m.ok, 'erro', m.erro, 'duracao_ms', m.duracao_ms, 'protocolo_versao', m.protocolo_versao,
        'resultado_hash', m.resultado_hash, 'fonte_atualizada_em', m.fonte_atualizada_em) order by m.id desc), '[]')
      from (select * from mcp_chamadas where criado_em >= v_desde order by id desc limit 200) m
      left join profiles p on p.id = m.user_id),
    'totais', (
      select jsonb_build_object(
        'conectadas', (select count(distinct user_id) from mcp_tokens
                       where revogado_em is null and (expira_em is null or expira_em > now())),
        'usando', count(distinct m.user_id),
        'perguntas', count(*) filter (where m.metodo = 'tools/call'),
        'erros', count(*) filter (where not m.ok))
      from mcp_chamadas m where m.criado_em >= v_desde),
    'dias', greatest(1, least(coalesce(p_dias, 7), 90))
  );
end;
$$;
revoke all on function public.agente_admin_painel(int) from public, anon;
grant execute on function public.agente_admin_painel(int) to authenticated, service_role;

-- Admin desliga a conexão de qualquer pessoa (o dono desliga a própria em /conectar-claude).
create or replace function public.agente_admin_revogar(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not public.is_admin(auth.uid()) then raise exception 'sem_permissao'; end if;
  update mcp_tokens set revogado_em = now() where id = p_token and revogado_em is null returning id into v_id;
  if v_id is null then raise exception 'conexao_inexistente'; end if;
  return jsonb_build_object('id', v_id, 'revogado', true);
end;
$$;
revoke all on function public.agente_admin_revogar(uuid) from public, anon;
grant execute on function public.agente_admin_revogar(uuid) to authenticated, service_role;
