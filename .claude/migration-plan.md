# Migração Sigma GSS: Lovable Cloud → Supabase Próprio

## Status: MIGRAÇÃO CONCLUÍDA (2026-04-03)
Aguardando configuração de Secrets e N8N pelo dev GSS.
Auth funcional — Raul testou login e reset de senha com sucesso.

---

## Resumo Final

| Item | Resultado |
|------|-----------|
| Código migrado | ✅ Repo `GSS-Interprise/sigma-new` |
| Schema | ✅ 183 tabelas, stored functions, triggers, RLS policies |
| Usuários | ✅ 36 auth.users com UUIDs originais preservados |
| leads (113k) | ✅ 111.686 importadas (98.7% — ~1.500 duplicatas de chave_unica) |
| sigzap_messages (18k) | ✅ ~18.100 importadas (98.6% — ~260 com payload >1MB) |
| escalas_integradas (12k) | ✅ 12.252 importadas (100%) |
| import_leads_failed_queue (85k) | ✅ 85.023 importadas (100%) |
| Demais 81 tabelas | ✅ Todas importadas |
| Edge Functions | ✅ 50 deployadas via Supabase CLI |
| FKs recriadas | ✅ Todas restauradas (com EXCEPTION para órfãos) |
| RLS reabilitado | ✅ Todas as tabelas |
| NOT NULL restaurado | ✅ chips, licitacoes, comunicacao_mensagens, suporte_comentarios |
| Auth | ✅ Login e reset de senha funcionando |
| Secrets | ⏳ Dev GSS configura (ver handover-dev-gss.md) |
| N8N Webhooks | ⏳ Dev GSS atualiza URLs (ver handover-dev-gss.md) |
| Storage (arquivos) | ⏳ URLs ainda apontam para Supabase antigo |

---

## Dados dos Projetos

| Item | Valor |
|------|-------|
| **Repo antigo** | `GSS-Interprise/sigmagss` |
| **Repo novo** | `GSS-Interprise/sigma-new` |
| **Supabase antigo (Cloud)** | `qyapnxtghhdcfafnogii` |
| **Supabase novo** | `zupsbgtoeoixfokzkjro` |
| **URL novo** | `https://zupsbgtoeoixfokzkjro.supabase.co` |
| **Supabase Access Token** | `sbp_f25f69a4d0532cfa9ab77f4bc82ae01747446e2f` |

---

## O que foi feito (cronológico)

### Fase 1 — Preparação
- Criado repo `sigma-new` no GitHub
- Criado projeto em branco no Lovable novo
- Conectado ao GitHub
- Criado projeto Supabase novo (região São Paulo)

### Fase 2 — Código
- Copiado código completo de `sigmagss` → `sigma-new` (838 arquivos)
- Limpo `.env` (removidas credenciais do Lovable Cloud)
- Atualizado `supabase/config.toml` com novo Project ID
- Lovable novo preencheu `.env` automaticamente ao conectar Supabase

### Fase 3 — Schema (Migrations)
- Habilitadas extensões: `uuid-ossp`, `pg_cron`, `pg_net`
- 305 migrations processadas em 13 chunks idempotentes + pre-files
- Proteções aplicadas: IF NOT EXISTS, EXCEPTION handlers, ON CONFLICT, CASCADE, DROP antes de CREATE
- Enum `app_role` tratado (valores antigos adicionados para compatibilidade com migrations intermediárias)
- Resultado: 183 tabelas criadas (antigo tinha 182)

### Fase 4 — Usuários
- 36 auth.users importados com UUIDs originais via edge function do Lovable
- Profiles criados automaticamente pelo trigger `on_auth_user_created`
- Campos auth corrigidos (confirmation_token, email_change, etc. = '' em vez de NULL)

### Fase 5 — Importação de Dados
- 85 CSVs exportados do projeto antigo via página admin-export
- SQLs gerados automaticamente para todas as tabelas (com tratamento de JSONB vs arrays PG)
- Tabelas grandes importadas via Supabase CLI (`npx supabase db query --linked`)
- Página admin-import criada no Lovable novo (upsert direto, lotes de 500)
- FKs dropadas temporariamente para importação, depois recriadas
- RLS desabilitado durante importação, depois reabilitado
- Referências órfãs limpas antes de recriar FKs

