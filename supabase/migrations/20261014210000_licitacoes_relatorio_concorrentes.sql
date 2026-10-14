-- T7 do plano licitacoes-contratos-gss.md (14/10), parte 2: relatório e concorrentes.
-- Ramone (reunião de 07/10, 54:52–56:41): relatório semanal para o Maikon com quantas surgiram,
-- quantas fomos, quantas ganhamos, por que não entramos, por que não ganhamos e quem ganhou; e os
-- concorrentes por região (59:53: "os principais concorrentes e de onde vêm"). Só o quadro da GSS.
-- As funções respeitam o RLS de quem chama (security invoker).

-- UF do edital: o campo municipio_uf vem em vários formatos ("Camaquã - RS", "COLATINA/ES",
-- "Pinhais"); sem UF no campo, tenta o título ("PE 12/2026 - Jaguari/RS")
create or replace function public.licitacao_uf(_municipio_uf text, _titulo text)
returns text language sql immutable as $$
  with ufs(sigla, nome) as (values
    ('AC','ACRE'),('AL','ALAGOAS'),('AP','AMAPA'),('AM','AMAZONAS'),('BA','BAHIA'),('CE','CEARA'),('DF','DISTRITO FEDERAL'),
    ('ES','ESPIRITO SANTO'),('GO','GOIAS'),('MA','MARANHAO'),('MT','MATO GROSSO'),('MS','MATO GROSSO DO SUL'),('MG','MINAS GERAIS'),
    ('PA','PARA'),('PB','PARAIBA'),('PR','PARANA'),('PE','PERNAMBUCO'),('PI','PIAUI'),('RJ','RIO DE JANEIRO'),('RN','RIO GRANDE DO NORTE'),
    ('RS','RIO GRANDE DO SUL'),('RO','RONDONIA'),('RR','RORAIMA'),('SC','SANTA CATARINA'),('SP','SAO PAULO'),('SE','SERGIPE'),('TO','TOCANTINS')),
  textos(ordem, t) as (values (1, upper(unaccent(coalesce(_municipio_uf, '')))), (2, upper(unaccent(coalesce(_titulo, ''))))),
  -- sigla no fim depois de separador ("Camaquã - RS", "Colatina/ES"; "TARUMA" não vira MA)
  por_sigla as (
    select ordem, substring(' ' || t from '[^A-Z]([A-Z]{2})[^A-Z]*$') as uf from textos
  ),
  -- nome do estado por extenso no fim ("Lima Duarte/Minas Gerais"); o nome mais longo ganha (Mato Grosso do Sul)
  por_nome as (
    select x.ordem, u.sigla as uf from textos x join ufs u on x.t ~ ('(^|[^A-Z])' || u.nome || '[^A-Z]*$')
  )
  select uf from (
    select ordem, 1 as tipo, uf, 0 as tam from por_sigla where uf in (select sigla from ufs)
    union all
    select p.ordem, 2, p.uf, length(u.nome) from por_nome p join ufs u on u.sigla = p.uf
  ) c order by ordem, tipo, tam desc limit 1;
$$;

create or replace function public.uf_regiao(_uf text)
returns text language sql immutable as $$
  select case
    when _uf in ('AC','AP','AM','PA','RO','RR','TO') then 'Norte'
    when _uf in ('AL','BA','CE','MA','PB','PE','PI','RN','SE') then 'Nordeste'
    when _uf in ('DF','GO','MT','MS') then 'Centro-Oeste'
    when _uf in ('ES','MG','RJ','SP') then 'Sudeste'
    when _uf in ('PR','RS','SC') then 'Sul' end;
$$;

