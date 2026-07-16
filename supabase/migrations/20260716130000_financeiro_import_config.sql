-- F1 — Ingestão multi-fonte "Importar fechamento" (16/07).
-- Config POR CONTRATO que ensina o importador a ler cada relatório CONSOLIDADO
-- e gerar o fechamento, sem código por cliente. O tratamento do relatório CRU
-- (doppler/ajuste da radiologia) é OUTRO projeto — aqui entra já consolidado.

create table if not exists public.financeiro_import_config (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,                 -- ex.: "Marieta Radiologia", "Dr. Escala - Plantões"
  fonte         text not null,                 -- dr_escala | marieta | cis | ambulatorio | outro
  cliente_id    uuid,                           -- vínculo com o contrato/cliente (quando existir F4)
  formato       text not null default 'xlsx',   -- xlsx | csv
  aba           text,                           -- nome da aba (xlsx); null = primeira
  header_row    int  not null default 1,        -- linha (1-based) onde estão os cabeçalhos
  -- layout: 'linha' = 1 médico por linha; 'matriz' = médico × colunas de exame/valor
  layout        text not null default 'linha' check (layout in ('linha','matriz')),
  -- mapa de colunas → campos canônicos. Formas conforme o layout:
  --  linha:  { "medico":"Nome", "quantidade":"Horas", "valor":"Valor Total", "competencia":"..." }
  --  matriz: { "medico":"Nome", "colunas_valor":["Valor TC","Valor RM",...] }  (soma por médico)
  mapa_colunas  jsonb not null default '{}'::jsonb,
  ativo         boolean not null default true,
  criado_por    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_fin_import_cfg_fonte on public.financeiro_import_config (fonte) where ativo;

alter table public.financeiro_import_config enable row level security;
drop policy if exists "fin import cfg rw" on public.financeiro_import_config;
create policy "fin import cfg rw" on public.financeiro_import_config
  for all to authenticated
  using (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'gestor_financeiro'::app_role))
  with check (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'gestor_financeiro'::app_role));

grant select, insert, update, delete on public.financeiro_import_config to authenticated, service_role;

-- Rastreio de cada importação (idempotência + auditoria). Reusa o padrão do
-- reconcile-transactions do financeai: hash do lote evita re-importar o mesmo arquivo.
create table if not exists public.financeiro_import_log (
  id            uuid primary key default gen_random_uuid(),
  config_id     uuid references public.financeiro_import_config(id),
  fechamento_id uuid,                            -- fechamento gerado (financeiro_fechamentos)
  arquivo_nome  text,
  arquivo_hash  text,                            -- dedup: mesmo arquivo não entra 2x
  linhas_lidas  int,
  medicos       int,
  total         numeric,
  status        text not null default 'ok',      -- ok | erro | parcial
  detalhe       jsonb,
  criado_por    uuid,
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_fin_import_hash on public.financeiro_import_log (arquivo_hash) where arquivo_hash is not null;
create index if not exists idx_fin_import_log_cfg on public.financeiro_import_log (config_id, created_at desc);

alter table public.financeiro_import_log enable row level security;
drop policy if exists "fin import log ro" on public.financeiro_import_log;
create policy "fin import log ro" on public.financeiro_import_log
  for select to authenticated
  using (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'gestor_financeiro'::app_role));
grant select, insert, update, delete on public.financeiro_import_log to authenticated, service_role;
