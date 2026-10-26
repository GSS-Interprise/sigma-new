-- Médico em mais de um local (Amni, 26/10): a nota de um local caía no lançamento do outro e, para corrigir,
-- a equipe apagava a nota (desconsiderar) e anexava de novo; a cobrança automática do dia seguinte pedia a
-- nota outra vez ao médico.
--
-- financeiro_mover_nf: leva a nota (arquivo, número, valores e conferência) de um lançamento para outro do
-- MESMO médico que ainda está sem nota. O de origem volta para "aguardando nota" sem mandar mensagem nenhuma
-- (a última cobrança é marcada como agora, então a próxima só sai depois de 48h). Usada pela tela (mover à
-- mão) e pela conferência (quando o valor da nota bate com outro local do médico).

create or replace function public.financeiro_mover_nf(p_origem uuid, p_destino uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  o record; d record;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not exists (
    select 1 from user_roles r where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')
  ) then
    raise exception 'sem_permissao';
  end if;
  if p_origem = p_destino then raise exception 'mesmo_lancamento'; end if;

  select * into o from financeiro_pagamentos where id = p_origem for update;
  select * into d from financeiro_pagamentos where id = p_destino for update;
  if o.id is null or d.id is null then raise exception 'pagamento_nao_encontrado'; end if;
  if o.nf_arquivo_path is null then raise exception 'origem_sem_nota'; end if;
  if d.nf_arquivo_path is not null then raise exception 'destino_ja_tem_nota'; end if;
  if o.medico_id is null or o.medico_id is distinct from d.medico_id then raise exception 'medicos_diferentes'; end if;
  if o.ca_evento_id is not null or d.ca_evento_id is not null then raise exception 'ja_no_conta_azul'; end if;

  update financeiro_pagamentos set
    nf_status = 'recebida', nf_recebida_em = o.nf_recebida_em, nf_arquivo_path = o.nf_arquivo_path,
    nf_numero = o.nf_numero, nf_prestador_cnpj = o.nf_prestador_cnpj, nf_valor_bruto = o.nf_valor_bruto,
    nf_retencoes = o.nf_retencoes, nf_valor_liquido = o.nf_valor_liquido,
    -- a conferência é refeita para o lançamento novo (o valor esperado muda)
    nf_conferencia_status = null, nf_conferencia = null, nf_conferida_em = null, nf_aceita_por = null,
    updated_at = now()
  where id = p_destino;

  update financeiro_pagamentos set
    nf_status = case when nf_solicitada_em is not null then 'solicitada' else 'nao_solicitada' end,
    nf_recebida_em = null, nf_arquivo_path = null, nf_numero = null, nf_prestador_cnpj = null,
    nf_valor_bruto = null, nf_retencoes = null, nf_valor_liquido = null,
    nf_conferencia_status = null, nf_conferencia = null, nf_conferida_em = null, nf_aceita_por = null,
    nf_ultimo_lembrete_em = now(), updated_at = now()
  where id = p_origem;

  update financeiro_anexos set pagamento_id = p_destino
   where pagamento_id = p_origem and tipo = 'nf' and arquivo_path = o.nf_arquivo_path;
  update financeiro_nf_inbox set pagamento_id = p_destino
   where pagamento_id = p_origem and status = 'vinculada';
  update financeiro_nf_solicitacoes set status = 'recebida', recebida_em = coalesce(o.nf_recebida_em, now())
   where pagamento_id = p_destino and status = 'enviada';
  update financeiro_nf_solicitacoes set status = 'enviada', recebida_em = null
   where pagamento_id = p_origem and status = 'recebida';

  return jsonb_build_object('origem', p_origem, 'destino', p_destino);
end;
$$;

revoke all on function public.financeiro_mover_nf(uuid, uuid) from public, anon;
grant execute on function public.financeiro_mover_nf(uuid, uuid) to authenticated, service_role;

-- desconsiderar não pode virar cobrança no dia seguinte: a próxima só depois de 48h
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
    nf_ultimo_lembrete_em = now(), updated_at = now()
  where id = p_pagamento_id;

  update financeiro_nf_inbox set status = 'descartada'
   where pagamento_id = p_pagamento_id and status = 'vinculada';

  return jsonb_build_object('nf_status', (select nf_status from financeiro_pagamentos where id = p_pagamento_id));
end;
$$;
