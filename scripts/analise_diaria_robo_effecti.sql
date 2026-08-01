-- =====================================================================
-- Analise diaria robo x Effecti - responde as 3 perguntas do Raul.
--
--   1. O robo capta MAIS editais bons que a Effecti?
--   2. O robo pega TUDO que a Effecti pega?
--   3. Falta algum de verdade?
--
-- Roda 1x/dia e grava um retrato. No fim da semana, a serie responde as
-- tres com dado acumulado, nao com uma foto de um dia so.
--
-- ATENCAO AO DENOMINADOR: "a equipe manteve" NAO e "a equipe quer". Dos 61
-- mantidos em 30 dias, 13 eram lixo que ninguem descartou - materiais
-- eletricos, brinquedos inflaveis, bandeiras, ar-condicionado. Por isso a
-- analise separa o que tem sinal medico do que nao tem: medir recall contra
-- o universo sujo subestima o robo em ~20 pontos.
-- =====================================================================

create table if not exists analise_robo_effecti (
  id            bigserial primary key,
  dia           date not null default current_date,
  -- pergunta 1: volume
  robo_captou           int,   -- editais relevantes que o robo achou no dia
  effecti_entregou      int,   -- cards novos que a Effecti mandou no dia
  -- pergunta 2 e 3: sobreposicao (janela movel de 30 dias)
  universo_mantido      int,   -- a equipe recebeu e nao descartou
  universo_com_sinal    int,   -- desses, os que tem sinal medico (denominador limpo)
  robo_pegou            int,
  falha_classificacao   int,   -- esta no espelho, score baixo
  falha_cobertura       int,   -- nem esta no espelho
  recall_bruto          numeric(5,1),
  recall_limpo          numeric(5,1),
  detalhe               jsonb,
  criado_em             timestamptz not null default now(),
  unique (dia)
);

grant select, insert, update on analise_robo_effecti to authenticated, service_role;
grant usage, select on sequence analise_robo_effecti_id_seq to authenticated, service_role;

comment on table analise_robo_effecti is
  'Retrato diario da comparacao robo x Effecti. recall_limpo desconta do '
  'denominador o lixo que a equipe recebeu e nao descartou (21% em 30 dias).';

-- Sinal medico: separa o que a GSS de fato quer do lixo que a Effecti manda.
-- Deliberadamente mais LARGO que o classificador de promocao - aqui o objetivo
-- e nao contar lixo como "perdido", nao decidir o que promover.
create or replace function tem_sinal_medico(p_texto text)
returns boolean language sql immutable as $$
  select lower(imm_unaccent(coalesce(p_texto, ''))) ~
    'medic|saude|hospital|plantao|consulta|exame|clinic|ambulator|enfermag|'
    'psiquiatr|psicolog|fonoaudiolog|fisioterap|terapia|odontolog|laborator|'
    'diagnostic|laudo|radiolog|ultrassonograf|credenciamento de pessoa|sus\M'
$$;

grant execute on function tem_sinal_medico(text) to authenticated, service_role;

-- Roda a analise do dia e grava.
create or replace function rodar_analise_robo_effecti()
returns analise_robo_effecti language plpgsql
security definer set search_path to 'public' as $$
declare
  r analise_robo_effecti;
  v_robo int; v_effecti int;
  v_univ int; v_univ_sinal int; v_pegou int; v_classif int; v_cobert int;
begin
  -- Pergunta 1: volume do dia
  select count(*) into v_robo
    from pncp_mirror
   where portal = 'pncp' and score_gss >= 3 and modalidade_id <> 9
     and data_publicacao::date = current_date - 1;

  select count(*) into v_effecti
    from licitacoes
   where board = 'effecti' and fonte = 'n8n'
     and created_at::date = current_date - 1;

  -- Perguntas 2 e 3: sobreposicao na janela de 30 dias
  select
    count(*),
    count(*) filter (where tem_sinal_medico(coalesce(u.objeto, '') || ' ' || u.titulo)),
    count(*) filter (where v.veredito = 'PEGOU'),
    count(*) filter (where v.veredito = 'SCORE_BAIXO'
                       and tem_sinal_medico(coalesce(u.objeto, '') || ' ' || u.titulo)),
    count(*) filter (where v.veredito = 'NAO_CAPTUROU'
                       and tem_sinal_medico(coalesce(u.objeto, '') || ' ' || u.titulo))
    into v_univ, v_univ_sinal, v_pegou, v_classif, v_cobert
    from paridade_veredito_v2 v
    join paridade_universo_v2 u on u.id = v.id
   where v.dia >= current_date - 30;

  insert into analise_robo_effecti (
    dia, robo_captou, effecti_entregou, universo_mantido, universo_com_sinal,
    robo_pegou, falha_classificacao, falha_cobertura,
    recall_bruto, recall_limpo, detalhe)
  values (
    current_date, v_robo, v_effecti, v_univ, v_univ_sinal,
    v_pegou, v_classif, v_cobert,
    round(100.0 * v_pegou / nullif(v_univ, 0), 1),
    round(100.0 * v_pegou / nullif(v_univ_sinal, 0), 1),
    jsonb_build_object(
      'lixo_no_universo', v_univ - v_univ_sinal,
      'janela_dias', 30,
      'observacao', 'recall_limpo desconta o lixo que a equipe nao descartou'))
  on conflict (dia) do update set
    robo_captou = excluded.robo_captou,
    effecti_entregou = excluded.effecti_entregou,
    universo_mantido = excluded.universo_mantido,
    universo_com_sinal = excluded.universo_com_sinal,
    robo_pegou = excluded.robo_pegou,
    falha_classificacao = excluded.falha_classificacao,
    falha_cobertura = excluded.falha_cobertura,
    recall_bruto = excluded.recall_bruto,
    recall_limpo = excluded.recall_limpo,
    detalhe = excluded.detalhe,
    criado_em = now()
  returning * into r;

  return r;
end $$;

grant execute on function rodar_analise_robo_effecti() to authenticated, service_role;

-- Leitura consolidada: e isto que responde as 3 perguntas de uma vez.
create or replace view analise_robo_effecti_resumo as
select
  count(*)                                          dias_medidos,
  sum(robo_captou)                                  robo_total,
  sum(effecti_entregou)                             effecti_total,
  round(avg(robo_captou), 1)                        robo_media_dia,
  round(avg(effecti_entregou), 1)                   effecti_media_dia,
  case when sum(effecti_entregou) > 0
       then round(sum(robo_captou)::numeric / sum(effecti_entregou), 1)
  end                                               quantas_vezes_mais,
  max(universo_com_sinal)                           universo_limpo_atual,
  max(recall_limpo)                                 melhor_recall_limpo,
  min(recall_limpo)                                 pior_recall_limpo,
  (select falha_cobertura from analise_robo_effecti order by dia desc limit 1) falta_hoje
  from analise_robo_effecti;

grant select on analise_robo_effecti_resumo to authenticated, service_role;
