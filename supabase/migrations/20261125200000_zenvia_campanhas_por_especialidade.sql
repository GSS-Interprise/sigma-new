-- Zenvia como campanhas, uma por especialidade (Raul, 25/11/2026: "colocar o Zenvia dentro dos disparos por dia, do BI
-- e das campanhas, como um monitoramento: campanha Zenvia xxxx"). A API pública da Zenvia não lista os envios (lotes)
-- e o webhook não traz o nome do envio; o Raul escolheu agrupar pela especialidade do médico.
--
-- zenvia_mensagens  uma linha por mensagem que saiu da Zenvia (message_id), com o médico, o dia e o desfecho.
--                   conversa = a equipe (ou o fluxo da Zenvia) respondendo quem escreveu nas 24 h antes: não é disparo.
-- zenvia_disparos   só o que é campanha (sem conversa), com a especialidade escolhida e se o médico respondeu.
--                   Especialidade: entre as do médico (lead_especialidades) que têm peso no dia, a mais comum (um envio
--                   da Zenvia é uma lista de uma especialidade: radiologia em 17/11, ginecologia em 19/11, anestesiologia
--                   em 25/11). Médico sem especialidade, sem cadastro ou só com especialidade miúda herda a principal do dia.
-- zenvia_campanhas  uma linha por especialidade: hoje, 7 dias, total, entregues, lidos, responderam, último disparo.
--
-- Nada é gravado em campanhas/campanha_leads (os gatilhos de lá criam tarefas e avisos para a equipe).
-- Disparo segue a regra de 18/11: saiu = SENT, DELIVERED, READ ou NOT_DELIVERED; falha = REJECTED, FAILED ou ERROR.

create or replace view public.zenvia_mensagens as
with st as (
  select message_id,
         min(evento_em) as primeiro_em,
         (array_agg(telefone_norm order by evento_em) filter (where telefone_norm is not null))[1] as telefone,
         (array_agg(lead_id order by evento_em) filter (where lead_id is not null))[1] as lead_id,
         bool_or(status in ('SENT', 'DELIVERED', 'READ', 'NOT_DELIVERED')) as saiu,
         bool_or(status in ('DELIVERED', 'READ')) as entregue,
         bool_or(status = 'READ') as lido,
         bool_or(status in ('REJECTED', 'FAILED', 'ERROR')) as falhou
    from public.zenvia_eventos
   where tipo = 'MESSAGE_STATUS' and message_id is not null
   group by message_id
)
select st.message_id, st.primeiro_em, (st.primeiro_em at time zone 'America/Sao_Paulo')::date as dia,
       st.telefone, st.lead_id, st.saiu, st.entregue, st.lido, st.falhou,
       exists (select 1 from public.zenvia_eventos i
                where i.tipo = 'MESSAGE' and i.direcao = 'IN' and i.telefone_norm = st.telefone
                  and i.evento_em between st.primeiro_em - interval '24 hours' and st.primeiro_em) as conversa,
       exists (select 1 from public.zenvia_eventos i
                where i.tipo = 'MESSAGE' and i.direcao = 'IN' and i.telefone_norm = st.telefone
                  and i.evento_em > st.primeiro_em and i.evento_em <= st.primeiro_em + interval '7 days') as respondeu
  from st;

create or replace view public.zenvia_disparos as
with m as (select * from public.zenvia_mensagens where not conversa),
tot as (select dia, count(*) as n from m group by dia),
le as (
  select m.message_id, m.dia, x.especialidade_id
    from m join public.lead_especialidades x on x.lead_id = m.lead_id
),
cont as (select dia, especialidade_id, count(distinct message_id) as n from le group by 1, 2),
-- Especialidades "do envio": as que têm peso no dia (10% dos disparos e pelo menos 20). Sem isso, o médico com várias
-- especialidades espalhava o envio em dezenas de linhas de 1 ou 2 disparos.
principais as (
  select c.dia, c.especialidade_id, c.n
    from cont c join tot t on t.dia = c.dia
   where c.n >= 20 and c.n >= 0.10 * t.n
),
escolha as (
  -- Desempate fixo pelo id: o mesmo dado sempre cai na mesma especialidade.
  select distinct on (le.message_id) le.message_id, le.especialidade_id
    from le join principais p on p.dia = le.dia and p.especialidade_id = le.especialidade_id
   order by le.message_id, p.n desc, le.especialidade_id
),
topo as (select distinct on (dia) dia, especialidade_id from cont order by dia, n desc, especialidade_id)
select m.*, coalesce(e.especialidade_id, t.especialidade_id) as especialidade_id
  from m
  left join escolha e on e.message_id = m.message_id
  left join topo t on t.dia = m.dia;

-- Nome de exibição: "GINECOLOGIA E OBSTETRÍCIA" vira "Ginecologia e Obstetrícia".
create or replace function public.zenvia_nome_especialidade(p text)
returns text language sql immutable as $$
  select case when p is null then 'Sem especialidade' else replace(replace(replace(replace(replace(replace(replace(replace(
           initcap(lower(p)),
           ' E ', ' e '), ' Em ', ' em '), ' Do ', ' do '), ' Da ', ' da '), ' De ', ' de '), ' Dos ', ' dos '),
           ' Das ', ' das '), ' Por ', ' por ') end;
$$;

create or replace view public.zenvia_campanhas as
with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
select
  -- id estável por especialidade (o BI e a tela usam como chave da linha).
  md5('zenvia:' || coalesce(z.especialidade_id::text, 'sem'))::uuid as id,
  z.especialidade_id,
  'Zenvia · ' || public.zenvia_nome_especialidade(min(es.nome)) as nome,
  case when max(z.dia) >= (select d from hoje) - 6 then 'ativa' else 'finalizada' end as status,
  count(*) filter (where z.saiu and z.dia = (select d from hoje))::int as disparos_hoje,
  count(*) filter (where z.saiu and z.dia >= (select d from hoje) - 6)::int as disparos_7d,
  count(*) filter (where z.saiu)::int as disparos,
  count(*) filter (where z.entregue)::int as entregues,
  count(*) filter (where z.lido)::int as lidos,
  count(*) filter (where z.falhou and not z.saiu)::int as falharam,
  count(*) filter (where z.respondeu)::int as responderam,
  count(distinct coalesce(z.lead_id::text, z.telefone)) filter (where z.saiu)::int as medicos,
  min(z.dia) as primeiro_dia,
  max(z.primeiro_em) filter (where z.saiu) as ultimo_disparo
  from public.zenvia_disparos z
  left join public.especialidades es on es.id = z.especialidade_id
 group by z.especialidade_id
having count(*) filter (where z.saiu) > 0;

grant select on public.zenvia_mensagens, public.zenvia_disparos, public.zenvia_campanhas to authenticated, service_role;

-- BI de campanhas: a linha única "Zenvia · WhatsApp" vira uma linha por especialidade; por_dia ganha a barra da Zenvia.
CREATE OR REPLACE FUNCTION public.get_bi_acompanhamento_campanhas(p_desde date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;
WITH disp AS (
  -- Evolution: registro histórico do envio do chip.
  SELECT sent_at AS ts,
    CASE WHEN evento_origem IN ('cold_disparo','resposta_ia') THEN 'ia' ELSE 'manual' END AS origem
  FROM chip_send_log
  WHERE sent_at IS NOT NULL

  UNION ALL

  -- Oficial (Twilio/Chakra): mensagem efetivamente criada no Sigma.
  SELECT sm.sent_at AS ts,
    CASE WHEN sm.sent_by_user_id IS NULL THEN 'ia' ELSE 'manual' END AS origem
  FROM sigzap_messages sm
  WHERE sm.from_me = true
    AND sm.provider IN ('twilio', 'chakra')
    AND sm.sent_at IS NOT NULL
),
funil AS (
  SELECT campanha_id,
    count(*) leads,
    count(*) FILTER (WHERE status = 'frio') frio,
    count(*) FILTER (WHERE status <> 'frio') contatados,
    count(*) FILTER (WHERE status = 'em_conversa') em_conversa,
    count(*) FILTER (WHERE status = 'quente') quente,
    count(*) FILTER (WHERE status = 'convertido') convertido,
    max(data_ultimo_contato) ultima_atividade,
    count(*) FILTER (WHERE data_ultimo_contato::date = current_date) contatados_hoje,
    count(*) FILTER (WHERE data_ultimo_contato >= now() - interval '7 days') contatados_7d
  FROM campanha_leads GROUP BY campanha_id
),
camp AS (
  SELECT c.id, c.nome, c.tipo_envio, c.status,
    c.whatsapp_provider,
    (c.whatsapp_provider IN ('twilio', 'chakra')
      AND c.official_sender_id IS NOT NULL
      AND c.official_template_id IS NOT NULL) AS canal_configurado,
    coalesce(c.chip_ids, CASE WHEN c.chip_id IS NOT NULL THEN array[c.chip_id] ELSE '{}'::uuid[] END) chips_arr
  FROM campanhas c WHERE c.status IN ('ativa','pausada')
),
linhas AS (
  SELECT cp.id campanha_id, cp.nome campanha, cp.tipo_envio tipo, cp.status,
    cp.whatsapp_provider, cp.canal_configurado,
    coalesce(f.contatados_hoje,0) disparos_hoje,
    coalesce(f.contatados_7d,0) disparos_7d,
    coalesce(f.contatados,0) disparos_total,
    f.ultima_atividade ultimo_disparo,
    coalesce(f.leads,0) leads, coalesce(f.frio,0) frio, coalesce(f.contatados,0) contatados,
    coalesce(f.em_conversa,0) em_conversa, coalesce(f.quente,0) quente, coalesce(f.convertido,0) convertido,
    CASE WHEN cp.whatsapp_provider IN ('twilio', 'chakra') THEN 0 ELSE coalesce(array_length(cp.chips_arr,1),0) END chips_total,
    CASE WHEN cp.whatsapp_provider IN ('twilio', 'chakra') THEN 0
      ELSE (select count(*) from chips ch where ch.id = any(cp.chips_arr) and ch.connection_state = 'open')
    END chips_online
  FROM camp cp LEFT JOIN funil f ON f.campanha_id = cp.id

  UNION ALL

  -- Zenvia (25/11): uma linha por especialidade, de zenvia_campanhas. Sem chip e sem funil de leads no Sigma:
  -- "leads" = médicos impactados, "contatados" = disparos, "em conversa" = médicos que responderam.
  SELECT z.id, z.nome, 'manual', z.status::status_campanha, 'zenvia', true,
    z.disparos_hoje, z.disparos_7d, z.disparos, z.ultimo_disparo,
    z.medicos, 0, z.disparos, z.responderam, 0, 0, 0, 0
  FROM zenvia_campanhas z
)
SELECT json_build_object(
  'hoje', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where ts::date = current_date),
  'periodo', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where (p_desde is null or ts::date >= p_desde)),
  -- Zenvia à parte (não entra em ia/manual nem no gráfico por dia, que são dos envios do próprio Sigma).
  'zenvia', (select json_build_object('hoje', count(*) filter (where z.saiu and z.dia = (now() at time zone 'America/Sao_Paulo')::date),
                                       'disparos', count(*) filter (where z.saiu), 'responderam', count(*) filter (where z.respondeu))
               from zenvia_disparos z where (p_desde is null or z.dia >= p_desde)),
  -- Resumo de saúde só das campanhas do Sigma: a Zenvia dispara fora, em dias soltos, e aparece à parte ("zenvia" e
  -- as linhas da tabela). Com ela, cada especialidade contava como campanha ativa (24 em vez de 18, em 25/11).
  'resumo', (select json_build_object(
     'ativas', count(*) filter(where status='ativa'),
     'pausadas', count(*) filter(where status='pausada'),
     'rodando_hoje', count(*) filter(where status='ativa' and disparos_hoje > 0),
     'paradas', count(*) filter(where status='ativa' and (ultimo_disparo is null or ultimo_disparo < now() - interval '2 days')),
     'sem_chip_online', count(*) filter(where status='ativa' and (whatsapp_provider is null or whatsapp_provider = 'evolution') and chips_online = 0)
   ) from linhas where whatsapp_provider is distinct from 'zenvia'),
  -- zenvia: disparos da Zenvia no mesmo dia (barra à parte no gráfico; não soma em total, que é do Sigma).
  'por_dia', coalesce((select json_agg(x order by x.dia) from (
     select coalesce(s.dia, zz.dia) dia, coalesce(s.ia, 0) ia, coalesce(s.manual, 0) manual, coalesce(s.total, 0) total,
            coalesce(zz.n, 0) zenvia
       from (select ts::date dia, count(*) filter(where origem='ia') ia, count(*) filter(where origem='manual') manual, count(*) total
               from disp where (p_desde is null or ts::date >= p_desde) group by ts::date) s
       full join (select dia, count(*) n from zenvia_disparos where saiu and (p_desde is null or dia >= p_desde) group by dia) zz
         on zz.dia = s.dia) x), '[]'),
  'campanhas', coalesce((select json_agg(l order by l.disparos_hoje desc, l.disparos_7d desc, l.disparos_total desc) from linhas l), '[]')
);
$function$;


