-- Domínio "licitacoes" do protocolo do agente (docs/arquitetura/protocolo-agente-sigma.md §3i; assistente do Sigma,
-- fase 2, 21/11/2026). Mesmos filtros do Kanban de Licitações (LicitacoesKanban.tsx): board 'effecti' (o quadro de
-- produção; 'robo' é o comparativo do PNCP), empresa GSS por padrão, sem arquivados. Ordem fixa com desempate por id
-- (CLAUDE.md do repo): mesma pergunta, mesma ordem, mesmo hash.
-- Só o service role chama (sigma-mcp e sigma-assistente checam a permissão antes).

-- Colunas que significam fim de linha: não entram em "disputas próximas".
create or replace function public.agente_licitacoes_terminal(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('descarte_edital', 'nao_ganhamos', 'suspenso_revogado', 'arrematados', 'adjudicacao_homologacao');
$$;

create or replace function public.agente_licitacoes_quadro(p_empresa text default 'GSS')
returns table (status text, coluna text, ordem int, cards bigint)
language sql stable security definer set search_path = public as $$
  select c.status_vinculado::text, c.nome, c.ordem, count(l.id)
    from licitacoes_colunas c
    left join licitacoes l
      on l.status::text = c.status_vinculado::text and l.board = 'effecti' and l.arquivado_em is null
     and (p_empresa is null or l.empresa = p_empresa)
   group by c.status_vinculado::text, c.nome, c.ordem, c.id
   order by c.ordem, c.id;
$$;

create or replace function public.agente_licitacoes_novas(p_desde timestamptz, p_empresa text default 'GSS')
returns table (id uuid, titulo text, orgao text, municipio_uf text, valor_estimado numeric, data_disputa timestamptz,
               coluna text, empresa text, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, coalesce(nullif(btrim(l.titulo), ''), l.objeto_resumo, l.objeto), l.orgao, l.municipio_uf, l.valor_estimado,
         l.data_disputa, coalesce(c.nome, l.status::text), l.empresa, l.created_at
    from licitacoes l
    left join licitacoes_colunas c on c.status_vinculado::text = l.status::text
   where l.board = 'effecti' and l.created_at >= p_desde
     and (p_empresa is null or l.empresa = p_empresa)
   order by l.created_at desc, l.id;
$$;

create or replace function public.agente_licitacoes_disputas(p_de timestamptz, p_ate timestamptz, p_empresa text default 'GSS')
returns table (id uuid, titulo text, orgao text, municipio_uf text, valor_estimado numeric, data_disputa timestamptz,
               coluna text, ordem int, empresa text, responsavel text)
language sql stable security definer set search_path = public as $$
  select l.id, coalesce(nullif(btrim(l.titulo), ''), l.objeto_resumo, l.objeto), l.orgao, l.municipio_uf, l.valor_estimado,
         l.data_disputa, coalesce(c.nome, l.status::text), coalesce(c.ordem, 99), l.empresa, p.nome_completo
    from licitacoes l
    left join licitacoes_colunas c on c.status_vinculado::text = l.status::text
    left join profiles p on p.id = l.responsavel_id
   where l.board = 'effecti' and l.arquivado_em is null and not public.agente_licitacoes_terminal(l.status::text)
     and l.data_disputa >= p_de and l.data_disputa < p_ate
     and (p_empresa is null or l.empresa = p_empresa)
   order by l.data_disputa, l.id;
$$;

revoke all on function public.agente_licitacoes_quadro(text) from public, anon, authenticated;
revoke all on function public.agente_licitacoes_novas(timestamptz, text) from public, anon, authenticated;
revoke all on function public.agente_licitacoes_disputas(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.agente_licitacoes_quadro(text) to service_role;
grant execute on function public.agente_licitacoes_novas(timestamptz, text) to service_role;
grant execute on function public.agente_licitacoes_disputas(timestamptz, timestamptz, text) to service_role;
