-- Desconsiderar uma nota recebida (Mavi, 19/10). No teste, o médico mandou uma foto qualquer pelo WhatsApp e,
-- como havia pedido aberto para aquele número, o Sigma ligou a foto ao pagamento como "Recebida" (com o aviso
-- "conferir"). Não havia como desfazer pela tela. A função volta o médico para "aguardando nota", tira o
-- anexo do pagamento e marca a entrada da caixa de notas como descartada (o arquivo fica guardado).
-- Nota já lançada no Conta Azul não volta por aqui.
create or replace function public.financeiro_desconsiderar_nf(p_pagamento_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  p record;
begin
  if not exists (select 1 from user_roles r where r.user_id = auth.uid()
                  and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')) then
    raise exception 'sem_permissao';
  end if;
  select * into p from financeiro_pagamentos where id = p_pagamento_id for update;
  if not found then raise exception 'pagamento_nao_encontrado'; end if;
  if p.ca_evento_id is not null then raise exception 'ja_no_conta_azul'; end if;

  update financeiro_pagamentos set
    nf_status = case when nf_solicitada_em is not null then 'solicitada' else 'nao_solicitada' end,
    nf_recebida_em = null, nf_arquivo_path = null, nf_numero = null, nf_prestador_cnpj = null,
    nf_valor_bruto = null, nf_retencoes = null, nf_valor_liquido = null,
    nf_conferencia_status = null, nf_conferencia = null, nf_conferida_em = null, nf_aceita_por = null,
    updated_at = now()
  where id = p_pagamento_id;

  update financeiro_nf_inbox set status = 'descartada'
   where pagamento_id = p_pagamento_id and status = 'vinculada';

  return jsonb_build_object('nf_status', (select nf_status from financeiro_pagamentos where id = p_pagamento_id));
end;
$$;

revoke all on function public.financeiro_desconsiderar_nf(uuid) from public, anon;
grant execute on function public.financeiro_desconsiderar_nf(uuid) to authenticated, service_role;
