-- Escala real do SLA vinda do Dr. Escala (19/11). Até aqui a escala do SLA (sla_plantao) era preenchida à mão e
-- estava vazia: o motor só mandava e-mail de "ninguém na escala". Agora os plantões de sobreaviso de radiologia
-- que o robô do Dr. Escala já traz (drescala_plantoes, 06h/12h/18h) viram linhas de sla_plantao, com o telefone do
-- cadastro de médicos (pelo nome: o Dr. Escala não manda CRM). Furo do Dr. Escala não vira linha: sem ninguém, o
-- motor avisa a coordenação por e-mail, que é o comportamento certo.

alter table public.sla_plantao add column if not exists modalidade text;            -- 'TC' | 'US' | null (qualquer)
alter table public.sla_plantao add column if not exists drescala_plantao_id bigint;  -- origem da linha, quando veio do Dr. Escala
create unique index if not exists sla_plantao_drescala_uq on public.sla_plantao (drescala_plantao_id);

-- Quais setores do Dr. Escala alimentam o SLA de qual unidade. Unidade nova = uma linha aqui.
create table if not exists public.sla_escala_setores (
  setor_id bigint primary key,
  unidade text not null,
  modalidade text not null,
  papel text not null default 'plantonista',
  observacao text
);
alter table public.sla_escala_setores enable row level security;
drop policy if exists sla_escala_setores_ler on public.sla_escala_setores;
create policy sla_escala_setores_ler on public.sla_escala_setores for select to authenticated using (true);
grant select on public.sla_escala_setores to authenticated;
grant all on public.sla_escala_setores to service_role;

insert into public.sla_escala_setores (setor_id, unidade, modalidade, observacao) values
  (46, 'marieta', 'TC', 'Marieta - Sobreaviso Tomografia'),
  (47, 'marieta', 'US', 'Marieta - Sobreaviso Ultrassom')
on conflict (setor_id) do nothing;

-- Telefone do médico pelo nome (sem acento, minúsculo, espaços simples), só dígitos com 55. Ambíguo (dois médicos
-- com o mesmo nome e telefones diferentes) = sem telefone: melhor o aviso cair no e-mail que ligar para a pessoa errada.
create or replace function public.sla_telefone_do_medico(p_nome text)
returns table (medico_id uuid, telefone text)
language sql
stable
security definer
set search_path = public
as $$
  with alvo as (select lower(imm_unaccent(regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g'))) as k),
  c as (
    select m.id, regexp_replace(coalesce(m.telefone, ''), '\D', '', 'g') as d
      from public.medicos m, alvo
     where m.nome_completo is not null and alvo.k <> ''
       and lower(imm_unaccent(regexp_replace(btrim(m.nome_completo), '\s+', ' ', 'g'))) = alvo.k
  ),
  n as (select id, case when length(d) in (10, 11) then '55' || d else d end as tel from c where length(d) >= 10)
  select (array_agg(id order by id))[1], min(tel)
    from n
  having count(distinct tel) = 1;
$$;

create or replace function public.sla_sincronizar_escala()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins int := 0; v_del int := 0; v_sem_tel int := 0;
begin
  -- Janela: de ontem até 14 dias à frente (o Dr. Escala sincroniza esse período).
  with fonte as (
    select p.id as dp_id, s.unidade, s.modalidade, s.papel, p.inicio, p.fim, p.profissional_nome as nome,
           t.medico_id, t.telefone
      from public.drescala_plantoes p
      join public.sla_escala_setores s on s.setor_id = p.setor_id
      left join lateral public.sla_telefone_do_medico(p.profissional_nome) t on true
     where p.data between current_date - 1 and current_date + 14
       and coalesce(p.furo, false) = false and p.profissional_nome is not null
       and p.inicio is not null and p.fim is not null
  ), up as (
    insert into public.sla_plantao (unidade, papel, inicio, fim, medico_id, nome, telefone, modalidade, drescala_plantao_id)
    select unidade, papel, inicio, fim, medico_id, nome, telefone, modalidade, dp_id from fonte
    on conflict (drescala_plantao_id) do update
      set unidade = excluded.unidade, papel = excluded.papel, inicio = excluded.inicio, fim = excluded.fim,
          medico_id = excluded.medico_id, nome = excluded.nome, telefone = excluded.telefone,
          modalidade = excluded.modalidade, atualizado_em = now()
    returning 1
  )
  select count(*) into v_ins from up;

  -- Plantão que sumiu do Dr. Escala (trocado, virou furo) sai da escala do SLA. Só futuros e em curso:
  -- os passados ficam porque os alertas apontam para eles (plantao_id).
  delete from public.sla_plantao sp
   where sp.drescala_plantao_id is not null and sp.fim > now()
     and not exists (
       select 1 from public.drescala_plantoes p join public.sla_escala_setores s on s.setor_id = p.setor_id
        where p.id = sp.drescala_plantao_id and coalesce(p.furo, false) = false and p.profissional_nome is not null);
  get diagnostics v_del = row_count;

  select count(*) into v_sem_tel from public.sla_plantao
   where drescala_plantao_id is not null and fim > now() and coalesce(telefone, '') = '';

  return jsonb_build_object('gravados', v_ins, 'removidos', v_del, 'futuros_sem_telefone', v_sem_tel);
end;
$$;

revoke all on function public.sla_sincronizar_escala() from public, anon;
grant execute on function public.sla_sincronizar_escala() to authenticated, service_role;
revoke all on function public.sla_telefone_do_medico(text) from public, anon;
grant execute on function public.sla_telefone_do_medico(text) to authenticated, service_role;

-- A cada 30 min (o Dr. Escala atualiza 06h/12h/18h; a meia hora cobre a troca de plantão feita no meio do dia).
select cron.unschedule(jobid) from cron.job where jobname = 'sla-escala-drescala';
select cron.schedule('sla-escala-drescala', '*/30 * * * *', $$select public.sla_sincronizar_escala()$$);

select public.sla_sincronizar_escala();
