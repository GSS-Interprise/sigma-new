-- Tempo de resposta: regras por TIPO DE CONTATO (reunião com os sócios da GSS em 24/11/2026).
-- Doc: docs/arquitetura/tempo-de-resposta-atendimento.md §3h.
--
-- Por que existe: até aqui havia uma escada só ({3,10,60,180}) e uma meta só (10 min) para todo mundo. Os sócios
-- pediram meta e avisos diferentes conforme quem escreveu: pessoa-chave (contato marcado com prioridade) cobra mais
-- rápido; cliente e médico têm prazo maior. Conversa com contato NÃO marcado continua na categoria "padrao", que nasce
-- igual ao comportamento de antes (meta 10, avisos 3/10 para quem está com o número, 60 coordenação, 180 diretoria).
--
-- Categoria da conversa (a mesma no painel, nos avisos e nos indicadores, pela função atendimento_categoria):
--   prioridade, se o contato marcado tem prioridade = true; senão o tipo do contato marcado; senão padrao.
-- Categoria sem linha em atendimento_regras cai na linha "padrao" (e, sem ela, meta 10).
--
-- atendimento_config.faixas e atendimento_config.meta_minutos ficam no banco, mas deixam de ser lidas: a escada e a
-- meta passam a vir daqui. atendimento_config continua com horário, destinos, modo teste e meta_pct.

create table if not exists public.atendimento_regras (
  categoria text primary key check (categoria in ('padrao', 'prioridade', 'cliente', 'medico', 'parceiro', 'outro')),
  meta_min int not null check (meta_min between 1 and 1440),
  -- avisos para quem está com o número; vazio = não avisa a pessoa
  pessoa_min int[] not null default '{}'
    check (cardinality(pessoa_min) <= 4 and array_position(pessoa_min, null) is null
           and 1 <= all(pessoa_min) and 2880 >= all(pessoa_min)),
  -- null = não avisa a coordenação / a diretoria nesta categoria
  coordenacao_min int check (coordenacao_min between 1 and 2880),
  diretoria_min int check (diretoria_min between 1 and 2880),
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);

-- Valores iniciais (sugestão; a GSS ajusta na tela Tempo de resposta › Avisos). "padrao" usa a meta que já estava
-- configurada, para nada mudar nas conversas de contato não marcado.
insert into public.atendimento_regras (categoria, meta_min, pessoa_min, coordenacao_min, diretoria_min) values
  ('padrao',     coalesce((select meta_minutos from public.atendimento_config where id), 10), '{3,10}', 60, 180),
  ('prioridade', 10, '{3,10}',  30,  60),
  ('cliente',    30, '{10,30}', 60, 180),
  ('medico',     60, '{30,60}', 120, 240),
  ('parceiro',   coalesce((select meta_minutos from public.atendimento_config where id), 10), '{3,10}', 60, 180),
  ('outro',      coalesce((select meta_minutos from public.atendimento_config where id), 10), '{3,10}', 60, 180)
on conflict (categoria) do nothing;

alter table public.atendimento_regras enable row level security;
drop policy if exists atendimento_regras_ler on public.atendimento_regras;
create policy atendimento_regras_ler on public.atendimento_regras for select to authenticated
  using (public.atendimento_pode_ver(auth.uid()));
drop policy if exists atendimento_regras_gerir on public.atendimento_regras;
create policy atendimento_regras_gerir on public.atendimento_regras for update to authenticated
  using (public.atendimento_pode_gerir(auth.uid())) with check (public.atendimento_pode_gerir(auth.uid()));
-- GRANT explícito: tabela criada por SQL não ganha grant padrão (incidente de 18/05 derrubou edges com 42501).
grant select, update on public.atendimento_regras to authenticated;
grant all on public.atendimento_regras to service_role;

-- Categoria a partir do contato marcado (tipo + prioridade). Sem contato marcado = padrao.
create or replace function public.atendimento_categoria(p_tipo text, p_prioridade boolean) returns text
language sql immutable set search_path = public as $$
  select case when coalesce(p_prioridade, false) then 'prioridade' else coalesce(p_tipo, 'padrao') end
$$;
grant execute on function public.atendimento_categoria(text, boolean) to authenticated, service_role;

-- ── Fila: ganha categoria e meta_min no fim (as colunas de antes ficam iguais e na mesma ordem). ──
-- Troca do tipo de retorno exige drop; o wrapper depende da _base, então cai junto e volta com os mesmos grants.
drop function if exists public.atendimento_aguardando(int);
drop function if exists public.atendimento_aguardando_base(int);

