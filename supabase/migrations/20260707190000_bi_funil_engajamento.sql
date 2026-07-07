-- BI Comercial (07/07): funil de engajamento por campanha + período. Conta os degraus
-- reais (frio → contatado → responderam → perfil IA → quente → convertido) pra o
-- storytelling "o que funciona / onde vaza". "convertido" = status já existente.
create or replace function public.get_bi_funil_engajamento(
  p_campanha_id uuid default null,
  p_data_ini date default null,
  p_data_fim date default null
) returns jsonb language sql stable security definer set search_path = public as $$
  with base as (
    select cl.lead_id, cl.status, cl.data_primeiro_contato
    from public.campanha_leads cl
    where (p_campanha_id is null or cl.campanha_id = p_campanha_id)
      and (p_data_ini is null or cl.created_at::date >= p_data_ini)
      and (p_data_fim is null or cl.created_at::date <= p_data_fim)
  )
  select jsonb_build_object(
    'na_campanha',  count(*),
    'frio',         count(*) filter (where status = 'frio'),
    'contatados',   count(*) filter (where status <> 'frio' or data_primeiro_contato is not null),
    'responderam',  count(*) filter (where status in ('em_conversa','quente','convertido')),
    'perfil_ia',    count(*) filter (where lead_id in (select lead_id from public.banco_interesse_leads)),
    'quente',       count(*) filter (where status in ('quente','convertido')),
    'convertido',   count(*) filter (where status = 'convertido'),
    'descartado',   count(*) filter (where status = 'descartado'),
    'sem_resposta', count(*) filter (where status = 'sem_resposta')
  )
  from base;
$$;

grant execute on function public.get_bi_funil_engajamento(uuid, date, date) to authenticated, service_role;