create or replace function public.licitacoes_relatorio(_ini timestamptz, _fim timestamptz)
returns jsonb language sql stable as $$
  with base as (
    select l.id, l.titulo, l.numero_edital, l.orgao, l.valor_estimado, l.data_disputa, l.status::text as status,
           l.created_at, licitacao_uf(l.municipio_uf, l.titulo) as uf
      from licitacoes l where l.board = 'effecti' and l.empresa = 'GSS'
  ),
  -- última vez que o card foi para ganhamos/não ganhamos/fracassado dentro do período
  mov as (
    select distinct on (a.licitacao_id) a.licitacao_id, a.valor_novo, a.created_at
      from licitacoes_atividades a
     where a.tipo = 'status_alterado' and a.created_at >= _ini and a.created_at < _fim
       and a.valor_novo in ('arrematados', 'nao_ganhamos', 'fracassado')
     order by a.licitacao_id, a.created_at desc
  ),
  surgiram as (select * from base where created_at >= _ini and created_at < _fim),
  disputas as (select * from base where data_disputa >= _ini and data_disputa < _fim),
  fomos as (
    select * from disputas where status in ('cadastro_proposta', 'proposta_presencial', 'aguardando_sessao', 'em_disputa', 'proposta_final',
      'recurso_contrarrazao', 'adjudicacao_homologacao', 'arrematados', 'nao_ganhamos', 'fracassado')
    union select b.* from base b join mov m on m.licitacao_id = b.id
  ),
  ganhamos as (
    select b.*, m.created_at as em, r.valor_homologado, r.valor_gss
      from mov m join base b on b.id = m.licitacao_id left join licitacao_resultados r on r.licitacao_id = b.id
     where m.valor_novo = 'arrematados'
  ),
  perdemos as (
    select b.*, m.created_at as em, m.valor_novo as como, r.colocacao_gss, r.situacao_gss, r.motivo_texto, r.motivo_perda::text as categoria,
           nullif(r.empresa_vencedora_nome, 'N/A') as arrematante, r.valor_homologado, r.valor_gss
      from mov m join base b on b.id = m.licitacao_id left join licitacao_resultados r on r.licitacao_id = b.id
     where m.valor_novo in ('nao_ganhamos', 'fracassado')
  ),
  nao_entramos as (
    select b.*, d.motivo_nome, d.justificativa, d.created_at as em
      from licitacao_descartes d join base b on b.id = d.licitacao_id
     where d.created_at >= _ini and d.created_at < _fim
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', _ini, 'fim', _fim),
    'resumo', jsonb_build_object(
      'surgiram', (select count(*) from surgiram),
      'disputas_no_periodo', (select count(*) from disputas),
      'fomos', (select count(*) from fomos),
      'ganhamos', (select count(*) from ganhamos),
      'valor_ganho', (select coalesce(sum(coalesce(valor_homologado, valor_gss, valor_estimado)), 0) from ganhamos),
      'nao_ganhamos', (select count(*) from perdemos where como = 'nao_ganhamos'),
      'fracassadas', (select count(*) from perdemos where como = 'fracassado'),
      'nao_entramos', (select count(*) from nao_entramos)),
    'ganhamos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titulo', coalesce(titulo, numero_edital), 'orgao', orgao, 'uf', uf,
        'valor', coalesce(valor_homologado, valor_gss, valor_estimado), 'em', em) order by em) from ganhamos), '[]'),
    'nao_ganhamos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titulo', coalesce(titulo, numero_edital), 'orgao', orgao, 'uf', uf,
        'como', como, 'colocacao', colocacao_gss, 'situacao', situacao_gss, 'motivo', motivo_texto, 'categoria', categoria,
        'arrematante', arrematante, 'valor_arrematante', valor_homologado, 'valor_gss', valor_gss, 'em', em) order by em) from perdemos), '[]'),
    'nao_entramos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titulo', coalesce(titulo, numero_edital), 'orgao', orgao, 'uf', uf,
        'motivo', motivo_nome, 'justificativa', justificativa, 'valor_estimado', valor_estimado, 'em', em) order by em) from nao_entramos), '[]'),
    'motivos_nao_entramos', coalesce((select jsonb_agg(jsonb_build_object('motivo', m, 'n', n) order by n desc) from
        (select coalesce(nullif(btrim(motivo_nome), ''), 'Sem motivo') m, count(*) n from nao_entramos group by 1) x), '[]'),
    'quem_ganhou', coalesce((select jsonb_agg(jsonb_build_object('empresa', e, 'n', n, 'valor', v) order by n desc, v desc nulls last) from
        (select arrematante e, count(*) n, sum(valor_homologado) v from perdemos where arrematante is not null group by 1) x), '[]'),
    'surgiram_por_uf', coalesce((select jsonb_agg(jsonb_build_object('uf', u, 'n', n) order by n desc) from
        (select coalesce(uf, '—') u, count(*) n from surgiram group by 1) x), '[]')
  );
