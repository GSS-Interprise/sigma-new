# Resumo de Sessão — Abril 2026 (09-15/04)

## Contexto do projeto

CRM Sigma GSS — sistema de prospecção de médicos para a GSS Saúde. Raul (Pulse ID) é contratado para melhorar o CRM em 4 blocos de sprints. Stack: React 18 + TypeScript + Vite + Supabase (PostgreSQL 17, plano LARGE).

**Supabase**: projeto `zupsbgtoeoixfokzkjro` (região São Paulo)
**Repo**: `GSS-Interprise/sigma-new`
**Dev GSS**: Ewerton Monteiro
**RPA de importação**: Thiago (importa leads do CFM, origem `CRM-LEMIT` e `LISTA-CAPTADORA`)

---

## O que foi feito nesta sessão

### 1. Deduplicação de leads

**Problema**: 15.002 leads duplicados (13,4% da base). Causa principal: telefone gravado com/sem `+55`.

**Solução executada**:
- Stored procedure `merge_lead_cluster(canonical_id, duplicate_id)` — merge atômico e reversível
- 5.092 leads merged em 4 fases:
  - Fase 1 (phone): 3.778 clusters
  - Fase 2a (nome+dtnasc): 370 clusters
  - Fase 2b (nome+email): 776 clusters
  - Fase 2c (email+fuzzy nome): 147 clusters
- 1.219 FKs re-apontadas em 12 tabelas filhas
- Zero dados perdidos

**Estruturas criadas no banco**:
- `leads.merged_into_id` / `merged_at` / `merge_reason` — soft-delete de leads merged
- `leads_backup_predup` — backup completo pré-dedup (112.196 registros)
- `lead_merge_log` — log de cada FK movida (reversibilidade)
- `merge_plan` — plano de dedup com clusters processados
- `vw_leads_duplicados` — view de diagnóstico (pode ser dropada)

**Proteções aplicadas**:
- RLS policy RESTRICTIVE `hide_merged_leads` — leads merged invisíveis via role `authenticated`
- Trigger `normalize_phone_e164` — adiciona `+` automaticamente em INSERT/UPDATE
- Unique constraint parcial em `phone_e164` (só leads ativos)
- Partial indexes: `idx_leads_active_phone`, `idx_leads_active_email`, `idx_leads_active_nome`, `idx_leads_active_status`

**Funções helper criadas**:
- `merge_lead_cluster(canonical_id, duplicate_id, batch_tag)` — merge atômico
- `nome_palavras(nome)` — extrai palavras significativas (sem stopwords/acentos)
- `nome_palavras_comuns(nome1, nome2)` — conta palavras em comum
- `nome_is_subset(nome1, nome2)` — verifica se um nome é subconjunto do outro
- `norm_phone(phone)` — normaliza telefone para dígitos
- `norm_crm(crm)` — normaliza CRM
- `norm_nome(nome)` — normaliza nome (minúsculo, sem acentos)

---

### 2. Reestruturação de especialidades

**Problema**: 57 especialidades com duplicatas e lixo. 3 campos redundantes na tabela leads (`especialidade` texto, `especialidades` array, `especialidade_id` FK). Apenas 27% dos leads com especialidade normalizada. Filtro de disparo usava texto livre.

**Solução executada**:
- Tabela `especialidades` limpa: 57 → 60 registros (37 após limpeza + 23 do CFM adicionadas)
- Agora tem as **55 especialidades oficiais do CFM** + 5 extras (Medicina Generalista + 4 Residentes)
- Cada especialidade tem `aliases TEXT[]` (matching automático) e `area TEXT` (clínica/cirúrgica/diagnóstica/apoio/residência)
- 3 nomenclaturas ajustadas: ANESTESIOLOGISTA→ANESTESIOLOGIA, MASTOLOGISTA→MASTOLOGIA, ENDOSCOPIA DIGESTIVA→ENDOSCOPIA

**Junction table `lead_especialidades`**:
```sql
lead_especialidades (id, lead_id FK, especialidade_id FK, rqe, fonte, created_at)
UNIQUE(lead_id, especialidade_id)
```
- 43.178 registros migrados
- Fontes: migration (29.415), migration_text (13.269), migration_alias (8), migration_fix (486)
- Suporta múltiplas especialidades por lead (many-to-many)

**Função `lookup_especialidade(texto)`** — busca por nome exato → alias → sem acentos. Retorna UUID.

**RPC `get_leads_filter_counts()`** — atualizada para contar via junction table.

**414 leads com especialidade_id errado** (ex: radiologista classificado como dermatologista) — corrigidos via lookup.

**Frontend atualizado**:
- `DisparosImportDialog.tsx` — dropdown de especialidades da tabela normalizada, filtro por `especialidade_id`
- `AbaDisparos.tsx` — filtro por `especialidade_id` + adicionado filtro de bloqueio temporário (bug fix)
- `FiltroDisparos.tsx` — recebe `{id, nome}[]` em vez de `string[]`
- `LeadDialog.tsx` — resolve `especialidade_id` pelo nome + popula junction no create/update

**Edge functions redeployadas**:
- `import-leads` — popula junction após criar/atualizar lead
- `enrich-lead` — popula junction quando especialidade é enriquecida

**Tipos regenerados**: `src/integrations/supabase/types.ts` (10.876 linhas, inclui todas as novas tabelas)

