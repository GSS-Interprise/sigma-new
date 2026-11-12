-- SLA de laudos: nome do paciente e estudo nos avisos (decisão do Raul, 12/11, pedido do Wagner).
-- O nome fica só enquanto o exame está na fila: quando sai (laudado), paciente vira null. Exames que já saíram
-- não guardam nome.
alter table public.sla_exames add column if not exists paciente text;
alter table public.sla_exames add column if not exists estudo text;

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

  create temp table if not exists _sla_atual (data_exame date, hora_min text, origem text, hora_seg text, n int, paciente text, estudo text) on commit drop;
  truncate _sla_atual;
  insert into _sla_atual
  select d, hm, o, max(hs), count(*), max(pac), max(est)
  from (
    select
      -- Sem data legível: dia de hoje; hora mais de 10 min no futuro é de ontem (virada da meia-noite).
      -- Data lida pelo OCR (ou hoje). Exame não pode estar no futuro: data + hora depois de agora + 10 min é do
      -- dia anterior (OCR trocou a data, ou a lista mostra exame de ontem sem data legível). Caso real de 12/11.
      case when coalesce((l->>'data')::date, v_local::date) + (left(l->>'hora', 5) || ':00')::time > v_local + interval '10 minutes'
           then coalesce((l->>'data')::date, v_local::date) - 1
           else coalesce((l->>'data')::date, v_local::date) end as d,
      left(l->>'hora', 5) as hm,
      case lower(l->>'origem') when 'ps' then 'ps' when 'internado' then 'internado' when 'externo' then 'externo' end as o,
      case when length(l->>'hora') = 8 then l->>'hora' end as hs,
      nullif(left(trim(l->>'paciente'), 120), '') as pac,
      nullif(left(trim(l->>'estudo'), 120), '') as est
    from jsonb_array_elements(p_linhas) l
    where l->>'hora' ~ '^\d{2}:\d{2}(:\d{2})?$'
  ) x
  where o is not null
  group by d, hm, o;

  -- Grupos da leitura atual + grupos com exame aberto (para achar quem saiu).
  for g in
    select a.data_exame, a.hora_min, a.origem, a.hora_seg, coalesce(a.n, 0) as n, a.paciente, a.estudo
    from _sla_atual a
    union
    select distinct s.data_exame, s.hora_min, s.origem, null, 0, null, null
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
          visto_completo_em = case when coalesce(p_cheia, false) then visto_completo_em else p_lida_em end,
          paciente = coalesce(g.paciente, paciente), estudo = coalesce(g.estudo, estudo),
          hora_exame = coalesce(g.hora_seg::time, hora_exame),
          precisao = case when g.hora_seg is not null then 'segundo' else precisao end
        where id = e.id;
      elsif not coalesce(p_cheia, false) then
        -- Ausente. Lista cheia (passa de uma tela) não prova saída: só marca quando a leitura viu a fila inteira.
        update sla_exames set
          saiu_em = case when ausente_em is not null then ausente_em end,
          -- Nome do paciente só enquanto o exame está na fila (LGPD; texto da proposta): sai da fila, apaga.
          paciente = case when ausente_em is not null then null else paciente end,
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
                                visto_primeiro_em, visto_ultimo_em, visto_completo_em, paciente, estudo)
        select p_unidade, g.data_exame, g.hora_min, v_max + k, g.origem,
               coalesce(g.hora_seg, g.hora_min || ':00')::time,
               case when g.hora_seg is null then 'minuto' else 'segundo' end,
               (g.data_exame + coalesce(g.hora_seg, g.hora_min || ':00')::time) at time zone 'America/Sao_Paulo',
               ((g.data_exame + coalesce(g.hora_seg, g.hora_min || ':00')::time) at time zone 'America/Sao_Paulo')
                 + make_interval(mins => p.minutos),
               p_lida_em, p_lida_em, case when coalesce(p_cheia, false) then null else p_lida_em end, g.paciente, g.estudo
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