create or replace function public.atendimento_aguardando_base(p_dias int default 7)
returns table (
  conversation_id uuid, contato_nome text, contato_telefone text, lead_id uuid,
  numero text, numero_nome text, uso text, responsavel_id uuid, responsavel_nome text,
  esperando_desde timestamptz, mensagens int, ultima_mensagem text, ultima_em timestamptz,
  ia_atuando boolean, contato_marcado text, contato_tipo text, prioridade boolean,
  categoria text, meta_min int
)
language sql stable security definer set search_path = public as $$
  with conv as (
    select c.id, c.contact_id, c.lead_id, i.phone_number,
           regexp_replace(coalesce(ct.contact_phone, split_part(ct.contact_jid, '@', 1)), '\D', '', 'g') as fone
    from sigzap_conversations c
    join sigzap_instances i on i.id = c.instance_id and i.provider = 'chakra'
    left join sigzap_contacts ct on ct.id = c.contact_id
    where c.last_message_at > now() - make_interval(days => greatest(1, least(p_dias, 30)))
  ),
  marco as (
    select cv.*,
           (select max(m.sent_at) from sigzap_messages m where m.conversation_id = cv.id and m.from_me) as ultima_nossa,
           e.encerrada_em
    from conv cv left join atendimento_encerradas e on e.conversation_id = cv.id
  ),
  pend as (
    select mc.*, x.desde, x.n, x.ultima_em, x.ultimo_texto
    from marco mc
    cross join lateral (
      select min(m.sent_at) desde, count(*)::int n, max(m.sent_at) ultima_em,
             (array_agg(coalesce(nullif(m.message_text, ''), '[' || m.message_type || ']') order by m.sent_at desc))[1] ultimo_texto
      from sigzap_messages m
      where m.conversation_id = mc.id and not m.from_me
        and m.sent_at > greatest(coalesce(mc.ultima_nossa, '-infinity'), coalesce(mc.encerrada_em, '-infinity'))
    ) x
    where x.n > 0
      and x.desde > now() - make_interval(days => greatest(1, least(p_dias, 30)))
      -- Pedido de descadastro não espera resposta (o Sigma já trata o "SAIR" sozinho).
      and lower(trim(regexp_replace(coalesce(x.ultimo_texto, ''), '[[:punct:][:space:]]+', ' ', 'g')))
          not in ('sair', 'parar', 'pare', 'stop', 'remover', 'cancelar', 'descadastrar')
  )
  select p.id, coalesce(nullif(trim(ac.nome), ''), nullif(trim(ct.contact_name), ''), l.nome, '+' || p.fone),
         p.fone, p.lead_id,
         p.phone_number, cc.display_name, cc.uso, cc.responsavel_id, pr.nome_completo,
         p.desde, p.n, left(p.ultimo_texto, 160), p.ultima_em,
         exists (
           select 1 from campanha_leads cl join campanhas ca on ca.id = cl.campanha_id
           where p.lead_id is not null and cl.lead_id = p.lead_id and ca.status = 'ativa'
             and coalesce(ca.tipo_envio, 'ia') in ('ia', 'ambos')
             and cl.status in ('contatado', 'em_conversa', 'aquecido') and not coalesce(cl.humano_assumiu, false)),
         ac.nome, ac.tipo, coalesce(ac.prioridade, false),
         atendimento_categoria(ac.tipo, ac.prioridade),
         coalesce(rg.meta_min, rp.meta_min, 10)
  from pend p
  left join sigzap_contacts ct on ct.id = p.contact_id
  left join leads l on l.id = p.lead_id
  left join whatsapp_chakra_connections cc
    on regexp_replace(cc.phone_e164, '\D', '', 'g') = regexp_replace(p.phone_number, '\D', '', 'g')
  left join profiles pr on pr.id = cc.responsavel_id
  left join atendimento_contatos ac on ac.telefone = p.fone
  left join atendimento_regras rg on rg.categoria = atendimento_categoria(ac.tipo, ac.prioridade)
  left join atendimento_regras rp on rp.categoria = 'padrao'
  order by p.desde, p.id
$$;