**Campos legados na tabela leads** (mantidos por retrocompatibilidade, deprecar no futuro):
- `especialidade` (TEXT) — texto livre original
- `especialidades` (TEXT[]) — array usado no prontuário médico
- `especialidade_id` (UUID FK) — FK direta (agora redundante com junction, mas ainda usado como cache)
- `especialidades_crua` (TEXT) — texto bruto da importação

**Discussão com Ewerton**: ele entendeu que junction > array de UUIDs porque PostgreSQL não suporta FK em arrays. Concordou em usar `lead_especialidades` como fonte da verdade. Pendente: ajustar prontuário médico para ler da junction.

---

### 3. Blacklist inteligente e banco de desinteresse

**Bug corrigido**: `AbaDisparos.tsx` (disparo simples) não filtrava por `leads_bloqueio_temporario`. Leads bloqueados podiam receber mensagens.

**Categorias de bloqueio** — coluna `categoria` adicionada em `leads_bloqueio_temporario`:
- `proibido` — nunca contatar (corpo clínico, bloqueio absoluto)
- `protegido` — nunca disparo em massa (presidente CRM, gestor hospital, VIP)
- `desinteresse` — disse que não tem interesse
- `opt_out` — pediu para não ser contatado (LGPD)
- `temporario` — pausa operacional (default)

**UI atualizada**: `AbaBloqueioTemporario.tsx` com seletor de categoria no dialog, filtro por tipo na lista, badges coloridos por categoria (Ban/Crown/ThumbsDown/ShieldAlert/Shield).

**Status de leads normalizado**:
- `descartados` → `Descartado`, `qualificados` → `Qualificado`, `em_conversa` → `Em Conversa`
- Trigger `validate_lead_status()` atualizado para aceitar: `Em Conversa`, `Desinteresse`, `Bloqueado`

---

### 4. Outros

- Job travado `Endoscopista.xlsx` (26/02) marcado como erro
- Importação do Thiago validada: 510 leads nos últimos 7 dias, phones normalizados, sem erros
- Tabela `lead_enrichments` do Ewerton identificada (116k registros, pipeline/status/result_data)
- Documentação: plano Bloco 1, visão Máquina de Prospecção, relatório de entrega

---

## Estado atual da base

| Métrica | Valor |
|---------|-------|
| Total leads (físico) | 112.196 |
| Leads ativos | 107.104 |
| Leads merged (soft-delete) | 5.092 |
| Especialidades | 60 (55 CFM + 5 GSS) |
| Leads com especialidade na junction | 43.124 |
| Leads sem especialidade | ~64.000 (aguardam enriquecimento) |
| Bloqueios ativos | 0 |
| Importação ativa | ~500/semana (RPA Thiago) |

---

## Pendências conhecidas

### Prontuário médico
- O componente de prontuário ainda lê do campo `especialidades` (array) em vez da junction table
- Ewerton precisa informar qual componente é para Raul ajustar
- 105 leads têm dados no array `especialidades` que NÃO estão na junction — precisam ser migrados antes de deprecar o campo

### Campos legados
- `especialidade`, `especialidades`, `especialidades_crua` podem ser deprecados quando confirmado que nenhum código lê deles
- `licitacao_origem_id`, `contrato_origem_id`, `servico_origem_id` — 0% de uso, podem virar tabela de vínculos no futuro

### RQE parsing
- Campo `rqe` dos leads tem especialidade embutida (ex: "PEDIATRIA - RQE Nº 253")
- Ewerton quer parsear isso para extrair especialidade e popular a junction
- Função `lookup_especialidade()` já está pronta para isso

### Lifehub
- Busca por CPF depende de negociação contratual entre GSS e Lifehub
- Não é responsabilidade técnica

---

## Arquivos de referência

| Arquivo | Conteúdo |
|---------|----------|
| `.claude/plano-bloco1-final.md` | Plano detalhado do Bloco 1 (3 entregas) |
| `.claude/visao-maquina-prospeccao.md` | Visão estratégica: 10+ campanhas paralelas, IA WhatsApp, pool dinâmico |
| `.claude/handover-dev-gss.md` | Checklist de secrets/webhooks para Ewerton |
| `.claude/migration-plan.md` | Plano de migração Lovable→Supabase |
| `relatorio-bloco1.md` | Relatório de entrega para NF |
| `relatorio-bloco1-final.md` | Versão final ajustada |
| `scripts/merge_lead_cluster_fn.sql` | Stored procedure de merge |
| `scripts/nome_helpers.sql` | Funções de normalização de nome |
| `scripts/create_junction_and_migrate.sql` | Junction table + migração |
| `scripts/populate_aliases.sql` | Aliases das especialidades |
| `scripts/apply_protections.sql` | RLS, indexes, trigger phone |

---

## Bloco 2 — próximo

**Início**: 14/04/2026
**Foco**: Pipeline de Prospecção

Sprints 4-6:
- Kanban de tráfego de lead
- Automação de status por raia
- Mapeamento de origem do médico
- Exportação para tráfego pago
- Sistema de tarefas e alertas
- E-mail integrado

**Visão de longo prazo**: máquina de prospecção automática com 10+ campanhas paralelas, IA WhatsApp conversando com médicos, handoff automático para operadores. Documentado em `.claude/visao-maquina-prospeccao.md`.
