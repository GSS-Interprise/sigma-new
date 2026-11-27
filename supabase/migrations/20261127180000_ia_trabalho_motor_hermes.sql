-- Motor Hermes (27/11/2026): fila do trabalho de IA do Sigma feito pelo Hermes da VPS com o Claude da assinatura, no
-- molde do SDR do CloserPulse (linkbound, migrations 0031/0034/0035). O Sigma monta o prompt e o esquema; o Hermes
-- reserva pelo MCP (sigma-mcp), faz a parte de IA e entrega; a edge revalida e grava na tabela do domínio.
-- Plano: docs/arquitetura/plano-correcoes-reuniao-maikon-27-11.md (frente "motor Hermes").

-- Motor por tipo de trabalho. 'api' = Gemini, como antes desta frente. Nasce tudo em 'api': ligar o Hermes é uma troca
-- explícita, e o motor 'hermes' não volta para o Gemini sozinho (igual ao CloserPulse).
create table if not exists public.ia_motor (
  tipo text primary key check (tipo in ('classificar_conversa', 'ocr_contrato')),
  motor text not null default 'api' check (motor in ('api', 'hermes')),
  atualizado_em timestamptz not null default now()
);
insert into public.ia_motor (tipo) values ('classificar_conversa'), ('ocr_contrato') on conflict do nothing;
alter table public.ia_motor enable row level security;
revoke all on public.ia_motor from public, anon, authenticated;
grant all on public.ia_motor to service_role;

create table if not exists public.ia_trabalho (
  id uuid primary key default gen_random_uuid(),
  tipo text not null references public.ia_motor(tipo),
  -- Chave do item: a mesma conversa com fala nova do médico gera chave nova (inclui a hora da última fala).
  chave text not null unique,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'done', 'failed', 'canceled')),
  entrada jsonb not null,           -- prompt, esquema de resposta e dados (a conversa vem marcada como não confiável)
  resultado jsonb,
  reservado_por uuid references public.mcp_tokens(id) on delete set null,
  reservado_em timestamptz,
  lease_ate timestamptz,
  reservas int not null default 0,  -- teto de 5: depois vira 'failed' (senão um item que derruba o agente volta sempre)
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists ia_trabalho_aberto_idx on public.ia_trabalho (tipo, criado_em) where status in ('pending', 'claimed');
alter table public.ia_trabalho enable row level security;
revoke all on public.ia_trabalho from public, anon, authenticated;
grant all on public.ia_trabalho to service_role;

