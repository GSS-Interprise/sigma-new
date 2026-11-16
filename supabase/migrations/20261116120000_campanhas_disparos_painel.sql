-- Indicador de disparos por dia no topo da aba Campanhas (/prospeccao), pedido do Raul em 16/11/2026 para os
-- sócios verem de longe se a máquina está rodando.
--
-- A contagem vem da MESMA função do Claude dos sócios (agente_campanhas_disparos_dia): médico conta no dia em Brasília
-- da PRIMEIRA mensagem de campanha. Ler a função em vez de contar de outro jeito impede tela e agente de divergirem.
--
-- Disparo = 1ª mensagem de campanha enviada a um médico (conta também a que a Meta não entregou), para comparar com a
-- estimativa, que é de envios. O "abordado" do Claude (só entregues) é o campo 'enviados' da mesma função.
--
-- estimativa_dia = quanto a máquina dispara por dia no ritmo atual: por campanha ativa pelo número oficial, o menor
-- entre (a) o limite diário (250 quando vazio, como o processOfficialBatch), (b) o que o intervalo entre mensagens
-- permite na janela de envio (fim - início, em minutos, dividido pelo intervalo médio) e (c) os médicos ainda na fila.

create or replace function public.campanhas_disparos_painel(p_dias int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias int := least(greatest(coalesce(p_dias, 7), 2), 31);
  v_serie jsonb;
  v_campanhas jsonb;
  v_teto int;
  v_ultimo timestamptz;
  v_fila int;
begin
  if auth.uid() is null then
    raise exception 'sem_permissao';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'medicos', d.medicos) order by d.dia), '[]'::jsonb)
    into v_serie
    from (
      select g.dia::date as dia,
             coalesce((select sum(x.enviados + x.falharam) from agente_campanhas_disparos_dia(g.dia::date) x), 0)::int as medicos
        from generate_series(v_hoje - (v_dias - 1), v_hoje, interval '1 day') g(dia)
    ) d;

  -- Estimativa e disparos de hoje por campanha ativa, para o sócio ver de onde vem o número.
  with est as (
    select c.id, trim(c.nome) as nome,
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
  hoje as (select x.campanha_id, (x.enviados + x.falharam)::int as n from agente_campanhas_disparos_dia(v_hoje) x)
  select coalesce(sum(e.estimativa), 0)::int,
         coalesce(jsonb_agg(jsonb_build_object('campanha', e.nome, 'hoje', coalesce(h.n, 0), 'estimativa', e.estimativa)
                            order by e.estimativa desc, e.nome, e.id) filter (where e.id is not null), '[]'::jsonb)
    into v_teto, v_campanhas
    from est e left join hoje h on h.campanha_id = e.id;

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
    'campanhas', v_campanhas
  );
end;
$$;

revoke all on function public.campanhas_disparos_painel(int) from public, anon;
grant execute on function public.campanhas_disparos_painel(int) to authenticated, service_role;