### Fase 6 — Edge Functions
- 50 functions deployadas via `npx supabase functions deploy`
- Inclui 2 functions extras criadas pelo Lovable (import-csv-bulk, import-users-bulk)

### Fase 7 — Validação
- Login testado com sucesso (raul.sxs27@gmail.com)
- Reset de senha funcional
- Auth URL não precisa de domínio próprio (projeto antigo não tinha)

---

## Pendente (para o dev GSS)

Documento detalhado em: **`.claude/handover-dev-gss.md`**

### 1. Secrets (Edge Functions)
Configurar no Dashboard → Edge Functions → Secrets:
- `WEBHOOK_SECRET`
- `RESEND_API_KEY` ou `SENDGRID_API_KEY`
- `OPENAI_API_KEY`
- `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`
- `LOVABLE_API_KEY`

### 2. N8N Webhooks
Substituir `qyapnxtghhdcfafnogii` por `zupsbgtoeoixfokzkjro` em todos os workflows:
- disparos-callback
- api-licitacoes
- receive-whatsapp-messages / events
- email-status-callback
- receive-support-email-reply
- escalas-api, drescala-sync, drescala-bi
- Atualizar Service Role Key nos headers Bearer

### 3. Integrações Externas
- Evolution API: webhook URLs
- Effect ERP: endpoint licitações
- D Rescala: URLs sync/BI
- Email provider: webhook status/reply

### 4. Storage
- URLs de arquivos no banco apontam para Supabase antigo
- Se migrar arquivos, atualizar URLs nas tabelas

### 5. Senhas dos Usuários
- Importados com senha temporária
- Cada usuário precisa fazer "Esqueci minha senha"

---

## Dados Pendentes (baixo impacto)

### ~1.500 leads faltantes
- Causa: duplicata de `chave_unica` no CSV
- Solução futura: `DROP INDEX idx_leads_chave_unica;` → reimportar → recriar index
- Impacto: registros duplicados, zero impacto funcional

### ~260 sigzap_messages faltantes
- Causa: `raw_payload` JSON >1MB (mensagens com mídia grande)
- Impacto: histórico de mensagens 98.6% completo, zero impacto funcional

---

## Arquivos Importantes no Repo sigma-new

| Arquivo/Pasta | Descrição |
|---------------|-----------|
| `migration_chunks/` | 13 chunks SQL idempotentes + pre-files |
| `import_sql/` | SQLs de importação para todas as 85 tabelas |
| `supabase/migrations/` | 305+ migrations originais |
| `supabase/functions/` | 50 edge functions |
| `supabase/config.toml` | Config com novo Project ID |
| `.env` | Credenciais do Supabase novo |

---

## Notas Técnicas

- Migrations processadas com: `IF NOT EXISTS`, `EXCEPTION WHEN duplicate_object/duplicate_column`, `ON CONFLICT DO NOTHING`, `DROP ... CASCADE`, `DROP TRIGGER/POLICY IF EXISTS`
- Enum `app_role` teve valores antigos adicionados para compatibilidade: `gestor_demanda`, `recrutador`, `financeiro`, `medico`
- ALTER TYPE ADD VALUE extraído para `pre_chunk_XX.sql` separados (PostgreSQL não permite usar novo valor na mesma transação)
- Colunas JSONB preservam `[]`, colunas array PG convertem `[]` → `{}`
- `escalas_integradas.carga_horaria_minutos` é GENERATED ALWAYS — excluída dos imports
- Supabase CLI linkado: `npx supabase link --project-ref zupsbgtoeoixfokzkjro`
- Token Supabase: variável `SUPABASE_ACCESS_TOKEN`

---

## Backup

O projeto antigo no Lovable Cloud (`qyapnxtghhdcfafnogii`) continua funcionando independentemente.
**NÃO DELETAR** até confirmar operação completa no novo (mínimo 1 semana).