-- Enfileira. Só entra se o tipo estiver no motor 'hermes'. Chave repetida: pendente, reservado e concluído ficam como
-- estão; só o cancelado volta a pendente, com a entrada nova e sem reserva.
create or replace function public.ia_trabalho_enfileirar(p_tipo text, p_chave text, p_entrada jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v ia_trabalho;
begin
  if not exists (select 1 from ia_motor where tipo = p_tipo and motor = 'hermes') then
    return jsonb_build_object('state', 'blocked', 'reason', 'motor_nao_hermes');
  end if;
  insert into ia_trabalho as w (tipo, chave, entrada) values (p_tipo, p_chave, p_entrada)
  on conflict (chave) do update set
    status = case when w.status = 'canceled' then 'pending' else w.status end,
    entrada = case when w.status = 'canceled' then excluded.entrada else w.entrada end,
    resultado = case when w.status = 'canceled' then null else w.resultado end,
    reservado_por = case when w.status = 'canceled' then null else w.reservado_por end,
    reservado_em = case when w.status = 'canceled' then null else w.reservado_em end,
    lease_ate = case when w.status = 'canceled' then null else w.lease_ate end,
    atualizado_em = now()
  returning * into v;
  return jsonb_build_object('state', v.status, 'item_id', v.id);
end;
$$;

-- Reserva até p_limite itens (máx. 25) por 10 min. Antes, tira da fila o que já foi reservado 5 vezes sem entrega.
create or replace function public.ia_trabalho_reservar(p_token uuid, p_limite int default 10, p_tipos text[] default null)
returns setof jsonb language plpgsql security definer set search_path = public as $$
begin
  update ia_trabalho w
     set status = 'failed', resultado = jsonb_build_object('motivo', 'reservas_demais', 'reservas', w.reservas),
         atualizado_em = now()
   where w.status = 'claimed' and w.lease_ate < now() and w.reservas >= 5
     and (p_tipos is null or w.tipo = any (p_tipos));

  return query with escolhidos as (
    select w.id from ia_trabalho w
     where w.status in ('pending', 'claimed') and (w.status = 'pending' or w.lease_ate < now())
       and (p_tipos is null or w.tipo = any (p_tipos))
     -- Desempate fixo: mesma fila, mesma ordem.
     order by w.criado_em, w.id
     for update skip locked
     limit least(greatest(coalesce(p_limite, 10), 1), 25)
  ), reservados as (
    update ia_trabalho w
       set status = 'claimed', reservado_por = p_token, reservado_em = now(), lease_ate = now() + interval '10 minutes',
           reservas = w.reservas + 1, atualizado_em = now()
      from escolhidos e where w.id = e.id
    returning w.*
  )
  select jsonb_build_object('id', r.id, 'tipo', r.tipo, 'reservas', r.reservas, 'lease_ate', r.lease_ate, 'entrada', r.entrada)
    from reservados r order by r.criado_em, r.id;
end;
$$;

-- Confere que o item está reservado para este token e dentro do lease. A edge chama antes de gravar no domínio.
create or replace function public.ia_trabalho_conferir(p_token uuid, p_item uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when w.id is null then jsonb_build_object('state', 'blocked', 'reason', 'item_inexistente')
    when w.status <> 'claimed' or w.reservado_por is distinct from p_token or w.lease_ate < now()
      then jsonb_build_object('state', 'blocked', 'reason', 'lease_expirado')
    else jsonb_build_object('state', 'ok', 'tipo', w.tipo, 'entrada', w.entrada) end
  from (select 1) x left join ia_trabalho w on w.id = p_item;
$$;

-- Fecha o item: 'done' com o resultado já gravado no domínio, ou 'canceled' com o motivo (item que não tem mais
-- sentido: conversa reclassificada por chave nova, anexo apagado). Mesmo critério de lease do conferir.
create or replace function public.ia_trabalho_fechar(p_token uuid, p_item uuid, p_status text, p_resultado jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v ia_trabalho;
begin
  if p_status not in ('done', 'canceled') then
    return jsonb_build_object('state', 'blocked', 'reason', 'status_invalido');
  end if;
  select * into v from ia_trabalho where id = p_item for update;
  if v.id is null then return jsonb_build_object('state', 'blocked', 'reason', 'item_inexistente'); end if;
  if v.status <> 'claimed' or v.reservado_por is distinct from p_token or v.lease_ate < now() then
    return jsonb_build_object('state', 'blocked', 'reason', 'lease_expirado');
  end if;
  update ia_trabalho set status = p_status, resultado = p_resultado, concluido_em = now(), lease_ate = null,
         atualizado_em = now()
   where id = p_item;
  return jsonb_build_object('state', p_status, 'item_id', p_item);
end;
$$;

-- Saúde da fila por tipo, sem reservar nada. Reserva vencida conta como pendente (volta a acordar o agente).
create or replace function public.ia_trabalho_saude()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(m.tipo, jsonb_build_object(
    'motor', m.motor,
    'pendentes', (select count(*) from ia_trabalho w where w.tipo = m.tipo
                    and (w.status = 'pending' or (w.status = 'claimed' and w.lease_ate <= now()))),
    'reservados', (select count(*) from ia_trabalho w where w.tipo = m.tipo and w.status = 'claimed' and w.lease_ate > now()),
    'falhas_24h', (select count(*) from ia_trabalho w where w.tipo = m.tipo and w.status = 'failed'
                    and w.atualizado_em > now() - interval '24 hours'),
    'feitos_24h', (select count(*) from ia_trabalho w where w.tipo = m.tipo and w.status = 'done'
                    and w.concluido_em > now() - interval '24 hours'),
    'mais_antigo', (select min(w.criado_em) from ia_trabalho w where w.tipo = m.tipo
                    and (w.status = 'pending' or (w.status = 'claimed' and w.lease_ate <= now())))
  ) order by m.tipo), '{}'::jsonb)
  from ia_motor m;
$$;

revoke all on function public.ia_trabalho_enfileirar(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ia_trabalho_reservar(uuid, int, text[]) from public, anon, authenticated;
revoke all on function public.ia_trabalho_conferir(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ia_trabalho_fechar(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.ia_trabalho_saude() from public, anon, authenticated;
grant execute on function public.ia_trabalho_enfileirar(text, text, jsonb) to service_role;
grant execute on function public.ia_trabalho_reservar(uuid, int, text[]) to service_role;
grant execute on function public.ia_trabalho_conferir(uuid, uuid) to service_role;
grant execute on function public.ia_trabalho_fechar(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.ia_trabalho_saude() to service_role;
