-- Revisão 12/11 do Raio-X e do Resumo da campanha (crítica /impeccable do plano GSS dono no comando):
--  * campanha_painel_dono: interessados com a regra do Raio-X; motivos de falha completos (somam 'falharam').
--  * bi_raiox_gestao: 'falharam' com a regra do Resumo (antes 'nao_entregues' contava enviado sem recibo);
--    esperando resposta com os mais recentes primeiro; tempo da 1ª resposta só com resposta humana
--    (sent_by_user_id), porque a resposta automática da IA puxava a mediana para menos de 1 min.

-- Fase 6 do plano GSS dono no comando: resumo da campanha em linguagem de dono.
-- Revisão 12/11 (crítica /impeccable): interessados com a mesma regra do Raio-X; motivos de falha completos.
-- Funil: universo CFM → na lista → enviados → entregues → responderam → interessados → convertidos,
-- por número (WhatsApp) e por canal (e-mail). Objeções agrupadas chegam com a Fase 7.2
-- (conversa_classificacao); até lá o painel mostra as últimas respostas.

create or replace function public.campanha_painel_dono(p_campanha_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c record;
  v_universo bigint;
  v_funil jsonb;
  v_numeros jsonb;
  v_email jsonb;
  v_respostas jsonb;
  v_erros jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'authentication_required';
  end if;

  select id, nome, status::text as status, especialidade_ids, especialidade_id,
         coalesce(regiao_estados, case when regiao_estado is not null then array[regiao_estado] end) as ufs
    into v_c from campanhas where id = p_campanha_id;
  if v_c.id is null then raise exception 'campanha_nao_encontrada'; end if;

  -- Universo CFM só quando a campanha tem especialidade (lista importada sem especialidade não tem universo).
  begin
    if coalesce(cardinality(v_c.especialidade_ids), 0) > 0 or v_c.especialidade_id is not null then
      select coalesce((u ->> 'nas_ufs')::bigint, (u ->> 'brasil')::bigint) into v_universo
        from campanha_assistente_universo_cfm(
               coalesce(nullif(v_c.especialidade_ids, '{}'), array[v_c.especialidade_id]),
               coalesce(v_c.ufs, '{}'::text[])) u;
    end if;
  exception when others then v_universo := null;
  end;

  -- Um registro por médico: conta pelo melhor resultado (falhou e foi reenviado com sucesso = enviado).
  with por_lead as (
    select m.campanha_lead_id,
           min(m.sent_at) as primeiro_em,
           (array_agg(m.conversation_id order by m.sent_at))[1] as conversation_id,
           bool_and(m.message_status = 'failed') as so_falhou,
           bool_or(m.message_status in ('delivered', 'read')) as entregue
      from sigzap_messages m
      join campanha_leads cl on cl.id = m.campanha_lead_id and cl.campanha_id = p_campanha_id
     where m.from_me
     group by m.campanha_lead_id
  ),
  envio as (
    select p.*, sc.instance_id,
           case when p.so_falhou then 'failed' when p.entregue then 'delivered' else 'sent' end as message_status,
           exists (select 1 from sigzap_messages r
                    where r.conversation_id = p.conversation_id and not r.from_me and r.sent_at > p.primeiro_em) as respondeu
      from por_lead p
      left join sigzap_conversations sc on sc.id = p.conversation_id
  ),
  leads_c as (
    select cl.status::text as status,
           exists (select 1 from conversa_classificacao cc where cc.campanha_lead_id = cl.id and cc.resultado = 'interessado') as classificado_interessado
      from campanha_leads cl where cl.campanha_id = p_campanha_id
  )
  select jsonb_build_object(
           'universo_cfm', v_universo,
           'na_lista', (select count(*) from leads_c),
           'enviados', (select count(*) from envio where message_status is distinct from 'failed'),
           'entregues', (select count(*) from envio where message_status in ('delivered', 'read')),
           'responderam', (select count(*) from envio where respondeu),
           -- Mesma regra do Raio-X (bi_raiox_funil): status quente/convertido OU conversa classificada como interessado.
           'interessados', (select count(*) from leads_c where status in ('quente', 'convertido') or classificado_interessado),
           'convertidos', (select count(*) from leads_c where status = 'convertido'),
           'falharam', (select count(*) from envio where message_status = 'failed'),
           'sem_whatsapp', (select count(*) from leads_c where status = 'sem_whatsapp'),
           'aguardando_envio', (select count(*) from leads_c where status = 'frio'),
           'ultimo_envio', (select max(primeiro_em) from envio)),
         coalesce((
           select jsonb_agg(x order by x.enviados desc) from (
             select coalesce(i.phone_number, '(sem número)') as numero,
                    coalesce(cc.display_name, i.profile_name, i.name) as nome,
                    count(*) filter (where e.message_status is distinct from 'failed') as enviados,
                    count(*) filter (where e.message_status in ('delivered', 'read')) as entregues,
                    count(*) filter (where e.respondeu) as responderam,
                    count(*) filter (where e.message_status = 'failed') as falharam
               from envio e
               left join sigzap_instances i on i.id = e.instance_id
               left join whatsapp_chakra_connections cc on cc.phone_e164 = i.phone_number
              group by 1, 2) x), '[]'::jsonb)
    into v_funil, v_numeros;

  select case when count(*) = 0 then null else jsonb_build_object(
           'enviados', count(*) filter (where status not in ('na_fila', 'erro', 'pendente')),
           'entregues', count(*) filter (where entregue_em is not null),
           'abertos', count(*) filter (where aberto_em is not null),
           'cliques', count(*) filter (where clicado_em is not null)) end
    into v_email
    from email_envios where campanha_id = p_campanha_id;

  -- Últimas respostas dos médicos (texto), até a classificação de objeções existir.
  select coalesce(jsonb_agg(x order by x.em desc), '[]'::jsonb) into v_respostas from (
   select * from (
    select distinct on (sc.id) coalesce(l.nome, ct.contact_name) as nome, r.message_text as texto, r.sent_at as em
      from sigzap_messages m
      join campanha_leads cl on cl.id = m.campanha_lead_id and cl.campanha_id = p_campanha_id
      join sigzap_conversations sc on sc.id = m.conversation_id
      join sigzap_messages r on r.conversation_id = sc.id and not r.from_me and r.sent_at > m.sent_at
      left join leads l on l.id = cl.lead_id
      left join sigzap_contacts ct on ct.id = sc.contact_id
     where m.from_me and coalesce(trim(r.message_text), '') <> ''
     order by sc.id, r.sent_at desc
   ) d order by d.em desc limit 8
  ) x;

  -- Motivo das falhas de envio (o dono precisa saber se é número sem WhatsApp ou bloqueio da Meta).
  -- Um motivo por médico (a última falha) e todos os motivos: a soma bate com 'falharam' do funil.
  -- O texto em português de dono é montado na tela (motivoLegivel, PainelDonoCampanha.tsx).
  select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) into v_erros from (
    select motivo, count(*) as n from (
      select distinct on (m.campanha_lead_id)
             coalesce(nullif(m.provider_error_message, ''), m.provider_error_code, 'sem detalhe') as motivo
        from sigzap_messages m
        join campanha_leads cl on cl.id = m.campanha_lead_id and cl.campanha_id = p_campanha_id
       where m.from_me and m.message_status = 'failed'
         and not exists (select 1 from sigzap_messages ok
                          where ok.campanha_lead_id = m.campanha_lead_id and ok.from_me and ok.message_status <> 'failed')
       order by m.campanha_lead_id, m.sent_at desc) u
     group by 1) x;

  return jsonb_build_object(
    'campanha', jsonb_build_object('id', v_c.id, 'nome', v_c.nome, 'status', v_c.status),
    'funil', v_funil, 'numeros', v_numeros, 'email', v_email, 'respostas', v_respostas, 'erros', v_erros,
    'objecoes', null);
