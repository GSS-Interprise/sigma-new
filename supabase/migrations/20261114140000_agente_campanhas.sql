-- Protocolo do agente do Sigma, T7: domínio "campanhas" (docs/arquitetura/protocolo-agente-sigma.md §3i).
-- O funil de uma campanha vem da MESMA RPC do Resumo da campanha (campanha_painel_dono). Aqui ficam só os dois
-- recortes que nenhuma tela entrega pronto, com as mesmas regras dela:
--   - disparos de um dia: médico conta no dia do PRIMEIRO envio da campanha para ele (min(sent_at), como o painel);
--     "falhou" = todas as tentativas para ele falharam (bool_and), como o painel;
--   - etapas do Kanban de acompanhamento: etapa_crm de vw_acompanhamento_kanban, a mesma da tela.
-- Só a edge (service_role) chama. Teste: supabase/tests/agente_acessos.sql (bloco 7).

create or replace function public.agente_campanhas_disparos_dia(p_dia date)
returns table (campanha_id uuid, campanha text, status text, tipo_envio text, enviados bigint, falharam bigint)
language sql
stable
security definer
set search_path = public
as $$
  with dia as (
    -- Janela do dia em hora de Brasília.
    select (p_dia::timestamp at time zone 'America/Sao_Paulo') as ini,
           ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
  ),
  candidatos as (
    select distinct m.campanha_lead_id
      from sigzap_messages m, dia
     where m.from_me and m.campanha_lead_id is not null and m.sent_at >= dia.ini and m.sent_at < dia.fim
  ),
  por_lead as (
    select m.campanha_lead_id, min(m.sent_at) as primeiro_em, bool_and(m.message_status = 'failed') as so_falhou
      from sigzap_messages m
      join candidatos c on c.campanha_lead_id = m.campanha_lead_id
     where m.from_me
     group by m.campanha_lead_id
  )
  select ca.id, ca.nome, ca.status::text, ca.tipo_envio,
         count(*) filter (where not p.so_falhou), count(*) filter (where p.so_falhou)
    from por_lead p
    join campanha_leads cl on cl.id = p.campanha_lead_id
    join campanhas ca on ca.id = cl.campanha_id
    cross join dia
   where p.primeiro_em >= dia.ini and p.primeiro_em < dia.fim
   group by ca.id, ca.nome, ca.status, ca.tipo_envio
   order by 5 desc, 2, 1;
$$;
revoke all on function public.agente_campanhas_disparos_dia(date) from public, anon, authenticated;
grant execute on function public.agente_campanhas_disparos_dia(date) to service_role;

create or replace function public.agente_campanhas_etapas(p_campanha uuid default null)
returns table (etapa text, medicos bigint)
language sql
stable
security definer
set search_path = public
as $$
  select k.etapa_crm, count(*)
    from vw_acompanhamento_kanban k
   where p_campanha is null or k.campanha_id = p_campanha
   group by k.etapa_crm;
$$;
revoke all on function public.agente_campanhas_etapas(uuid) from public, anon, authenticated;
grant execute on function public.agente_campanhas_etapas(uuid) to service_role;
