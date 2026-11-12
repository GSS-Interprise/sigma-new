-- SLA de laudos (radiologia GSS): coletor que lê a fila "Não lido" do Vue PACS por OCR na estação da GSS
-- e manda só hora, data e origem de cada exame. Nome de paciente NÃO entra no banco (LGPD; o Marieta é sensível).
-- Doc: Vault Projetos/GSS-SLA-Laudos-Radiologia.md.

-- Prazo por origem (a cor da linha no PACS). AVC (30 min) ainda não aparece na tela de forma conhecida.
create table if not exists public.sla_prazos (
  origem text primary key check (origem in ('ps', 'internado', 'externo')),
  minutos int not null check (minutos > 0),
  atualizado_em timestamptz not null default now()
);
insert into public.sla_prazos (origem, minutos) values ('ps', 120), ('internado', 240), ('externo', 2880)
on conflict (origem) do nothing;

-- Uma linha por leitura da tela: é a prova de vida do coletor (leitura parada = estação, VPN ou PACS caídos).
create table if not exists public.sla_leituras (
  id bigint generated always as identity primary key,
  unidade text not null,
  lida_em timestamptz not null,
  recebida_em timestamptz not null default now(),
  status text not null check (status in ('ok', 'sem_grade', 'erro')),
  cheia boolean not null default false,
  linhas int not null default 0,
  novos int not null default 0,
  sairam int not null default 0,
  detalhe jsonb
);
create index if not exists sla_leituras_unidade_lida on public.sla_leituras (unidade, lida_em desc);

-- Um exame na fila. Sem identificador do PACS na tela, a chave é data + hora (minuto) + origem + ordem:
-- exames com a mesma chave têm o mesmo início e o mesmo prazo, então trocar um pelo outro não muda o SLA.
create table if not exists public.sla_exames (
  id uuid primary key default gen_random_uuid(),
  unidade text not null,
  data_exame date not null,
  hora_min text not null check (hora_min ~ '^\d{2}:\d{2}$'),
  ordem int not null,
  origem text not null references public.sla_prazos (origem),
  hora_exame time not null,
  precisao text not null default 'segundo' check (precisao in ('segundo', 'minuto')),
  inicio_em timestamptz not null,
  vence_em timestamptz not null,
  visto_primeiro_em timestamptz not null,
  visto_ultimo_em timestamptz not null,
  leituras int not null default 1,
  -- Saída da fila só conta depois de 2 leituras seguidas sem o exame (1 leitura ruim do OCR não fecha nada).
  ausente_em timestamptz,
  saiu_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (unidade, data_exame, hora_min, origem, ordem)
);
create index if not exists sla_exames_abertos on public.sla_exames (unidade, vence_em) where saiu_em is null;

alter table public.sla_prazos enable row level security;
alter table public.sla_leituras enable row level security;
alter table public.sla_exames enable row level security;
drop policy if exists sla_prazos_ler on public.sla_prazos;
create policy sla_prazos_ler on public.sla_prazos for select to authenticated using (true);
drop policy if exists sla_leituras_ler on public.sla_leituras;
create policy sla_leituras_ler on public.sla_leituras for select to authenticated using (true);
drop policy if exists sla_exames_ler on public.sla_exames;
create policy sla_exames_ler on public.sla_exames for select to authenticated using (true);
-- Tabela criada por SQL não ganha GRANT sozinha (incidente 18/05).
grant select on public.sla_prazos, public.sla_leituras, public.sla_exames to authenticated;
grant all on public.sla_prazos, public.sla_leituras, public.sla_exames to service_role;

