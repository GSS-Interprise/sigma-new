-- Recebimento e painéis do financeiro (13/10).
-- 1) Recebimento de verdade: até aqui "recebido" era só um rótulo, sem data nem valor.
-- 2) Em aberto por cliente: junta as notas emitidas que entraram no Sigma com o que o Conta Azul
--    ainda mostra sem baixa (as receitas lançadas lá até fev/2026).
-- 3) Painéis: despesa, receita e previsão de caixa calculados no banco a partir do espelho do
--    Conta Azul (mais de 15 mil lançamentos: somar na tela esbarraria no limite de 1000 linhas).

alter table public.financeiro_nf_emitidas
  add column if not exists valor_recebido numeric(14,2),
  add column if not exists recebido_por   uuid;
alter table public.financeiro_receber
  add column if not exists data_recebimento date,
  add column if not exists valor_recebido   numeric(14,2);

create or replace function public.fin_pode_ver_financeiro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles r where r.user_id = auth.uid()
                 and r.role::text in ('admin', 'gestor_financeiro', 'diretoria'));
$$;

-- Uma linha por título em aberto. 'sigma' = nota emitida enviada ao Sigma e ainda não recebida;
-- 'conta_azul' = conta a receber do Conta Azul com saldo. Nota que o Sigma lançou no Conta Azul
-- aparece só como 'sigma' (mesmo valor e vencimento), para não contar duas vezes.
create or replace function public.fin_receber_em_aberto()
returns table (origem text, ref text, cliente text, cliente_id uuid, descricao text, vencimento date,
               valor numeric, situacao text, competencia date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fin_pode_ver_financeiro() then raise exception 'sem permissão'; end if;
  return query
  select 'sigma'::text, n.id::text, coalesce(c.nome_empresa, n.tomador_nome)::text, n.cliente_id,
         ('NF ' || coalesce(n.numero_nota, 's/ nº'))::text, n.vencimento,
         coalesce(n.valor_liquido, n.valor_bruto), 'nota emitida'::text, n.competencia
    from financeiro_nf_emitidas n left join clientes c on c.id = n.cliente_id
   where n.status in ('lida', 'conferir', 'vinculada', 'lancada') and coalesce(n.valor_liquido, n.valor_bruto, 0) > 0
  union all
  select 'conta_azul'::text, l.ca_id, coalesce(c.nome_empresa, l.pessoa_nome)::text, c.id,
         l.descricao::text, l.data_vencimento, l.nao_pago,
         case when l.status = 'PARTIAL' then 'saldo de recebimento parcial' else 'sem baixa' end, l.data_competencia
    from contaazul_lancamentos l
    left join contaazul_cache p on p.tipo = 'pessoa' and p.ca_id = l.pessoa_id
    left join lateral (select cl.id, cl.nome_empresa from clientes cl
                        where length(regexp_replace(coalesce(p.dados->>'documento', ''), '\D', '', 'g')) = 14
                          and regexp_replace(coalesce(cl.cnpj, ''), '\D', '', 'g') = regexp_replace(p.dados->>'documento', '\D', '', 'g')
                        limit 1) c on true
   where l.tipo = 'RECEITA' and l.status in ('OVERDUE', 'PARTIAL', 'PENDING') and coalesce(l.nao_pago, 0) > 0
     and not exists (select 1 from financeiro_nf_emitidas n2
                      where n2.ca_evento_id is not null and n2.vencimento = l.data_vencimento
                        and round(coalesce(n2.valor_liquido, n2.valor_bruto), 2) = round(l.total, 2));
end $$;

-- Painel do Conta Azul: tudo em um retorno, por período de competência.
create or replace function public.fin_painel_conta_azul(_de date, _ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not fin_pode_ver_financeiro() then raise exception 'sem permissão'; end if;
  with base as (
    select tipo, status, total, pago, nao_pago, data_competencia, data_vencimento,
           coalesce(nullif(trim(categoria_nome), ''), '(sem categoria)') categoria,
           coalesce(nullif(trim(centro_custo_nome), ''), '(sem centro de custo)') centro,
           coalesce(nullif(trim(pessoa_nome), ''), '(sem nome)') pessoa
      from contaazul_lancamentos
  ), per as (select * from base where data_competencia between _de and _ate and status <> 'LOST')
  select jsonb_build_object(
    'mensal', (select coalesce(jsonb_agg(x order by x.mes), '[]') from (
        select to_char(data_competencia, 'YYYY-MM') mes,
               round(sum(total) filter (where tipo = 'DESPESA'), 2) despesa,
               round(sum(total) filter (where tipo = 'DESPESA' and categoria ilike 'MED%'), 2) despesa_medicos,
               round(sum(total) filter (where tipo = 'RECEITA'), 2) receita
          from per group by 1) x),
    'categorias', (select coalesce(jsonb_agg(x), '[]') from (
        select categoria nome, round(sum(total), 2) valor, count(*) n from per where tipo = 'DESPESA' group by 1 order by 2 desc limit 25) x),
    'centros', (select coalesce(jsonb_agg(x), '[]') from (
        select centro nome, round(sum(total), 2) valor, count(*) n from per where tipo = 'DESPESA' group by 1 order by 2 desc limit 25) x),
    'fornecedores', (select coalesce(jsonb_agg(x), '[]') from (
        select pessoa nome, round(sum(total), 2) valor, count(*) n from per where tipo = 'DESPESA' group by 1 order by 2 desc limit 25) x),
    'clientes', (select coalesce(jsonb_agg(x), '[]') from (
        select pessoa nome, round(sum(total), 2) valor, count(*) n from per where tipo = 'RECEITA' group by 1 order by 2 desc limit 25) x),
    'totais', (select jsonb_build_object(
        'despesa', coalesce(round(sum(total) filter (where tipo = 'DESPESA'), 2), 0),
        'despesa_medicos', coalesce(round(sum(total) filter (where tipo = 'DESPESA' and categoria ilike 'MED%'), 2), 0),
        'receita', coalesce(round(sum(total) filter (where tipo = 'RECEITA'), 2), 0)) from per),
    'perdas', (select coalesce(round(sum(total), 2), 0) from base where tipo = 'RECEITA' and status = 'LOST' and data_competencia between _de and _ate),
    -- caixa: o que vence nas próximas 8 semanas e o que já venceu sem baixa (não depende do período)
    'caixa', (select coalesce(jsonb_agg(x order by x.semana), '[]') from (
        select date_trunc('week', data_vencimento)::date semana,
               coalesce(round(sum(nao_pago) filter (where tipo = 'DESPESA'), 2), 0) a_pagar,
               coalesce(round(sum(nao_pago) filter (where tipo = 'RECEITA'), 2), 0) a_receber
          from base where status in ('PENDING', 'OVERDUE', 'PARTIAL') and nao_pago > 0
           and data_vencimento >= date_trunc('week', hoje)::date and data_vencimento < date_trunc('week', hoje)::date + 56
         group by 1) x),
    'vencido', (select jsonb_build_object(
        'a_pagar', coalesce(round(sum(nao_pago) filter (where tipo = 'DESPESA'), 2), 0),
        'a_pagar_n', count(*) filter (where tipo = 'DESPESA'),
        'a_receber', coalesce(round(sum(nao_pago) filter (where tipo = 'RECEITA'), 2), 0),
        'a_receber_n', count(*) filter (where tipo = 'RECEITA'))
      from base where status in ('PENDING', 'OVERDUE', 'PARTIAL') and nao_pago > 0 and data_vencimento < hoje),
    'ultima_receita', (select max(data_competencia) from base where tipo = 'RECEITA'),
    'ultima_despesa', (select max(data_competencia) from base where tipo = 'DESPESA' and data_competencia <= hoje),
    'sincronizado_em', (select max(sincronizado_em) from contaazul_lancamentos)
  ) into r;
  return r;
end $$;

revoke all on function public.fin_receber_em_aberto() from public, anon;
revoke all on function public.fin_painel_conta_azul(date, date) from public, anon;
revoke all on function public.fin_pode_ver_financeiro() from public, anon;
grant execute on function public.fin_receber_em_aberto() to authenticated, service_role;
grant execute on function public.fin_painel_conta_azul(date, date) to authenticated, service_role;
grant execute on function public.fin_pode_ver_financeiro() to authenticated, service_role;
