-- T08 (fechamento) Módulo Financeiro — contas a RECEBER: rateio mensal + fluxo
-- faturado→recebido + aviso de contrato novo a faturar.
--
-- (a) RATEIO: o valor_previsto passa a ser o valor MENSAL rateado (valor_estimado do
--     contrato ÷ prazo_meses), não mais o total do contrato. Fallback: se prazo_meses
--     for nulo/0, usa o valor_estimado cheio e marca regra_rateio='total' (revisar à mão).
--     O rateio é linear — para contratos por hora/produção é uma PREVISÃO; a coluna
--     valor_faturado (editável) recebe o valor real na hora de faturar.
-- (b) FLUXO: colunas já existem (status, valor_faturado, nf_saida_status). Sem DDL de fluxo.
-- (c) AVISO: cron mensal (dia 25) roda o sync do mês corrente e, se entrar contrato novo,
--     notifica diretoria/gestor_financeiro via system_notifications.

alter table public.financeiro_receber
  add column if not exists valor_contrato_total numeric,     -- referência (total do contrato)
  add column if not exists prazo_meses int,                  -- referência (nº de meses)
  add column if not exists regra_rateio text default 'linear'; -- linear | total | manual

-- Sync com rateio mensal (UPSERT). Insere contratos novos e ATUALIZA os valores dos
-- existentes (quando o contrato muda), mas PRESERVA linhas editadas à mão (regra_rateio
-- 'manual') e linhas que já saíram de 'a_faturar' (faturado/recebido). Distingue inserts
-- reais de updates via (xmax = 0) para o alerta não notificar à toa.
create or replace function public.sync_financeiro_receber(p_mes int, p_ano int)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_novos int := 0;
  v_total int := 0;
  v_ini date := make_date(p_ano, p_mes, 1);
  v_fim date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
begin
  with up as (
    insert into public.financeiro_receber(
      contrato_id, cliente_id, mes_referencia, ano_referencia, descricao, condicao_pagamento,
      valor_previsto, valor_contrato_total, prazo_meses, regra_rateio, data_prevista, fonte)
    select c.id, c.cliente_id, p_mes, p_ano,
      coalesce('Contrato ' || c.codigo_contrato, 'Contrato') || coalesce(' — ' || nullif(cl.nome_fantasia, ''), coalesce(' — ' || nullif(cl.nome_empresa, ''), '')),
      c.condicao_pagamento,
      case when coalesce(c.prazo_meses, 0) > 0
           then round(coalesce(c.valor_estimado, 0) / c.prazo_meses, 2)
           else coalesce(c.valor_estimado, 0) end,
      c.valor_estimado,
      c.prazo_meses,
      case when coalesce(c.prazo_meses, 0) > 0 then 'linear' else 'total' end,
      v_fim, 'contrato'
    from public.contratos c
    left join public.clientes cl on cl.id = c.cliente_id
    where c.status_contrato = 'Ativo'
      and c.data_inicio <= v_fim
      and (c.data_fim is null or c.data_fim >= v_ini)
      and (c.data_termino is null or c.data_termino >= v_ini)
    on conflict (contrato_id, mes_referencia, ano_referencia) do update set
      valor_contrato_total = excluded.valor_contrato_total,
      prazo_meses = excluded.prazo_meses,
      valor_previsto = excluded.valor_previsto,
      regra_rateio = excluded.regra_rateio,
      condicao_pagamento = excluded.condicao_pagamento,
      descricao = excluded.descricao,
      updated_at = now()
    where financeiro_receber.regra_rateio is distinct from 'manual'
      and financeiro_receber.status = 'a_faturar'
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) into v_novos, v_total from up;
  return jsonb_build_object('inseridos', v_novos, 'processados', v_total, 'competencia', to_char(v_ini, 'MM/YYYY'));
end $fn$;

grant execute on function public.sync_financeiro_receber(int, int) to authenticated, service_role;

-- (b) Aviso de contrato novo a faturar. Roda o sync do mês corrente e, se entrar algo novo,
-- notifica quem é diretoria/gestor_financeiro/admin. Idempotente (sync não duplica).
create or replace function public.financeiro_receber_alerta()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_mes int := extract(month from current_date)::int;
  v_ano int := extract(year from current_date)::int;
  v_res jsonb;
  v_novos int;
begin
  v_res := public.sync_financeiro_receber(v_mes, v_ano);
  v_novos := coalesce((v_res->>'inseridos')::int, 0);
  if v_novos > 0 then
    insert into public.system_notifications (user_id, tipo, titulo, mensagem, link)
    select distinct ur.user_id, 'financeiro',
      'Contratos a faturar',
      v_novos || ' contrato(s) novo(s) a faturar na competência ' || (v_res->>'competencia') || '.',
      '/financeiro'
    from public.user_roles ur
    where ur.role in ('diretoria','gestor_financeiro','admin');
  end if;
  return jsonb_build_object('novos', v_novos, 'competencia', v_res->>'competencia');
end $fn$;

grant execute on function public.financeiro_receber_alerta() to service_role;

-- cron dia 25 às 12:00 (janela de fechamento). Reagenda de forma idempotente.
do $cron$
begin
  perform cron.unschedule('financeiro-receber-alerta-mensal');
exception when others then null;
end $cron$;
select cron.schedule('financeiro-receber-alerta-mensal', '0 12 25 * *',
  $c$ select public.financeiro_receber_alerta(); $c$);

-- As linhas geradas ANTES deste rateio (valor = total do contrato) são corrigidas ao
-- rodar o próprio sync (agora upsert): select public.sync_financeiro_receber(<mes>,<ano>).