end;
$$;

revoke all on function public.campanha_painel_dono(uuid) from public, anon;
grant execute on function public.campanha_painel_dono(uuid) to authenticated, service_role;

-- Modo gestão (só GSS): médicos esperando resposta nossa, tempo da 1ª resposta, por campanha.
create or replace function public.bi_raiox_gestao(p_especialidade_ids uuid[], p_ufs text[] default null, p_desde date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'authentication_required'; end if;

  with c as (select * from _raiox_contatos(p_especialidade_ids, p_ufs, p_desde)),
  esperando as (
    select c.* from c
     where c.respondeu and c.ultima_do_medico < now() - interval '2 hours'
       and (c.ultima_nossa is null or c.ultima_nossa < c.ultima_do_medico)
  ),
  primeira_resposta as (
    select c.campanha_lead_id,
           (select min(x.sent_at) from sigzap_messages x
             where x.conversation_id = c.conversation_id and not x.from_me and x.sent_at > c.primeiro_em) as medico_em
      from c where c.respondeu
  ),
  tempo as (
    select extract(epoch from (
             (select min(x.sent_at) from sigzap_messages x
               where x.conversation_id = cc.conversation_id and x.from_me and x.sent_at > p.medico_em
               and x.sent_by_user_id is not null) - p.medico_em)) / 60 as minutos
      from primeira_resposta p join c cc on cc.campanha_lead_id = p.campanha_lead_id
  )
  select jsonb_build_object(
    'esperando_resposta', (select count(*) from esperando),
    'esperando', coalesce((
      select jsonb_agg(x order by x.ultima_do_medico desc) from (
        select e.conversation_id, e.ultima_do_medico, coalesce(l.nome, 'Sem nome') as nome, ca.nome as campanha
          from esperando e left join leads l on l.id = e.lead_id left join campanhas ca on ca.id = e.campanha_id
         order by e.ultima_do_medico desc limit 20) x), '[]'::jsonb),
    'mediana_primeira_resposta_min', (select round(percentile_cont(0.5) within group (order by minutos)::numeric) from tempo where minutos is not null),
    'sem_resposta_nossa', (select count(*) from tempo where minutos is null),
    'por_campanha', coalesce((
      select jsonb_agg(x order by x.alcancados desc) from (
        select ca.id, ca.nome, count(*) filter (where c.entregue) as alcancados,
               count(*) filter (where c.respondeu) as responderam,
               count(*) filter (where f.so_falhou) as falharam
          from c join campanhas ca on ca.id = c.campanha_id
          -- Mesma regra do Resumo da campanha: falhou = todas as mensagens do médico falharam.
          left join lateral (select bool_and(m.message_status = 'failed') as so_falhou from sigzap_messages m
                              where m.campanha_lead_id = c.campanha_lead_id and m.from_me) f on true
         group by 1, 2) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

revoke all on function public.bi_raiox_gestao(uuid[], text[], date) from public, anon;
grant execute on function public.bi_raiox_gestao(uuid[], text[], date) to authenticated, service_role;