create or replace function public.atendimento_aguardando(p_dias int default 7)
returns table (
  conversation_id uuid, contato_nome text, contato_telefone text, lead_id uuid,
  numero text, numero_nome text, uso text, responsavel_id uuid, responsavel_nome text,
  esperando_desde timestamptz, mensagens int, ultima_mensagem text, ultima_em timestamptz,
  ia_atuando boolean, contato_marcado text, contato_tipo text, prioridade boolean,
  categoria text, meta_min int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.atendimento_pode_ver(auth.uid()) then raise exception 'sem permissão' using errcode = '42501'; end if;
  return query select * from public.atendimento_aguardando_base(p_dias);
end $$;

revoke all on function public.atendimento_aguardando_base(int) from public, anon, authenticated;
grant execute on function public.atendimento_aguardando_base(int) to service_role;
revoke all on function public.atendimento_aguardando(int) from public, anon;
grant execute on function public.atendimento_aguardando(int) to authenticated;

-- ── Indicadores por pessoa: ganha em_meta (respondidas dentro da meta da categoria de cada conversa). ──
-- em_10min continua sendo "em até 10 min" fixo: o agente dos sócios lê esse campo com esse texto.
drop function if exists public.atendimento_indicadores(timestamptz, timestamptz, text);
drop function if exists public.atendimento_indicadores_base(timestamptz, timestamptz, text);

create or replace function public.atendimento_indicadores_base(p_de timestamptz, p_ate timestamptz, p_uso text default null)
returns table(pessoa_id uuid, pessoa text, esperas integer, respondidas integer, mediana_min numeric, em_10min integer,
              sem_resposta integer, em_meta integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with msgs as (
    select m.conversation_id, m.sent_at, m.from_me, m.sent_by_user_id,
           (m.raw_payload ->> 'origem') = 'celular' as celular,
           lag(m.from_me) over (partition by m.conversation_id order by m.sent_at, m.id) as anterior_nossa
    from sigzap_messages m
    join sigzap_conversations c on c.id = m.conversation_id
    join sigzap_instances i on i.id = c.instance_id and i.provider = 'chakra'
    where m.sent_at >= p_de - interval '1 day' and m.sent_at < p_ate + interval '1 day'
      -- O filtro é por conversa inteira (o número é da conversa), então o lag acima não perde a mensagem anterior.
      and (p_uso is null or exists (
        select 1 from whatsapp_chakra_connections cu
        where cu.uso = p_uso
          and regexp_replace(cu.phone_e164, '\D', '', 'g') = regexp_replace(i.phone_number, '\D', '', 'g')))
  ),
  esperas as (
    select e.conversation_id, e.sent_at as desde from msgs e
    where not e.from_me and coalesce(e.anterior_nossa, true) and e.sent_at >= p_de and e.sent_at < p_ate
  ),
  resp as (
    select es.conversation_id, es.desde, r.sent_at as respondida_em, r.sent_by_user_id, r.celular
    from esperas es
    left join lateral (
      select m.sent_at, m.sent_by_user_id, m.celular from msgs m
      where m.conversation_id = es.conversation_id and m.from_me and m.sent_at > es.desde
      order by m.sent_at limit 1
    ) r on true
  ),
  dono as (
    select r.*,
      (r.respondida_em is not null and r.sent_by_user_id is null and not coalesce(r.celular, false)) as automatica,
      case when r.sent_by_user_id is not null then r.sent_by_user_id
           when r.respondida_em is null or r.celular then cc.responsavel_id end as pessoa_id,
      -- Meta da categoria do contato (mesma regra de atendimento_aguardando_base).
      coalesce(rg.meta_min, rp.meta_min, 10) as meta_min
    from resp r
    join sigzap_conversations c on c.id = r.conversation_id
    join sigzap_instances i on i.id = c.instance_id
    left join whatsapp_chakra_connections cc
      on regexp_replace(cc.phone_e164, '\D', '', 'g') = regexp_replace(i.phone_number, '\D', '', 'g')
    left join sigzap_contacts ct on ct.id = c.contact_id
    left join atendimento_contatos ac
      on ac.telefone = regexp_replace(coalesce(ct.contact_phone, split_part(ct.contact_jid, '@', 1)), '\D', '', 'g')
    left join atendimento_regras rg on rg.categoria = atendimento_categoria(ac.tipo, ac.prioridade)
    left join atendimento_regras rp on rp.categoria = 'padrao'
  )
  select d.pessoa_id,
         case when d.automatica then 'Automático (IA, campanha)' else coalesce(max(p.nome_completo), 'Número sem responsável') end,
         count(*)::int, count(d.respondida_em)::int,
         round((percentile_cont(0.5) within group (order by extract(epoch from d.respondida_em - d.desde) / 60.0)
                filter (where d.respondida_em is not null))::numeric, 1),
         count(*) filter (where d.respondida_em - d.desde <= interval '10 minutes')::int,
         count(*) filter (where d.respondida_em is null)::int,
         count(*) filter (where d.respondida_em - d.desde <= make_interval(mins => d.meta_min))::int
  from dono d left join profiles p on p.id = d.pessoa_id
  group by d.pessoa_id, d.automatica
  order by d.automatica, 3 desc, 2
$function$;

create or replace function public.atendimento_indicadores(p_de timestamptz, p_ate timestamptz, p_uso text default null)
returns table(pessoa_id uuid, pessoa text, esperas integer, respondidas integer, mediana_min numeric, em_10min integer,
              sem_resposta integer, em_meta integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.atendimento_pode_ver(auth.uid()) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_ate <= p_de or p_ate - p_de > interval '31 days' then raise exception 'período inválido (até 31 dias)'; end if;
  return query select * from public.atendimento_indicadores_base(p_de, p_ate, p_uso);
end $function$;

revoke all on function public.atendimento_indicadores_base(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.atendimento_indicadores_base(timestamptz, timestamptz, text) to service_role;
revoke all on function public.atendimento_indicadores(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.atendimento_indicadores(timestamptz, timestamptz, text) to authenticated, service_role;

-- ── Série do painel: em_meta / depois passam a usar a meta da categoria de cada conversa (antes: meta_minutos fixo).
-- Mesma assinatura e mesmas colunas: create or replace basta.
create or replace function public.atendimento_serie_base(p_de timestamptz, p_ate timestamptz, p_bucket text default 'hour', p_uso text default null)
returns table(bucket timestamptz, esperas integer, em_meta integer, depois integer, sem_resposta integer, mediana_min numeric, automaticas integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with msgs as (
    select m.conversation_id, m.sent_at, m.from_me, m.sent_by_user_id,
           (m.raw_payload ->> 'origem') = 'celular' as celular,
           lag(m.from_me) over (partition by m.conversation_id order by m.sent_at, m.id) as anterior_nossa
    from sigzap_messages m
    join sigzap_conversations c on c.id = m.conversation_id
    join sigzap_instances i on i.id = c.instance_id and i.provider = 'chakra'
    where m.sent_at >= p_de - interval '1 day' and m.sent_at < p_ate + interval '1 day'
      and (p_uso is null or exists (
        select 1 from whatsapp_chakra_connections cu
        where cu.uso = p_uso
          and regexp_replace(cu.phone_e164, '\D', '', 'g') = regexp_replace(i.phone_number, '\D', '', 'g')))
  ),
  esperas as (
    select e.conversation_id, e.sent_at as desde, coalesce(rg.meta_min, rp.meta_min, 10) as meta_min
    from msgs e
    join sigzap_conversations c on c.id = e.conversation_id
    left join sigzap_contacts ct on ct.id = c.contact_id
    left join atendimento_contatos ac
      on ac.telefone = regexp_replace(coalesce(ct.contact_phone, split_part(ct.contact_jid, '@', 1)), '\D', '', 'g')
    left join atendimento_regras rg on rg.categoria = atendimento_categoria(ac.tipo, ac.prioridade)
    left join atendimento_regras rp on rp.categoria = 'padrao'
    where not e.from_me and coalesce(e.anterior_nossa, true) and e.sent_at >= p_de and e.sent_at < p_ate
  ),
  resp as (
    select es.desde, es.meta_min, r.sent_at as respondida_em,
           (r.sent_at is not null and r.sent_by_user_id is null and not coalesce(r.celular, false)) as automatica
    from esperas es
    left join lateral (
      select m.sent_at, m.sent_by_user_id, m.celular from msgs m
      where m.conversation_id = es.conversation_id and m.from_me and m.sent_at > es.desde
      order by m.sent_at limit 1
    ) r on true
  )
  select (date_trunc(case when p_bucket = 'day' then 'day' else 'hour' end, r.desde at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as bucket,
         count(*) filter (where not r.automatica)::int,
         count(*) filter (where not r.automatica and r.respondida_em - r.desde <= make_interval(mins => r.meta_min))::int,
         count(*) filter (where not r.automatica and r.respondida_em - r.desde > make_interval(mins => r.meta_min))::int,
         count(*) filter (where r.respondida_em is null)::int,
         round((percentile_cont(0.5) within group (order by extract(epoch from r.respondida_em - r.desde) / 60.0)
                filter (where r.respondida_em is not null and not r.automatica))::numeric, 1),
         count(*) filter (where r.automatica)::int
  from resp r
  group by 1
  order by 1
$function$;
