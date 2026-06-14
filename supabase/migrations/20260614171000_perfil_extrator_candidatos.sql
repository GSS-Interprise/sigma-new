-- Candidatos pra extração: leads com >=4 mensagens DO MÉDICO (role='medico') sem perfil ou stale.
create or replace function public.perfil_extrator_candidatos(p_limite int default 15, p_stale_dias int default 3)
returns table(lead_id uuid) language sql security definer set search_path to 'public' as $$
  select distinct cl.lead_id
  from campanha_leads cl
  left join banco_interesse_leads b on b.lead_id = cl.lead_id
  where cl.historico_conversa is not null
    and (select count(*) from jsonb_array_elements(coalesce(cl.historico_conversa,'[]'::jsonb)) h
         where h->>'role' in ('medico','lead','user')) >= 4
    and (b.lead_id is null or b.ultima_extracao_em is null
         or b.ultima_extracao_em < now() - (p_stale_dias || ' days')::interval)
  limit p_limite;
$$;
grant execute on function public.perfil_extrator_candidatos(int, int) to authenticated, service_role;
