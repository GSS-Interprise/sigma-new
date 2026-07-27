-- =====================================================================
-- crawl_health - o robo prova que esta vivo, ou grita.
--
-- POR QUE EXISTE: em uma unica semana esta frente teve CINCO falhas com a
-- mesma assinatura - status "sucesso", log limpo, ZERO trabalho feito:
--   1. espelho lacrando dia vazio        -> ingestao parada 5 dias
--   2. pagina truncada selando dia meio  -> 18/07 com 232 de ~6.000
--   3. checkpoint que nunca avancava     -> re-buscava pagina 1 pra sempre
--   4. classificador com recall de 8%    -> "funcionando", achando nada
--   5. crawler BLL com chave instavel    -> reinseriria tudo a cada rodada
-- Nenhuma disparou erro. Todas foram achadas por alguem olhando na mao.
--
-- Enquanto a Effecti esta no ar, esse silencio custa tempo. Depois do corte,
-- custa LICITACAO PERDIDA com prazo vencendo. Por isso o monitor e' condicao
-- para o corte, nao um extra.
--
-- A ideia: cada rodada de captura DECLARA o que observou e o minimo que
-- esperava. Duas perguntas passam a ter resposta automatica:
--   "faz quanto tempo que essa fonte nao roda?"     (silencio)
--   "essa rodada trouxe menos do que o normal?"     (degradacao)
-- =====================================================================

create table if not exists crawl_health (
  id           bigserial primary key,
  fonte        text not null,              -- 'pncp-mirror-sync', 'crawl-bll', ...
  chave        text not null default '-',  -- subdivisao: modalidade, dia, perfil
  observado    int  not null,              -- quanto veio nesta rodada
  esperado_min int,                        -- piso conhecido; null = so registra
  ok           boolean generated always as (esperado_min is null or observado >= esperado_min) stored,
  detalhe      jsonb,
  rodada_em    timestamptz not null default now()
);

grant select, insert on crawl_health to authenticated, service_role;
grant usage, select on sequence crawl_health_id_seq to authenticated, service_role;

create index if not exists idx_crawl_health_fonte_data on crawl_health (fonte, rodada_em desc);
-- indice parcial: a consulta de alerta so olha o que falhou
create index if not exists idx_crawl_health_falha on crawl_health (rodada_em desc) where not ok;

comment on table crawl_health is
  'Batimento cardiaco das fontes de captura. Cada rodada declara observado vs '
  'esperado_min. Serve para detectar os dois modos de falha silenciosa: SILENCIO '
  '(fonte parou de rodar) e DEGRADACAO (rodou mas trouxe muito menos que o normal).';

-- Registra uma rodada. SECURITY DEFINER porque as edges usam service_role mas
-- a mesma funcao serve para chamada autenticada do front.
create or replace function crawl_health_registrar(
  p_fonte text, p_chave text, p_observado int,
  p_esperado_min int default null, p_detalhe jsonb default null
) returns bigint language sql security definer set search_path to 'public' as $$
  insert into crawl_health (fonte, chave, observado, esperado_min, detalhe)
  values (p_fonte, coalesce(p_chave, '-'), p_observado, p_esperado_min, p_detalhe)
  returning id
$$;

grant execute on function crawl_health_registrar(text, text, int, int, jsonb) to authenticated, service_role;

-- =====================================================================
-- Alertas: responde "o que esta quebrado AGORA".
--
-- Tres deteccoes, e a terceira e' a que pega o caso mais traicoeiro - a
-- fonte que continua rodando e reportando sucesso, mas com volume muito
-- abaixo do proprio historico (regex ainda casa, so que com metade dos
-- casos). Comparacao contra a MEDIANA da propria fonte, nao contra numero
-- fixo: volume de licitacao varia por dia da semana e nao da pra cravar
-- limiar universal.
-- =====================================================================
create or replace view crawl_health_alertas as
with ult as (
  select distinct on (fonte, chave) fonte, chave, observado, esperado_min, ok, rodada_em
    from crawl_health order by fonte, chave, rodada_em desc
),
hist as (
  select fonte, chave,
         percentile_cont(0.5) within group (order by observado) mediana,
         count(*) rodadas
    from crawl_health
   where rodada_em > now() - interval '14 days'
   group by 1, 2
)
select u.fonte, u.chave, u.observado, u.esperado_min, u.rodada_em,
       round(extract(epoch from (now() - u.rodada_em)) / 3600, 1) horas_desde,
       h.mediana, h.rodadas,
       case
         when u.rodada_em < now() - interval '24 hours' then 'SILENCIO'
         when not u.ok                                   then 'ABAIXO_DO_PISO'
         when h.rodadas >= 5 and h.mediana > 0
              and u.observado < h.mediana * 0.3          then 'QUEDA_ABRUPTA'
         else 'ok'
       end as alerta
  from ult u left join hist h using (fonte, chave);

grant select on crawl_health_alertas to authenticated, service_role;

comment on view crawl_health_alertas is
  'SILENCIO = fonte nao roda ha mais de 24h. ABAIXO_DO_PISO = rodada trouxe '
  'menos que o minimo declarado. QUEDA_ABRUPTA = rodou e reportou sucesso, mas '
  'com menos de 30% da mediana das ultimas 2 semanas (degradacao parcial, o '
  'modo mais dificil de perceber no olho).';
