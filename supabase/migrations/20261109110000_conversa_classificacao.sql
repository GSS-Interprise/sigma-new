-- Fase 7.2 do plano GSS dono no comando: classificação das conversas de campanha pela IA.
-- Spec: docs/arquitetura/bi-raio-x-mercado-medico.md, seções 3 e 6.
-- Uma linha por campanha_lead (a conversa daquele médico naquela campanha). A edge
-- conversas-classificar reclassifica quando o médico manda mensagem nova (mensagens_ate).

create table if not exists public.conversa_classificacao (
  id uuid primary key default gen_random_uuid(),
  campanha_lead_id uuid not null unique references public.campanha_leads(id) on delete cascade,
  lead_id uuid,
  campanha_id uuid,
  especialidade_id uuid,
  resultado text not null check (resultado in
    ('interessado', 'objecao', 'sem_interesse', 'filtro_secretaria', 'indicacao', 'contato_errado', 'fora_do_perfil', 'desconfianca')),
  objecao text check (objecao in ('distancia', 'agenda', 'valor', 'modelo_trabalho', 'so_remoto', 'estrutura', 'outro')),
  objecao_detalhe text,
  valor_pedido numeric,
  valor_unidade text check (valor_unidade in ('plantao_12h', 'plantao_24h', 'hora', 'exame', 'mes')),
  cidade_medico text,
  uf_medico text,
  disponibilidade text,
  trecho text,
  confianca numeric,
  modelo text,
  mensagens_ate timestamptz not null,
  classificado_em timestamptz not null default now()
);
create index if not exists conversa_classificacao_esp on public.conversa_classificacao (especialidade_id, resultado);
create index if not exists conversa_classificacao_campanha on public.conversa_classificacao (campanha_id);

alter table public.conversa_classificacao enable row level security;
drop policy if exists conversa_classificacao_ler on public.conversa_classificacao;
create policy conversa_classificacao_ler on public.conversa_classificacao
  for select to authenticated using (true);
grant select on public.conversa_classificacao to authenticated;
grant all on public.conversa_classificacao to service_role;

-- Fila: conversas de campanha em que o médico respondeu depois do 1º envio e que ainda
-- não foram classificadas (ou o médico falou de novo depois da última classificação).
-- Devolve o texto pronto (últimas 30 mensagens com texto, 500 caracteres cada) para a edge.
create or replace function public.conversas_classificar_pendentes(p_limite int default 50)
returns table (
  campanha_lead_id uuid, lead_id uuid, campanha_id uuid, especialidade_id uuid,
  ultima_do_medico timestamptz, conversa text
)
language sql
stable
security definer
set search_path = public
as $$
  with primeiro as (
    select m.campanha_lead_id, min(m.sent_at) as em,
           (array_agg(m.conversation_id order by m.sent_at))[1] as conversation_id
      from sigzap_messages m
     where m.from_me and m.campanha_lead_id is not null and m.conversation_id is not null
     group by m.campanha_lead_id
  ),
  respondeu as (
    select p.campanha_lead_id, p.conversation_id, p.em,
           (select max(r.sent_at) from sigzap_messages r
             where r.conversation_id = p.conversation_id and not r.from_me and r.sent_at > p.em) as ultima
      from primeiro p
  ),
  fila as (
    select r.*
      from respondeu r
      left join conversa_classificacao cc on cc.campanha_lead_id = r.campanha_lead_id
     where r.ultima is not null
       and (cc.id is null or cc.mensagens_ate < r.ultima)
     order by r.ultima desc
     limit greatest(1, least(p_limite, 200))
  )
  select f.campanha_lead_id, cl.lead_id, cl.campanha_id,
         coalesce(c.especialidade_id, c.especialidade_ids[1]) as especialidade_id,
         f.ultima,
         (select string_agg(case when t.from_me then 'GSS: ' else 'Médico: ' end || left(t.message_text, 500), E'\n' order by t.sent_at)
            from (select x.from_me, x.message_text, x.sent_at
                    from sigzap_messages x
                   where x.conversation_id = f.conversation_id and x.sent_at >= f.em
                     and coalesce(trim(x.message_text), '') <> ''
                   order by x.sent_at desc limit 30) t)
    from fila f
    join campanha_leads cl on cl.id = f.campanha_lead_id
    left join campanhas c on c.id = cl.campanha_id;
$$;
revoke all on function public.conversas_classificar_pendentes(int) from public, anon, authenticated;
grant execute on function public.conversas_classificar_pendentes(int) to service_role;
