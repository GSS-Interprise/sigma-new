-- Ficha do médico: o que ele fez na GSS (tabela da Ramone, item "Gestão do corpo clínico", parte 1, 21/11/2026).
-- Junta numa resposta só, para a aba "Na GSS" do prontuário (HistoricoGssMedico.tsx):
--   escalas do Dr. Escala: antigas (escalas_integradas, API de BI, dez/2025 a abr/2026) e atuais (drescala_plantoes);
--   produção paga pelo financeiro (financeiro_pagamentos), só plantões e horas, sem valores;
--   campanhas de prospecção em que ele entrou (campanha_leads pelo lead do médico).
-- O Dr. Escala não manda CRM: escala casa pelo nome (sem acento, minúsculo, espaços simples), como o SLA
-- (sla_telefone_do_medico). Nome repetido no cadastro = não casa (devolve casado_pelo_nome = false e o motivo),
-- para não mostrar o plantão de um médico na ficha de outro. Em 21/11: 90% dos nomes de escala casam.
-- Quem pode: quem vê o módulo médicos (has_permission 'medicos'/'visualizar'; admin sempre).

create or replace function public.medico_historico_gss(p_medico_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_med record;
  v_chave text;
  v_homonimos int;
  v_casa boolean;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not public.has_permission(auth.uid(), 'medicos', 'visualizar') then raise exception 'sem_permissao'; end if;

  select id, nome_completo, lead_id into v_med from medicos where id = p_medico_id;
  if v_med.id is null then raise exception 'medico_nao_encontrado'; end if;

  v_chave := lower(imm_unaccent(regexp_replace(btrim(coalesce(v_med.nome_completo, '')), '\s+', ' ', 'g')));
  select count(*) into v_homonimos from medicos
   where lower(imm_unaccent(regexp_replace(btrim(coalesce(nome_completo, '')), '\s+', ' ', 'g'))) = v_chave;
  v_casa := v_chave <> '' and v_homonimos = 1;

  with
  esc_antigas as (
    select coalesce(nullif(btrim(e.local_nome), ''), nullif(btrim(e.unidade), ''), 'Sem hospital') as hospital,
           nullif(btrim(coalesce(e.setor_nome, e.setor)), '') as setor, e.data_escala as data,
           -- carga_horaria_minutos vem zerada em boa parte da API de BI: sem ela, conta pelo horário (virada de dia soma 24 h).
           coalesce(nullif(e.carga_horaria_minutos, 0),
             (extract(epoch from (e.hora_fim - e.hora_inicio)) / 60
              + case when e.hora_fim <= e.hora_inicio then 1440 else 0 end)::int, 0) as minutos
      from escalas_integradas e
     where v_casa and lower(imm_unaccent(regexp_replace(btrim(coalesce(e.profissional_nome, '')), '\s+', ' ', 'g'))) = v_chave
  ),
  esc_atuais as (
    select coalesce(l.nome, 'Sem hospital') as hospital, s.nome as setor, p.data, p.inicio, p.fim,
           coalesce(extract(epoch from (p.fim - p.inicio)) / 60, 0)::int as minutos, p.id
      from drescala_plantoes p
      left join drescala_locais l on l.id = p.local_id
      left join drescala_setores s on s.id = p.setor_id
     where v_casa and not coalesce(p.furo, false)
       and coalesce(l.nome, '') not ilike '%local teste%'
       and lower(imm_unaccent(regexp_replace(btrim(coalesce(p.profissional_nome, '')), '\s+', ' ', 'g'))) = v_chave
  ),
  -- Os dois períodos não se sobrepõem hoje (antigas até abr/2026, atuais desde nov/2026); se um dia se sobrepuserem,
  -- o dia que existir nas atuais vale e o da antiga sai, para não contar o mesmo plantão duas vezes.
  passados as (
    select hospital, setor, data, minutos from esc_antigas
     where data < v_hoje and not exists (select 1 from esc_atuais a where a.data = esc_antigas.data)
    union all
    select hospital, setor, data, minutos from esc_atuais where data < v_hoje
  ),
  por_hospital as (
    select hospital, count(*) as plantoes, round(sum(minutos) / 60.0) as horas, min(data) as primeiro, max(data) as ultimo,
           (array_agg(distinct setor) filter (where setor is not null))[1:4] as setores
      from passados group by hospital
  ),
  proximos as (
    select hospital, setor, inicio, fim from esc_atuais where data >= v_hoje order by inicio, id limit 10
  ),
  producao as (
    select ano_referencia as ano, mes_referencia as mes, coalesce(nullif(btrim(unidade), ''), 'Sem unidade') as unidade,
           sum(coalesce(total_plantoes, 0)) as plantoes, round(sum(coalesce(total_horas_minutos, 0)) / 60.0) as horas, max(status) as status
      from financeiro_pagamentos where medico_id = v_med.id
     group by 1, 2, 3
  ),
  campanhas_m as (
    select c.nome, cl.status, cl.data_primeiro_contato, cl.conversa_id, cl.resultado_final, cl.created_at
      from campanha_leads cl join campanhas c on c.id = cl.campanha_id
     where v_med.lead_id is not null and cl.lead_id = v_med.lead_id
  )
  select jsonb_build_object(
    'nome', v_med.nome_completo,
    'casado_pelo_nome', v_casa,
    'motivo_sem_casar', case when v_chave = '' then 'sem_nome' when v_homonimos > 1 then 'nome_repetido' end,
    'resumo', jsonb_build_object(
      'plantoes', (select count(*) from passados),
      'horas', (select coalesce(round(sum(minutos) / 60.0), 0) from passados),
      'hospitais', (select count(*) from por_hospital),
      'primeiro', (select min(data) from passados),
      'ultimo', (select max(data) from passados),
      'proximos', (select count(*) from esc_atuais where data >= v_hoje)),
    'por_hospital', coalesce((select jsonb_agg(to_jsonb(h) order by h.plantoes desc, h.hospital) from por_hospital h), '[]'::jsonb),
    'proximos', coalesce((select jsonb_agg(to_jsonb(p) order by p.inicio) from proximos p), '[]'::jsonb),
    'producao', coalesce((select jsonb_agg(to_jsonb(x) order by x.ano desc, x.mes desc, x.unidade) from producao x), '[]'::jsonb),
    'campanhas', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from campanhas_m c), '[]'::jsonb),
    'fontes', jsonb_build_object(
      -- Há um buraco entre as duas fontes (mai a out/2026 não estão em nenhuma): a tela mostra o período coberto.
      'escalas_antigas_de', (select min(data_escala) from escalas_integradas),
      'escalas_antigas_ate', (select max(data_escala) from escalas_integradas),
      'dr_escala_desde', (select min(data) from drescala_plantoes),
      'dr_escala_lido_em', (select max(concluido_em) from drescala_sincronizacoes where status = 'ok'))
  ) into v_out;
  return v_out;
end $$;

revoke all on function public.medico_historico_gss(uuid) from public, anon;
grant execute on function public.medico_historico_gss(uuid) to authenticated;