-- Faixa "Disparos por dia" (Home e aba Campanhas): a Zenvia entra ao lado, sem mexer na estimativa nem em "hoje", que são
-- do ritmo das campanhas do Sigma. serie ganha "zenvia" por dia; zenvia_hoje e zenvia_campanhas (hoje por especialidade,
-- só as que dispararam nos últimos 7 dias).
CREATE OR REPLACE FUNCTION public.campanhas_disparos_painel(p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias int := least(greatest(coalesce(p_dias, 7), 2), 31);
  v_serie jsonb;
  v_campanhas jsonb;
  v_zenvia jsonb;
  v_teto int;
  v_ultimo timestamptz;
  v_fila int;
begin
  if auth.uid() is null then
    raise exception 'sem_permissao';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'medicos', d.medicos, 'falharam', d.falharam, 'zenvia', d.zenvia) order by d.dia), '[]'::jsonb)
    into v_serie
    from (
      select g.dia::date as dia,
             coalesce((select sum(x.enviados) from agente_campanhas_disparos_dia(g.dia::date) x), 0)::int as medicos,
             coalesce((select sum(x.falharam) from agente_campanhas_disparos_dia(g.dia::date) x), 0)::int as falharam,
             coalesce(z.n, 0)::int as zenvia
        from generate_series(v_hoje - (v_dias - 1), v_hoje, interval '1 day') g(dia)
        left join (select dia, count(*) as n from zenvia_disparos
                    where saiu and dia >= v_hoje - (v_dias - 1) group by dia) z on z.dia = g.dia::date
    ) d;

  -- Estimativa e disparos de hoje por campanha ativa, para o sócio ver de onde vem o número.
  with est as (
    select c.id, trim(c.nome) as nome,
           (select count(*) from campanha_leads cl where cl.campanha_id = c.id and cl.status = 'frio')::int as fila,
           least(
             coalesce(nullif(c.limite_diario_campanha, 0), 250),
             floor((coalesce(c.horario_fim_brt, 17) - coalesce(c.horario_inicio_brt, 7)) * 60.0
                   / greatest(2.0, (coalesce(nullif(c.delay_between_batches_min, 0), 120)
                                    + coalesce(nullif(c.delay_between_batches_max, 0), 180)) / 120.0)),
             (select count(*) from campanha_leads cl where cl.campanha_id = c.id and cl.status = 'frio')
           )::int as estimativa
      from campanhas c
     where c.tipo_campanha = 'prospeccao' and c.status = 'ativa' and c.whatsapp_provider = 'chakra'
  ),
  hoje as (select x.campanha_id, x.enviados::int as n from agente_campanhas_disparos_dia(v_hoje) x)
  select coalesce(sum(e.estimativa), 0)::int,
         coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'campanha', e.nome, 'hoje', coalesce(h.n, 0), 'estimativa', e.estimativa, 'fila', e.fila)
                            order by e.estimativa desc, e.nome, e.id) filter (where e.id is not null), '[]'::jsonb)
    into v_teto, v_campanhas
    from est e left join hoje h on h.campanha_id = e.id;

  select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'campanha', z.nome, 'hoje', z.disparos_hoje, 'dias7', z.disparos_7d)
                            order by z.disparos_hoje desc, z.disparos_7d desc, z.id), '[]'::jsonb)
    into v_zenvia
    from zenvia_campanhas z where z.disparos_7d > 0;

  select count(*) into v_fila
    from campanha_leads cl join campanhas c on c.id = cl.campanha_id
   where c.tipo_campanha = 'prospeccao' and c.status = 'ativa' and c.whatsapp_provider = 'chakra' and cl.status = 'frio';

  select max(m.sent_at) into v_ultimo
    from sigzap_messages m
   where m.from_me and m.campanha_lead_id is not null and m.sent_at > now() - interval '2 days';

  return jsonb_build_object(
    'hoje', coalesce((v_serie -> -1 ->> 'medicos')::int, 0),
    'ontem', coalesce((v_serie -> -2 ->> 'medicos')::int, 0),
    'estimativa_dia', v_teto,
    'fila', v_fila,
    'ultimo_envio', v_ultimo,
    'serie', v_serie,
    'campanhas', v_campanhas,
    'zenvia_hoje', coalesce((v_serie -> -1 ->> 'zenvia')::int, 0),
    'zenvia_campanhas', v_zenvia
  );
end;
$function$;

