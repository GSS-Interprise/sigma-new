-- Regras do SLA de laudos que estavam fixas no código passam a ser editáveis na aba Avisos (Raul, 25/11/2026: "toda a
-- cadeia de mensagens e tempos de alertas dentro do Sigma precisa ser editável"). Ficam em config_lista_items e o
-- sla-alertas lê a cada rodada (padrão entre parênteses, valor antigo do código):
--   sla_assumido_folga_min   assumiu e não laudou: avisar N min depois do vencimento (5; pedido da Ramone em 25/11)
--   sla_avisar_externo       exame externo avisa o plantão (false; Wagner, 24/11)
--   sla_max_atraso_min       para de avisar N min depois do vencimento; o resto fica para o resumo (120; trava de 16/11)
--   sla_estacao_limite_min   estação parada depois de N min sem leitura boa (15)
--   sla_estacao_lembrete_h   repete o WhatsApp de estação parada a cada N h (3)
--   sla_resumo_hora          hora (Brasília) do resumo diário por e-mail; o período vai dessa hora à mesma hora (7)
-- Continua fixo: o teto de 10 avisos por rodada (trava de segurança, não regra de negócio) e o texto dos WhatsApps
-- (modelos aprovados pela Meta).

-- Versão anterior desta migration (25/11, só a folga do assumido): troca pelas funções gerais abaixo.
drop function if exists public.sla_assumido_folga();
drop function if exists public.sla_assumido_folga_salvar(int);

insert into public.config_lista_items (campo_nome, valor)
select k, v from (values
  ('sla_assumido_folga_min', '5'), ('sla_avisar_externo', 'false'), ('sla_max_atraso_min', '120'),
  ('sla_estacao_limite_min', '15'), ('sla_estacao_lembrete_h', '3'), ('sla_resumo_hora', '7')
) as d(k, v)
where not exists (select 1 from public.config_lista_items c where c.campo_nome = d.k);

create or replace function public.sla_regras_extras()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  select jsonb_object_agg(campo_nome, valor) into v from config_lista_items
   where campo_nome in ('sla_assumido_folga_min', 'sla_avisar_externo', 'sla_max_atraso_min',
                        'sla_estacao_limite_min', 'sla_estacao_lembrete_h', 'sla_resumo_hora');
  return jsonb_build_object(
    'assumido_folga_min', coalesce((v->>'sla_assumido_folga_min')::int, 5),
    'avisar_externo', coalesce(v->>'sla_avisar_externo', 'false') = 'true',
    'max_atraso_min', coalesce((v->>'sla_max_atraso_min')::int, 120),
    'estacao_limite_min', coalesce((v->>'sla_estacao_limite_min')::int, 15),
    'estacao_lembrete_h', coalesce((v->>'sla_estacao_lembrete_h')::int, 3),
    'resumo_hora', coalesce((v->>'sla_resumo_hora')::int, 7));
end $$;

create or replace function public.sla_regras_extras_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  folga int := (p->>'assumido_folga_min')::int;
  maxat int := (p->>'max_atraso_min')::int;
  lim int := (p->>'estacao_limite_min')::int;
  lem int := (p->>'estacao_lembrete_h')::int;
  hr int := (p->>'resumo_hora')::int;
  ext boolean := (p->>'avisar_externo')::boolean;
  v_job bigint;
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  -- Até 120: os passos da sequência também vão no máximo até 2 h depois do prazo (sla_aviso_passos).
  if maxat is null or maxat < 30 or maxat > 120 then raise exception 'Parar de avisar: entre 30 e 120 minutos depois do prazo.'; end if;
  if folga is null or folga < 0 or folga >= maxat then raise exception 'Assumiu e não laudou: de 0 até menos que o "parar de avisar" (% min).', maxat; end if;
  if lim is null or lim < 6 or lim > 60 then raise exception 'Estação parada: entre 6 e 60 minutos sem leitura.'; end if;
  if lem is null or lem < 1 or lem > 24 then raise exception 'Repetir aviso de estação: entre 1 e 24 horas.'; end if;
  if hr is null or hr < 0 or hr > 23 then raise exception 'Hora do resumo: entre 0 e 23.'; end if;
  if ext is null then raise exception 'Avisar externo: sim ou não.'; end if;

  update config_lista_items c set valor = d.v from (values
    ('sla_assumido_folga_min', folga::text), ('sla_avisar_externo', ext::text), ('sla_max_atraso_min', maxat::text),
    ('sla_estacao_limite_min', lim::text), ('sla_estacao_lembrete_h', lem::text), ('sla_resumo_hora', hr::text)
  ) as d(k, v) where c.campo_nome = d.k;

  -- Resumo diário: o cron roda em UTC (Brasília = UTC-3, sem horário de verão desde 2019).
  select jobid into v_job from cron.job where jobname = 'sla-indicadores-7h';
  if v_job is not null then
    perform cron.alter_job(v_job, schedule := format('0 %s * * *', (hr + 3) % 24));
  end if;
  return public.sla_regras_extras();
end $$;

revoke all on function public.sla_regras_extras() from public, anon;
revoke all on function public.sla_regras_extras_salvar(jsonb) from public, anon;
grant execute on function public.sla_regras_extras() to authenticated;
grant execute on function public.sla_regras_extras_salvar(jsonb) to authenticated;
