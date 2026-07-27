-- =====================================================================
-- consumo_health - o edital capturado da pra USAR?
--
-- POR QUE EXISTE: crawl_health responde "a fonte esta viva e trouxe o
-- volume normal?". Isso cobre a INGESTAO. Em 27/07 descobrimos que da pra
-- passar nesse teste com nota cheia e ainda assim entregar edital inutil:
-- 638 anexos (20%) nao abriam, 623 linhas eram duplicata e o nome na tela
-- era ilegivel. Todas as rodadas de captura estavam verdes. Os defeitos
-- ficaram SEMANAS no ar e so apareceram porque a Sarah insistiu duas vezes.
--
-- Enquanto a Effecti esta no ar isso custa incomodo - a equipe pega o mesmo
-- edital pelo outro sistema. Depois do corte, com FONTE UNICA e prazo de
-- licitacao correndo, "o anexo nao abre" vira LICITACAO PERDIDA. Por isso a
-- decisao 35 tornou esta verificacao pre-requisito do corte, nao um extra.
--
-- Capturar o edital e ENTREGAR o edital nao sao a mesma coisa. crawl_health
-- mede a primeira; este mede a segunda.
--
-- Tres defeitos, todos verificaveis sem sair do banco:
--   ANEXO_QUEBRADO  linha em licitacoes_anexos aponta pra objeto que nao
--                   existe no storage -> o clique da equipe da erro
--   ANEXO_ORFAO     objeto no bucket sem linha na tabela -> o arquivo existe
--                   mas o front nao lista; invisivel (foi assim que 107
--                   editais sumiram em 24/07)
--   SEM_ANEXO       card sem nenhum anexo -> nao da pra avaliar o edital
--
-- O que ele NAO cobre: se a URL assinada responde 200 de fato. Isso exige
-- HTTP e vive na edge (ver consumo-probe). Aqui fica o que e deterministico.
-- =====================================================================

-- Um anexo, com o veredito de existencia do arquivo por tras dele.
create or replace view consumo_anexo_estado as
select a.id, a.licitacao_id, a.bucket, a.arquivo_nome, a.arquivo_url,
       a.created_at,
       (o.name is null) as quebrado
  from licitacoes_anexos a
  left join storage.objects o
         on o.name = a.arquivo_url
        and o.bucket_id = a.bucket;

grant select on consumo_anexo_estado to authenticated, service_role;

-- Um card de licitacao, com o que a equipe consegue (ou nao) fazer com ele.
create or replace view consumo_card_estado as
select l.id, l.fonte, l.created_at, l.numero_edital, l.orgao,
       count(e.id)                              as anexos,
       count(*) filter (where e.quebrado)       as anexos_quebrados,
       (count(e.id) = 0)                        as sem_anexo,
       -- utilizavel = tem pelo menos um anexo que abre. E o minimo pra
       -- equipe conseguir ler o edital e decidir se disputa.
       (count(e.id) filter (where not e.quebrado) > 0) as utilizavel
  from licitacoes l
  left join consumo_anexo_estado e on e.licitacao_id = l.id
 group by 1, 2, 3, 4, 5;

grant select on consumo_card_estado to authenticated, service_role;

-- =====================================================================
-- Alertas: responde "quanto do que entregamos hoje NAO da pra usar".
--
-- A janela de 7 dias e proposital: defeito em edital antigo ja passou do
-- prazo e nao adianta mais: o que importa e o que a equipe vai abrir agora.
-- =====================================================================
create or replace view consumo_health_alertas as
with recentes as (
  select * from consumo_card_estado
   where created_at > now() - interval '7 days'
),
orfaos as (
  select o.bucket_id, count(*) n
    from storage.objects o
    left join licitacoes_anexos a
           on a.arquivo_url = o.name and a.bucket = o.bucket_id
   where o.bucket_id in ('editais-pdfs', 'licitacoes-anexos')
     and a.id is null
   group by 1
)
select 'SEM_ANEXO' as defeito,
       count(*) filter (where sem_anexo)                        as ocorrencias,
       count(*)                                                 as universo,
       round(100.0 * count(*) filter (where sem_anexo)
             / nullif(count(*), 0), 1)                          as pct,
       'card sem anexo nenhum - equipe nao consegue avaliar'    as significado
  from recentes
union all
select 'ANEXO_QUEBRADO',
       coalesce(sum(anexos_quebrados), 0),
       coalesce(sum(anexos), 0),
       round(100.0 * coalesce(sum(anexos_quebrados), 0)
             / nullif(sum(anexos), 0), 1),
       'linha aponta pra arquivo que sumiu - o clique da erro'
  from recentes
union all
select 'ANEXO_ORFAO',
       coalesce((select sum(n) from orfaos), 0),
       null,
       null,
       'arquivo existe no bucket mas o front nao lista - invisivel';

grant select on consumo_health_alertas to authenticated, service_role;

comment on view consumo_health_alertas is
  'Saude do CONSUMO (ultimos 7 dias): o edital capturado da pra usar? '
  'Complemento obrigatorio do crawl_health, que so mede ingestao. '
  'Pre-requisito do corte da Effecti (decisao 35).';

-- Lista os casos concretos, pra quem for consertar ter o que abrir.
create or replace function consumo_health_casos(p_dias int default 7)
returns table (
  defeito text, licitacao_id uuid, numero_edital text, orgao text,
  fonte text, detalhe text, created_at timestamptz
) language sql stable set search_path to 'public' as $$
  select 'SEM_ANEXO', c.id, c.numero_edital, c.orgao, c.fonte,
         'nenhum anexo', c.created_at
    from consumo_card_estado c
   where c.sem_anexo and c.created_at > now() - (p_dias || ' days')::interval
  union all
  select 'ANEXO_QUEBRADO', c.id, c.numero_edital, c.orgao, c.fonte,
         c.anexos_quebrados || ' de ' || c.anexos || ' anexos sem arquivo',
         c.created_at
    from consumo_card_estado c
   where c.anexos_quebrados > 0 and c.created_at > now() - (p_dias || ' days')::interval
   order by created_at desc
$$;

grant execute on function consumo_health_casos(int) to authenticated, service_role;
