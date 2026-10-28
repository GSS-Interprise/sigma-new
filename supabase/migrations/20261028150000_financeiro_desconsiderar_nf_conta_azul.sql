-- Pedido da Amni (28/10/2026): tirar um arquivo que entrou errado como nota. A trava para pagamento
-- já lançado no Conta Azul saiu: a equipe lança antes de a nota chegar (105 de 106 em setembro), então
-- o botão nunca aparecia. O lançamento lá só guarda o número da nota na descrição; a tela avisa para
-- ajustar. O link que vai para o Conta Azul abre sempre a nota atual do pagamento.
CREATE OR REPLACE FUNCTION public.financeiro_desconsiderar_nf(p_pagamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p record;
begin
  if not exists (select 1 from user_roles r where r.user_id = auth.uid()
                  and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')) then
    raise exception 'sem_permissao';
  end if;
  select * into p from financeiro_pagamentos where id = p_pagamento_id for update;
  if not found then raise exception 'pagamento_nao_encontrado'; end if;

  if p.nf_arquivo_path is not null then
    delete from financeiro_anexos
     where pagamento_id = p_pagamento_id and tipo = 'nf' and arquivo_path = p.nf_arquivo_path;
  end if;

  update financeiro_pagamentos set
    nf_status = case when nf_solicitada_em is not null then 'solicitada' else 'nao_solicitada' end,
    nf_recebida_em = null, nf_arquivo_path = null, nf_numero = null, nf_prestador_cnpj = null,
    nf_valor_bruto = null, nf_retencoes = null, nf_valor_liquido = null,
    nf_conferencia_status = null, nf_conferencia = null, nf_conferida_em = null, nf_aceita_por = null,
    nf_ultimo_lembrete_em = now(), updated_at = now()
  where id = p_pagamento_id;

  update financeiro_nf_inbox set status = 'descartada'
   where pagamento_id = p_pagamento_id and status = 'vinculada';

  return jsonb_build_object('nf_status', (select nf_status from financeiro_pagamentos where id = p_pagamento_id));
end;
$function$;
