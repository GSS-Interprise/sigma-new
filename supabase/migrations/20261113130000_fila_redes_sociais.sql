-- Fase 9.3 do plano do Maikon: fila do dia de LinkedIn e Instagram (modo assistido). A pessoa abre o perfil,
-- cola o texto pronto e marca "feito"; cada ação vira um toque em campanha_toques e entra na linha do tempo do lead.
-- Quando houver conta conectada pela Unipile, o mesmo toque passa a ser enviado pelo motor (modo automatico).

-- Fila: leads de campanhas ativas com perfil achado na rede e sem toque nela ainda. Quem respondeu vem primeiro.
create or replace function public.fila_redes_do_dia(p_canal text, p_limite int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'authentication_required'; end if;
  if p_canal not in ('linkedin', 'instagram') then raise exception 'canal_invalido'; end if;

  select jsonb_build_object(
    'feitos_hoje', (select count(*) from campanha_toques t where t.canal = p_canal and t.status = 'feito'
                     and t.executado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'meus_hoje', (select count(*) from campanha_toques t where t.canal = p_canal and t.status = 'feito' and t.executado_por = auth.uid()
                     and t.executado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'com_perfil', (select count(distinct cl.id) from campanha_leads cl join leads l on l.id = cl.lead_id join campanhas c on c.id = cl.campanha_id
                     where c.status = 'ativa' and cl.status in ('quente', 'em_conversa', 'contatado')
                       and case when p_canal = 'linkedin' then l.linkedin_url is not null else l.instagram_handle is not null end),
    'sem_busca', (select count(distinct cl.id) from campanha_leads cl join leads l on l.id = cl.lead_id join campanhas c on c.id = cl.campanha_id
                     where c.status = 'ativa' and cl.status in ('quente', 'em_conversa') and l.redes_buscado_em is null),
    'itens', coalesce((select jsonb_agg(x order by x.prioridade, x.ultima desc nulls last) from (
      select cl.id as campanha_lead_id, cl.campanha_id, c.nome as campanha, cl.status, l.id as lead_id, l.nome, l.especialidade,
             l.cidade, l.uf, c.briefing_ia->>'cidade' as cidade_vaga, c.briefing_ia->>'nome_servico' as servico,
             case when p_canal = 'linkedin' then l.linkedin_url else 'https://www.instagram.com/' || l.instagram_handle || '/' end as url_perfil,
             case when p_canal = 'linkedin' then l.linkedin_confianca else l.instagram_confianca end as confianca,
             case cl.status when 'quente' then 0 when 'em_conversa' then 1 else 2 end as prioridade,
             cl.data_ultimo_contato as ultima
        from campanha_leads cl
        join leads l on l.id = cl.lead_id
        join campanhas c on c.id = cl.campanha_id
       where c.status = 'ativa'
         and cl.status in ('quente', 'em_conversa', 'contatado')
         and coalesce(l.opt_out, false) = false and l.merged_into_id is null
         and case when p_canal = 'linkedin' then l.linkedin_url is not null else l.instagram_handle is not null end
         and not exists (select 1 from campanha_toques t where t.campanha_lead_id = cl.id and t.canal = p_canal
                          and t.status in ('feito', 'respondido', 'pulado'))
       order by 13, 14 desc nulls last
       limit greatest(1, least(coalesce(p_limite, 30), 100))) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function public.fila_redes_do_dia(text, int) from public, anon;
grant execute on function public.fila_redes_do_dia(text, int) to authenticated, service_role;

-- Registra o toque feito (ou pulado) e deixa na linha do tempo do lead.
create or replace function public.fila_redes_registrar(p_campanha_lead_id uuid, p_canal text, p_status text, p_texto text default null, p_url text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_lead uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_canal not in ('linkedin', 'instagram') or p_status not in ('feito', 'pulado') then raise exception 'parametro_invalido'; end if;
  select lead_id into v_lead from campanha_leads where id = p_campanha_lead_id;
  if v_lead is null then raise exception 'lead_nao_encontrado'; end if;
  insert into campanha_toques (campanha_lead_id, canal, tipo, status, texto_sugerido, url_perfil, modo, executado_por, executado_em)
  values (p_campanha_lead_id, p_canal, case when p_canal = 'linkedin' then 'conexao' else 'dm' end, p_status,
          p_texto, p_url, 'assistido', auth.uid(), now())
  returning id into v_id;
  if p_status = 'feito' then
    insert into lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
    values (v_lead, 'outro',
            case when p_canal = 'linkedin' then 'Convite enviado no LinkedIn' else 'Mensagem enviada no Instagram' end,
            jsonb_build_object('tipo', 'toque_rede', 'canal', p_canal, 'campanha_lead_id', p_campanha_lead_id, 'toque_id', v_id));
  end if;
  return v_id;
end;
$$;
revoke all on function public.fila_redes_registrar(uuid, text, text, text, text) from public, anon;
grant execute on function public.fila_redes_registrar(uuid, text, text, text, text) to authenticated, service_role;