$$;

-- concorrentes: quem ganha, quem fica à frente da GSS e onde aparecem (por UF/região)
create or replace function public.licitacoes_concorrentes(_ini timestamptz default null, _fim timestamptz default null, _regiao text default null)
returns jsonb language sql stable as $$
  with linhas as (
    select c.*, l.id as licitacao_id, licitacao_uf(l.municipio_uf, l.titulo) as uf,
           (select min(g.posicao) from licitacao_item_concorrentes g where g.item_id = c.item_id and g.is_gss) as pos_gss,
           (select max(g.valor_ofertado) from licitacao_item_concorrentes g where g.item_id = c.item_id and g.is_gss) as valor_gss
      from licitacao_item_concorrentes c
      join licitacao_itens i on i.id = c.item_id
      join licitacoes l on l.id = i.licitacao_id
     where l.empresa = 'GSS' and not coalesce(c.is_gss, false)
       and (_ini is null or coalesce(l.data_disputa, l.created_at) >= _ini)
       and (_fim is null or coalesce(l.data_disputa, l.created_at) < _fim)
  ),
  filtradas as (select * from linhas where _regiao is null or uf_regiao(uf) = _regiao),
  por_empresa as (
    select coalesce(empresa_id::text, upper(btrim(empresa_nome))) as chave,
           max(empresa_nome) as empresa, max(empresa_cnpj) as cnpj,
           count(distinct licitacao_id) as disputas,
           count(distinct licitacao_id) filter (where is_vencedor) as vitorias,
           count(distinct licitacao_id) filter (where pos_gss is not null and posicao is not null and posicao < pos_gss) as a_frente_da_gss,
           round(avg(valor_ofertado) filter (where is_vencedor))::numeric as valor_medio_vitoria,
           round(avg((valor_gss - valor_ofertado) / nullif(valor_ofertado, 0) * 100) filter (where valor_gss is not null and valor_ofertado is not null and (is_vencedor or posicao < pos_gss)), 1) as gss_acima_pct,
           array_agg(distinct uf) filter (where uf is not null) as ufs
      from filtradas group by 1
  )
  select jsonb_build_object(
    'empresas', coalesce((select jsonb_agg(to_jsonb(p) - 'chave' order by p.vitorias desc, p.a_frente_da_gss desc, p.disputas desc) from (select * from por_empresa order by vitorias desc, a_frente_da_gss desc, disputas desc limit 60) p), '[]'),
    'por_regiao', coalesce((select jsonb_agg(jsonb_build_object('regiao', r, 'disputas', d, 'empresas', e) order by d desc) from
        (select coalesce(uf_regiao(uf), 'Sem UF') r, count(distinct licitacao_id) d, count(distinct coalesce(empresa_id::text, upper(empresa_nome))) e from linhas group by 1) x), '[]'),
    'total_resultados', (select count(distinct licitacao_id) from filtradas)
  );
$$;

grant execute on function public.licitacao_uf(text, text), public.uf_regiao(text),
  public.licitacoes_relatorio(timestamptz, timestamptz), public.licitacoes_concorrentes(timestamptz, timestamptz, text) to authenticated;
