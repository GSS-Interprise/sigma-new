-- Tempo de resposta da equipe no WhatsApp: painel em tempo real e avisos em escada.
-- docs/arquitetura/tempo-de-resposta-atendimento.md (§3b regras, §3c banco). Item 2 da tabela da Ramone.
--
-- Regras (as mesmas no painel, nos avisos e no agente):
--   - só números Chakra (API oficial; o celular em coexistence chega como echo, então a resposta pelo celular conta);
--   - conversa esperando = a última mensagem é do contato e a conversa não foi encerrada depois dela;
--   - espera = desde a PRIMEIRA mensagem do contato depois da última resposta nossa (e depois do encerramento);
--   - de quem é = responsável atual do número (whatsapp_chakra_connections.responsavel_id);
--   - IA atuando = lead em campanha ativa ia/ambos, etapa contatado/em_conversa/aquecido, sem humano_assumiu
--     (mesma regra do campanha-ia-responder); aparece, mas não gera aviso de pessoa.
--   - quem respondeu: sent_by_user_id (pela tela do Sigma); echo do celular (raw_payload.event = messages.upsert)
--     = responsável do número; resto (sem usuário e sem echo) = envio automático (IA, campanha).

-- ── Contatos marcados (clientes e contatos importantes, com nome) ──
create table if not exists public.atendimento_contatos (
  id uuid primary key default gen_random_uuid(),
  telefone text not null unique check (telefone ~ '^[0-9]{10,15}$'),
  nome text not null check (length(trim(nome)) between 2 and 120),
  tipo text not null default 'cliente' check (tipo in ('cliente', 'medico', 'parceiro', 'outro')),
  prioridade boolean not null default true,
  observacao text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ── Conversas encerradas sem resposta ("ok, obrigado"). Mensagem nova depois reabre sozinha. ──
create table if not exists public.atendimento_encerradas (
  conversation_id uuid primary key references public.sigzap_conversations(id) on delete cascade,
  encerrada_em timestamptz not null default now(),
  encerrada_por uuid references auth.users(id),
  motivo text
);

-- ── Configuração dos avisos (linha única) ──
create table if not exists public.atendimento_config (
  id boolean primary key default true check (id),
  faixas jsonb not null default '[{"min":3,"para":"responsavel"},{"min":10,"para":"responsavel"},{"min":60,"para":"coordenacao"},{"min":180,"para":"diretoria"}]',
  dias int[] not null default '{1,2,3,4,5}',          -- ISO: 1 = segunda ... 7 = domingo
  hora_inicio time not null default '08:00',
  hora_fim time not null default '18:00',
  coordenacao jsonb not null default '[]',           -- [{nome, fone}]
  diretoria jsonb not null default '[]',             -- [{nome, fone}]
  avisos_ativos boolean not null default false,
  modo_teste boolean not null default true,
  teste_fone text,
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);
-- Modo teste com o mesmo telefone de teste do aviso de furo (o do Raul) até o alinhamento com a Ramone.
insert into public.atendimento_config (id, teste_fone)
values (true, nullif((select valor from public.config_lista_items where campo_nome = 'escala_furos_teste_destino' limit 1), ''))
on conflict do nothing;

-- ── Avisos enviados: um por conversa, início da espera, faixa e telefone ──
create table if not exists public.atendimento_avisos (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sigzap_conversations(id) on delete cascade,
  esperando_desde timestamptz not null,
  faixa_min int not null,
  fone text not null,
  destino text not null,
  enviado_em timestamptz not null default now(),
  erro text,
  unique (conversation_id, esperando_desde, faixa_min, fone)
);
create index if not exists atendimento_avisos_enviado_idx on public.atendimento_avisos (enviado_em desc);

create index if not exists idx_sigzap_messages_conv_sent on public.sigzap_messages (conversation_id, sent_at desc);

-- ── Quem pode ──
create or replace function public.atendimento_pode_ver(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.pode_modulo(p_uid, 'disparos', 'visualizar'), false)
$$;
create or replace function public.atendimento_pode_gerir(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.atendimento_pode_ver(p_uid) and exists (
    select 1 from public.user_roles where user_id = p_uid and role::text in ('admin', 'diretoria', 'gestor_captacao'))
$$;

alter table public.atendimento_contatos enable row level security;
alter table public.atendimento_encerradas enable row level security;
alter table public.atendimento_config enable row level security;
alter table public.atendimento_avisos enable row level security;
drop policy if exists atendimento_contatos_ler on public.atendimento_contatos;
create policy atendimento_contatos_ler on public.atendimento_contatos for select to authenticated using (public.atendimento_pode_ver(auth.uid()));
drop policy if exists atendimento_contatos_gerir on public.atendimento_contatos;
create policy atendimento_contatos_gerir on public.atendimento_contatos for all to authenticated
  using (public.atendimento_pode_gerir(auth.uid())) with check (public.atendimento_pode_gerir(auth.uid()));
drop policy if exists atendimento_config_ler on public.atendimento_config;
create policy atendimento_config_ler on public.atendimento_config for select to authenticated using (public.atendimento_pode_ver(auth.uid()));
drop policy if exists atendimento_config_gerir on public.atendimento_config;
create policy atendimento_config_gerir on public.atendimento_config for update to authenticated
  using (public.atendimento_pode_gerir(auth.uid())) with check (public.atendimento_pode_gerir(auth.uid()));
drop policy if exists atendimento_avisos_ler on public.atendimento_avisos;
create policy atendimento_avisos_ler on public.atendimento_avisos for select to authenticated using (public.atendimento_pode_ver(auth.uid()));
drop policy if exists atendimento_encerradas_ler on public.atendimento_encerradas;
create policy atendimento_encerradas_ler on public.atendimento_encerradas for select to authenticated using (public.atendimento_pode_ver(auth.uid()));

grant select, insert, update, delete on public.atendimento_contatos to authenticated, service_role;
grant select on public.atendimento_encerradas to authenticated;
grant all on public.atendimento_encerradas to service_role;
grant select, update on public.atendimento_config to authenticated;
grant all on public.atendimento_config to service_role;
grant select on public.atendimento_avisos to authenticated;
grant all on public.atendimento_avisos to service_role;

-- ── O núcleo: conversas esperando resposta agora (sem checagem de permissão: service_role e as funções abaixo) ──
create or replace function public.atendimento_aguardando_base(p_dias int default 7)
returns table (
  conversation_id uuid, contato_nome text, contato_telefone text, lead_id uuid,
  numero text, numero_nome text, uso text, responsavel_id uuid, responsavel_nome text,
  esperando_desde timestamptz, mensagens int, ultima_mensagem text, ultima_em timestamptz,
  ia_atuando boolean, contato_marcado text, contato_tipo text, prioridade boolean
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
         ac.nome, ac.tipo, coalesce(ac.prioridade, false)
  from pend p
  left join sigzap_contacts ct on ct.id = p.contact_id
  left join leads l on l.id = p.lead_id
  left join whatsapp_chakra_connections cc
    on regexp_replace(cc.phone_e164, '\D', '', 'g') = regexp_replace(p.phone_number, '\D', '', 'g')
  left join profiles pr on pr.id = cc.responsavel_id
  left join atendimento_contatos ac on ac.telefone = p.fone
  order by p.desde, p.id
$$;

-- Para a tela: checa a permissão de quem chama.
drop function if exists public.atendimento_aguardando(int);
create or replace function public.atendimento_aguardando(p_dias int default 7)
returns table (
  conversation_id uuid, contato_nome text, contato_telefone text, lead_id uuid,
  numero text, numero_nome text, uso text, responsavel_id uuid, responsavel_nome text,
  esperando_desde timestamptz, mensagens int, ultima_mensagem text, ultima_em timestamptz,
  ia_atuando boolean, contato_marcado text, contato_tipo text, prioridade boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.atendimento_pode_ver(auth.uid()) then raise exception 'sem permissão' using errcode = '42501'; end if;
  return query select * from public.atendimento_aguardando_base(p_dias);
end $$;

-- ── Indicadores por pessoa: atendimento_indicadores_base() fica na migration seguinte (20261122121000), que separa a
-- resposta do celular da resposta da IA pela origem da mensagem. Ela precisa existir antes do wrapper abaixo.
create or replace function public.atendimento_indicadores_base(p_de timestamptz, p_ate timestamptz)
returns table (pessoa_id uuid, pessoa text, esperas int, respondidas int, mediana_min numeric, em_10min int, sem_resposta int)
language sql stable security definer set search_path = public as $$ select null::uuid, null::text, 0, 0, null::numeric, 0, 0 where false $$;

create or replace function public.atendimento_indicadores(p_de timestamptz, p_ate timestamptz)
returns table (pessoa_id uuid, pessoa text, esperas int, respondidas int, mediana_min numeric, em_10min int, sem_resposta int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.atendimento_pode_ver(auth.uid()) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_ate <= p_de or p_ate - p_de > interval '31 days' then raise exception 'período inválido (até 31 dias)'; end if;
  return query select * from public.atendimento_indicadores_base(p_de, p_ate);
end $$;

-- ── Encerrar sem responder / reabrir ──
create or replace function public.atendimento_encerrar(p_conversation_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.atendimento_pode_ver(auth.uid()) then raise exception 'sem permissão' using errcode = '42501'; end if;
  insert into atendimento_encerradas (conversation_id, encerrada_em, encerrada_por, motivo)
  values (p_conversation_id, now(), auth.uid(), nullif(trim(p_motivo), ''))
  on conflict (conversation_id) do update set encerrada_em = now(), encerrada_por = auth.uid(), motivo = excluded.motivo;
end $$;

revoke all on function public.atendimento_aguardando_base(int) from public, anon, authenticated;
revoke all on function public.atendimento_indicadores_base(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.atendimento_aguardando_base(int) to service_role;
grant execute on function public.atendimento_indicadores_base(timestamptz, timestamptz) to service_role;
revoke all on function public.atendimento_aguardando(int) from public, anon;
revoke all on function public.atendimento_indicadores(timestamptz, timestamptz) from public, anon;
revoke all on function public.atendimento_encerrar(uuid, text) from public, anon;
grant execute on function public.atendimento_aguardando(int) to authenticated;
grant execute on function public.atendimento_indicadores(timestamptz, timestamptz) to authenticated;
grant execute on function public.atendimento_encerrar(uuid, text) to authenticated;
grant execute on function public.atendimento_pode_ver(uuid), public.atendimento_pode_gerir(uuid) to authenticated, service_role;

-- Encerrar várias de uma vez (faxina das esperas antigas: "obrigado", "ok", conversa que acabou).
create or replace function public.atendimento_encerrar_varias(p_ids uuid[], p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.atendimento_pode_ver(auth.uid()) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 1000 then raise exception 'no máximo 1000 por vez'; end if;
  insert into atendimento_encerradas (conversation_id, encerrada_em, encerrada_por, motivo)
  select distinct x, now(), auth.uid(), nullif(trim(p_motivo), '') from unnest(p_ids) x
  where exists (select 1 from sigzap_conversations c where c.id = x)
  on conflict (conversation_id) do update set encerrada_em = now(), encerrada_por = auth.uid(), motivo = excluded.motivo;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.atendimento_encerrar_varias(uuid[], text) from public, anon;
grant execute on function public.atendimento_encerrar_varias(uuid[], text) to authenticated;
