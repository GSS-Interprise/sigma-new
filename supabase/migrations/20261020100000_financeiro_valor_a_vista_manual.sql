-- "Já pago à vista" editável na tela do médico (Mavi, 20/10). O à vista só vinha da planilha (coluna
-- "À Vista" do consolidado do Dr. Escala); a equipe só renomeia o relatório antes de importar e lançava o
-- à vista como ajuste, que caía na coluna Ajustes. A função grava o valor, estima as horas à vista na
-- proporção (sem o detalhe do plantão não dá para saber quais horas foram) e recalcula o a pagar.
-- Pagamento aprovado ou pago não muda.
create or replace function public.financeiro_atualizar_a_vista(p_pagamento_id uuid, p_valor numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  p record;
  v numeric := round(coalesce(p_valor, 0), 2);
begin
  if not exists (select 1 from user_roles r where r.user_id = auth.uid()
                  and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')) then
    raise exception 'sem_permissao';
  end if;
  select * into p from financeiro_pagamentos where id = p_pagamento_id for update;
  if not found then raise exception 'pagamento_nao_encontrado'; end if;
  if p.status in ('aprovado', 'pago') then raise exception 'pagamento_bloqueado'; end if;
  if v < 0 then raise exception 'valor_invalido'; end if;
  if coalesce(p.valor_produzido, 0) > 0 and v > p.valor_produzido then raise exception 'maior_que_produzido'; end if;

  update financeiro_pagamentos set
    valor_a_vista = v,
    horas_a_vista_minutos = case when coalesce(valor_produzido, 0) > 0
      then round(coalesce(total_horas_minutos, 0) * v / valor_produzido) else coalesce(horas_a_vista_minutos, 0) end,
    updated_at = now()
  where id = p_pagamento_id;

  perform public.fin_recalc_pagamento(p_pagamento_id);
  return (select jsonb_build_object('valor_a_vista', valor_a_vista, 'valor_total', valor_total)
            from financeiro_pagamentos where id = p_pagamento_id);
end;
$$;

revoke all on function public.financeiro_atualizar_a_vista(uuid, numeric) from public, anon;
grant execute on function public.financeiro_atualizar_a_vista(uuid, numeric) to authenticated, service_role;
