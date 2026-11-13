-- Claude dos sócios da GSS, T3 (docs/arquitetura/claude-socios-gss.md).
-- 1) A carga do Dr. Escala leva ~7 min (378 chamadas com pausa por causa do 429 deles). rotina_pegar devolvia à
--    fila o pedido "executando" há mais de 10 min, o que faria duas cargas rodarem juntas num dia lento.
--    Sobe para 20 min (vale para todas as rotinas; a do Life's Hub leva menos de 1 min).
-- 2) pg_cron pede a rotina drescala_escalas 3 vezes ao dia: 06h, 12h e 18h de Brasília (09, 15 e 21 UTC).
--    Insert direto (rotina_pedir exige usuário logado). Não pede outra se já houver uma pendente ou rodando.

create or replace function public.rotina_pegar(p_worker text, p_tipos text[], p_limite int default 1)
returns setof public.rotina_pedidos
language plpgsql
security definer
set search_path = public
as $$
begin
  update rotina_pedidos
     set status = case when tentativas >= 3 then 'erro' else 'pendente' end,
         erro = case when tentativas >= 3 then 'worker parou no meio 3 vezes' else erro end,
         concluido_em = case when tentativas >= 3 then now() else null end
   where status = 'executando' and iniciado_em < now() - interval '20 minutes';

  return query
  update rotina_pedidos r
     set status = 'executando', iniciado_em = now(), tentativas = r.tentativas + 1, worker = p_worker
   where r.id in (
     select id from rotina_pedidos
      where status = 'pendente' and tipo = any(p_tipos)
      order by criado_em
      limit greatest(1, least(p_limite, 10))
      for update skip locked)
  returning r.*;
end;
$$;

do $$
begin
  perform cron.unschedule('drescala-escalas') where exists (select 1 from cron.job where jobname = 'drescala-escalas');
  perform cron.schedule('drescala-escalas', '0 9,15,21 * * *', $c$
    insert into public.rotina_pedidos (tipo, payload)
    select 'drescala_escalas', '{}'::jsonb
     where not exists (select 1 from public.rotina_pedidos
                        where tipo = 'drescala_escalas' and status in ('pendente', 'executando'));
  $c$);
end $$;