-- Registra uma leitura e atualiza a fila. p_linhas: [{ "data": "2026-11-12" | null, "hora": "08:16:53" | "08:33", "origem": "PS" | "Internado" | "Externo" }]
create or replace function public.sla_registrar_leitura(
  p_unidade text, p_lida_em timestamptz, p_status text, p_cheia boolean, p_linhas jsonb, p_detalhe jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_leitura bigint;
  v_local timestamp := p_lida_em at time zone 'America/Sao_Paulo';
  v_novos int := 0;
  v_sairam int := 0;
  g record;
  e record;
  v_abertos int;
  v_max int;
  i int;
begin
  insert into sla_leituras (unidade, lida_em, status, cheia, linhas, detalhe)
  values (p_unidade, p_lida_em, p_status, coalesce(p_cheia, false), coalesce(jsonb_array_length(p_linhas), 0), p_detalhe)
  returning id into v_leitura;

  -- Leitura sem linhas não prova fila vazia (tela pode estar coberta, bloqueada ou em outra pasta): não mexe em nada.
  if p_status <> 'ok' or coalesce(jsonb_array_length(p_linhas), 0) = 0 then
    return jsonb_build_object('leitura', v_leitura, 'novos', 0, 'sairam', 0);
  end if;

  create temp table if not exists _sla_atual (data_exame date, hora_min text, origem text, hora_seg text, n int) on commit drop;
  truncate _sla_atual;
  insert into _sla_atual
  select d, hm, o, max(hs), count(*)
  from (
    select
      -- Sem data legível: dia de hoje; hora mais de 10 min no futuro é de ontem (virada da meia-noite).
      coalesce((l->>'data')::date,
        case when (left(l->>'hora', 5) || ':00')::time > (v_local + interval '10 minutes')::time
             then (v_local - interval '1 day')::date else v_local::date end) as d,
      left(l->>'hora', 5) as hm,
      case lower(l->>'origem') when 'ps' then 'ps' when 'internado' then 'internado' when 'externo' then 'externo' end as o,
      case when length(l->>'hora') = 8 then l->>'hora' end as hs
    from jsonb_array_elements(p_linhas) l
    where l->>'hora' ~ '^\d{2}:\d{2}(:\d{2})?$'
  ) x
  where o is not null
  group by d, hm, o;

  -- Grupos da leitura atual + grupos com exame aberto (para achar quem saiu).
  for g in
    select a.data_exame, a.hora_min, a.origem, a.hora_seg, coalesce(a.n, 0) as n
    from _sla_atual a
    union
    select distinct s.data_exame, s.hora_min, s.origem, null, 0
    from sla_exames s
    where s.unidade = p_unidade and s.saiu_em is null
      and not exists (select 1 from _sla_atual a where a.data_exame = s.data_exame and a.hora_min = s.hora_min and a.origem = s.origem)
  loop
    i := 0;
    -- Presentes: os n primeiros abertos do grupo, por ordem.
    for e in
      select id from sla_exames
      where unidade = p_unidade and data_exame = g.data_exame and hora_min = g.hora_min and origem = g.origem and saiu_em is null
      order by ordem
    loop
      i := i + 1;
      if i <= g.n then
        update sla_exames set visto_ultimo_em = p_lida_em, leituras = leituras + 1, ausente_em = null,
          hora_exame = coalesce(g.hora_seg::time, hora_exame),
          precisao = case when g.hora_seg is not null then 'segundo' else precisao end
        where id = e.id;
      elsif not coalesce(p_cheia, false) then
        -- Ausente. Lista cheia (passa de uma tela) não prova saída: só marca quando a leitura viu a fila inteira.
        update sla_exames set
          saiu_em = case when ausente_em is not null then ausente_em end,
          ausente_em = coalesce(ausente_em, p_lida_em)
        where id = e.id
        returning (saiu_em is not null)::int into v_abertos;
        v_sairam := v_sairam + coalesce(v_abertos, 0);
      end if;
    end loop;

    -- Novos: o grupo tem mais linhas na tela do que exames abertos.
    if g.n > i then
      select coalesce(max(ordem), 0) into v_max from sla_exames
      where unidade = p_unidade and data_exame = g.data_exame and hora_min = g.hora_min and origem = g.origem;
      for k in 1 .. (g.n - i) loop
        insert into sla_exames (unidade, data_exame, hora_min, ordem, origem, hora_exame, precisao, inicio_em, vence_em,
                                visto_primeiro_em, visto_ultimo_em)
        select p_unidade, g.data_exame, g.hora_min, v_max + k, g.origem,
               coalesce(g.hora_seg, g.hora_min || ':00')::time,
               case when g.hora_seg is null then 'minuto' else 'segundo' end,
               (g.data_exame + coalesce(g.hora_seg, g.hora_min || ':00')::time) at time zone 'America/Sao_Paulo',
               ((g.data_exame + coalesce(g.hora_seg, g.hora_min || ':00')::time) at time zone 'America/Sao_Paulo')
                 + make_interval(mins => p.minutos),
               p_lida_em, p_lida_em
        from sla_prazos p where p.origem = g.origem;
        v_novos := v_novos + 1;
      end loop;
    end if;
  end loop;

  update sla_leituras set novos = v_novos, sairam = v_sairam where id = v_leitura;
  return jsonb_build_object('leitura', v_leitura, 'novos', v_novos, 'sairam', v_sairam);
end;
$$;
revoke all on function public.sla_registrar_leitura(text, timestamptz, text, boolean, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sla_registrar_leitura(text, timestamptz, text, boolean, jsonb, jsonb) to service_role;
