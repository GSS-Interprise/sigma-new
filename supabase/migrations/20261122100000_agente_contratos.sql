-- Domínio "contratos" do agente do Sigma (assistente dentro do Sigma, fase 3, e MCP dos sócios).
-- docs/arquitetura/assistente-ia-sigma.md §3g. Só leitura e só service_role: a permissão é decidida na edge
-- (pode_modulo('contratos') no assistente; agente_dominio_acessos no MCP).
--
-- Regras copiadas da tela de Contratos (ContratosMetrics.tsx), para o número bater com o cartão:
--   - término efetivo = maior data_termino dos aditivos de prazo, se houver aditivo; senão data_termino, senão data_fim;
--   - vencido = status 'Ativo' e término efetivo <= hoje (a tela compara a meia-noite do término com "agora");
--   - a vencer em N dias = status 'Ativo' e hoje < término <= hoje + N;
--   - pendência = status 'Pendente' ou 'Aguardando', ou assinado = 'Pendente'.
-- "Hoje" é o dia de Brasília.

create or replace function public.agente_contratos_base()
returns table (
  id uuid, codigo_interno integer, codigo_contrato text, cliente text, uf text, status_contrato text, assinado text,
  objeto text, especialidade text, valor_estimado numeric, data_inicio date, fim_efetivo date, tem_anexo boolean,
  itens integer, aditivos integer
)
language sql stable security definer set search_path = public as $$
  select c.id, c.codigo_interno, c.codigo_contrato,
         coalesce(nullif(trim(cl.nome_fantasia), ''), nullif(trim(cl.razao_social), ''), nullif(trim(cl.nome_empresa), ''), 'Sem cliente'),
         coalesce(cl.uf, cl.estado),
         coalesce(c.status_contrato, 'Sem status'), c.assinado::text,
         c.objeto_contrato, c.especialidade_contrato, c.valor_estimado, c.data_inicio,
         case when ad.n > 0 then ad.fim else coalesce(c.data_termino, c.data_fim) end,
         exists (select 1 from contrato_anexos x where x.contrato_id = c.id),
         (select count(*)::int from contrato_itens i where i.contrato_id = c.id),
         ad.n
  from contratos c
  left join clientes cl on cl.id = c.cliente_id
  left join lateral (select count(*)::int n, max(a.data_termino) fim from contrato_aditivos_tempo a where a.contrato_id = c.id) ad on true
  order by c.id
$$;

-- Itens dos contratos ativos (para "quanto cobramos de X" e "quais contratos têm Y"). A busca sem acento é na edge.
create or replace function public.agente_contratos_itens()
returns table (id uuid, contrato_id uuid, codigo_interno integer, cliente text, item text, quantidade integer, valor_item numeric)
language sql stable security definer set search_path = public as $$
  select i.id, c.id, c.codigo_interno,
         coalesce(nullif(trim(cl.nome_fantasia), ''), nullif(trim(cl.razao_social), ''), nullif(trim(cl.nome_empresa), ''), 'Sem cliente'),
         i.item, i.quantidade, i.valor_item
  from contrato_itens i
  join contratos c on c.id = i.contrato_id and c.status_contrato = 'Ativo'
  left join clientes cl on cl.id = c.cliente_id
  order by i.id
$$;

revoke all on function public.agente_contratos_base() from public, anon, authenticated;
revoke all on function public.agente_contratos_itens() from public, anon, authenticated;
grant execute on function public.agente_contratos_base() to service_role;
grant execute on function public.agente_contratos_itens() to service_role;
