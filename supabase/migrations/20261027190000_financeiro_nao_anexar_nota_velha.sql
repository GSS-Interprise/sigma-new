-- Bug 27/10/2026 (Amni, Vitória): a importação do fechamento anexava sozinha nota fiscal que
-- estava parada na caixa de entrada havia um mês, de um fechamento anterior. O pagamento novo
-- aparecia como "recebido" sem a NF ter sido pedida (Diego Genelhu: "NF GSS agosto 2026.pdf",
-- chegada em 24/09, anexada em 27/10; em 23/10 o mesmo aconteceu com mais 5 médicos).
--
-- Regra nova: na importação só entra nota que chegou nos últimos 10 dias (o caso que a função
-- existe para cobrir é o médico mandar a NF poucos dias antes da importação). Nota mais velha
-- fica na caixa de entrada para a equipe vincular à mão.

create or replace function public.fin_vincular_notas_pendentes(p_mes int default null, p_ano int default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n record;
  pag record;
  vinculadas int := 0;
begin
  for n in
    select * from financeiro_nf_inbox
     where status = 'pendente' and medico_id is not null and arquivo_path is not null
       and confianca in ('forte', 'media')
       and recebido_em > now() - interval '10 days'
  loop
    pag := null;

    -- primeiro: pagamento pendente do médico com o mesmo valor da nota
    select p.* into pag from financeiro_pagamentos p
     where p.medico_id = n.medico_id and p.nf_status in ('nao_solicitada', 'solicitada')
       and (p_mes is null or (p.mes_referencia = p_mes and p.ano_referencia = p_ano))
       and n.valor_nota is not null and abs(p.valor_total - n.valor_nota) <= 1
     order by p.ano_referencia desc, p.mes_referencia desc limit 1;

    -- sinal forte e um único pagamento pendente: vincula mesmo sem o valor bater
    -- (a diferença fica registrada no motivo, para a conferência)
    if pag.id is null and n.confianca = 'forte' then
      select p.* into pag from financeiro_pagamentos p
       where p.medico_id = n.medico_id and p.nf_status in ('nao_solicitada', 'solicitada')
         and (p_mes is null or (p.mes_referencia = p_mes and p.ano_referencia = p_ano))
         and (select count(*) from financeiro_pagamentos q
               where q.medico_id = n.medico_id and q.nf_status in ('nao_solicitada', 'solicitada')) = 1
       limit 1;
    end if;

    continue when pag.id is null;

    update financeiro_nf_inbox
       set status = 'vinculada', pagamento_id = pag.id, vinculado_em = now(),
           motivo = coalesce(motivo, '') ||
             case when n.valor_nota is not null and abs(pag.valor_total - n.valor_nota) > 1
                  then ' · anexada na importação com valor diferente do a pagar'
                  else ' · anexada na importação do fechamento' end
     where id = n.id;

    insert into financeiro_anexos (pagamento_id, tipo, arquivo_path, arquivo_nome, mime, status)
    values (pag.id, 'nf', n.arquivo_path, n.arquivo_nome, n.mime, 'recebido');

    update financeiro_pagamentos
       set nf_status = 'recebida', nf_recebida_em = n.recebido_em, nf_arquivo_path = n.arquivo_path
     where id = pag.id;

    vinculadas := vinculadas + 1;
  end loop;
  return vinculadas;
end $$;

grant execute on function public.fin_vincular_notas_pendentes(int, int) to authenticated, service_role;

-- Desconsiderar a nota também tira o anexo dela da lista do pagamento. Antes o PDF velho
-- continuava em "Anexos" como recebido e confundia quem abria.
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
$$;

-- Limpeza dos 6 casos: tira das listas de anexos os PDFs velhos já descartados e marca como
-- descartada a nota velha da Mercia (a certa chegou em 27/10 e é a que está no pagamento).
delete from financeiro_anexos x
 using financeiro_nf_inbox i
 where i.arquivo_path = x.arquivo_path and i.pagamento_id = x.pagamento_id
   and i.motivo like '%anexada na importação%' and i.status = 'descartada' and x.tipo = 'nf';

update financeiro_nf_inbox i set status = 'descartada'
  from financeiro_pagamentos p
 where p.id = i.pagamento_id and i.motivo like '%anexada na importação%'
   and i.status = 'vinculada' and p.nf_arquivo_path is distinct from i.arquivo_path;

delete from financeiro_anexos x
 using financeiro_nf_inbox i
 where i.arquivo_path = x.arquivo_path and i.pagamento_id = x.pagamento_id
   and i.motivo like '%anexada na importação%' and i.status = 'descartada' and x.tipo = 'nf';
