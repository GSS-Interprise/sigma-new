-- Regras dos avisos do SLA editáveis pela tela (19/11, pedido do Raul para Wagner e Brenda). Até aqui o prazo por
-- origem só mudava por SQL, e o aviso aos 80% e os 3 min entre ligações estavam fixos no código.
--   sla_prazos.minutos          prazo de laudo por origem (PS, internado, externo)
--   sla_aviso_pct               em que % do prazo o plantonista recebe o primeiro aviso (padrão 80)
--   sla_escada_intervalo_min    minutos entre uma ligação e a próxima da escada (padrão 3)

insert into public.config_lista_items (campo_nome, valor)
select v.k, v.d from (values ('sla_aviso_pct', '80'), ('sla_escada_intervalo_min', '3')) v(k, d)
 where not exists (select 1 from public.config_lista_items c where c.campo_nome = v.k);

-- Lê as regras de uma vez (a tela e quem mais precisar).
create or replace function public.sla_regras() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'prazos', (select jsonb_object_agg(origem, minutos) from sla_prazos),
    'aviso_pct', coalesce((select valor::int from config_lista_items where campo_nome = 'sla_aviso_pct'), 80),
    'intervalo_min', coalesce((select valor::int from config_lista_items where campo_nome = 'sla_escada_intervalo_min'), 3));
$$;
revoke all on function public.sla_regras() from public, anon;
grant execute on function public.sla_regras() to authenticated, service_role;

-- Salva as regras. Prazo novo vale também para os exames que ainda esperam laudo (vence_em recalculado a partir do
-- início): quem muda o PS de 2 h para 3 h espera ver a fila de agora mudar, não só os exames de amanhã.
create or replace function public.sla_regras_salvar(p_prazos jsonb, p_aviso_pct int, p_intervalo_min int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_origem text; v_min int; v_recalc int := 0; n int;
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  if p_aviso_pct is null or p_aviso_pct < 30 or p_aviso_pct > 95 then raise exception 'aviso_pct entre 30 e 95'; end if;
  if p_intervalo_min is null or p_intervalo_min < 1 or p_intervalo_min > 60 then raise exception 'intervalo entre 1 e 60 min'; end if;

  for v_origem, v_min in select key, value::int from jsonb_each_text(coalesce(p_prazos, '{}'::jsonb)) loop
    if v_min < 15 or v_min > 10080 then raise exception 'prazo de % entre 15 min e 7 dias', v_origem; end if;
    update sla_prazos set minutos = v_min, atualizado_em = now() where origem = v_origem and minutos <> v_min;
    if found then
      update sla_exames set vence_em = inicio_em + make_interval(mins => v_min)
       where origem = v_origem and saiu_em is null and assumido_em is null and silenciado_em is null;
      get diagnostics n = row_count;
      v_recalc := v_recalc + n;
    end if;
  end loop;

  update config_lista_items set valor = p_aviso_pct::text where campo_nome = 'sla_aviso_pct';
  update config_lista_items set valor = p_intervalo_min::text where campo_nome = 'sla_escada_intervalo_min';
  return sla_regras() || jsonb_build_object('exames_recalculados', v_recalc);
end;
$$;
revoke all on function public.sla_regras_salvar(jsonb, int, int) from public, anon;
grant execute on function public.sla_regras_salvar(jsonb, int, int) to authenticated;
