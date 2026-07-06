-- T02 Módulo Financeiro (06/07): importação do relatório de produção (Consolidado -
-- Previsão da Mavi). O front parseia o xlsx (SheetJS) e manda as linhas; esta RPC
-- casa médico por CRM (dígitos + UF), grava a produção do mês em financeiro_pagamentos
-- (fonte='import') de forma idempotente (reprocessa o mês inteiro a cada import).

alter table public.financeiro_pagamentos
  add column if not exists setor text,
  add column if not exists fonte text not null default 'import',        -- import | drescala_api
  add column if not exists arquivo_origem text,
  add column if not exists valor_hora_est numeric,
  add column if not exists valor_fixo boolean not null default false;

create index if not exists idx_fin_pag_fonte on public.financeiro_pagamentos (fonte, ano_referencia, mes_referencia);

create or replace function public.importar_producao_financeiro(p_mes int, p_ano int, p_arquivo text, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_ins int := 0; v_cas int := 0;
  v_nao jsonb := '[]'::jsonb;
  r jsonb; v_medico uuid; v_digits text; v_uf text;
begin
  -- idempotente: recomeça o mês (só o que veio de import; não toca produção de API)
  delete from public.financeiro_pagamentos
   where fonte = 'import' and mes_referencia = p_mes and ano_referencia = p_ano;

  for r in select * from jsonb_array_elements(p_linhas) loop
    v_digits := regexp_replace(coalesce(r->>'crm',''), '[^0-9]', '', 'g');
    v_uf := upper(coalesce(substring(coalesce(r->>'crm','') from '([A-Za-z]{2})\s*$'), ''));
    v_medico := null;
    if v_digits <> '' then
      select id into v_medico from public.medicos m
        where regexp_replace(coalesce(m.crm,''), '[^0-9]', '', 'g') = v_digits
        order by (upper(coalesce(m.crm,'')) like '%' || v_uf || '%') desc nulls last
        limit 1;
    end if;

    insert into public.financeiro_pagamentos(
      profissional_nome, profissional_crm, medico_id, mes_referencia, ano_referencia,
      unidade, setor, total_plantoes, total_horas_minutos, valor_total, valor_hora_est,
      valor_fixo, status, fonte, arquivo_origem, gerado_por
    ) values (
      r->>'nome', r->>'crm', v_medico, p_mes, p_ano,
      nullif(btrim(coalesce(r->>'local','')), ''), nullif(btrim(coalesce(r->>'setor','')), ''),
      coalesce((r->>'plantoes')::int, 0), coalesce((r->>'horas_min')::int, 0),
      coalesce((r->>'valor_total')::numeric, 0), coalesce((r->>'valor_hora')::numeric, 0),
      coalesce((r->>'valor_fixo')::boolean, false), 'pendente', 'import', p_arquivo, v_uid
    );
    v_ins := v_ins + 1;
    if v_medico is not null then v_cas := v_cas + 1;
    else v_nao := v_nao || jsonb_build_object('nome', r->>'nome', 'crm', r->>'crm'); end if;
  end loop;

  return jsonb_build_object('inseridos', v_ins, 'casados', v_cas, 'nao_casados', v_nao);
end $fn$;

grant execute on function public.importar_producao_financeiro(int, int, text, jsonb) to authenticated, service_role;
grant select, insert, update, delete on public.financeiro_pagamentos to authenticated, service_role;
