-- A nota chega antes do fechamento (27/09): das 25 notas recebidas pelo WhatsApp, o médico
-- foi identificado em 22, mas só uma tinha pagamento no Sigma — os fechamentos daqueles
-- médicos ainda não tinham sido importados. Esta função fecha o ciclo: rodada ao fim de
-- cada importação, anexa as notas que estavam esperando o pagamento aparecer.
--
-- Mesma régua do recebimento: identificação forte vincula; média só com valor batendo.

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
