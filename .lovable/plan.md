# Pacote Licitação — o que já foi feito e o que falta

## ✅ Já aplicado no projeto

**Schema / banco**
- `licitacoes`: `objeto_resumo`, `valor_estimado`, `disputa_valor_anonimo`, `card_gemeo_id` ✓
- `licitacao_itens`: `lote`, `numero_item` ✓
- `licitacao_item_concorrentes`: `posicao` ✓ (mantido; não renomear)
- Tabela `licitacao_raia_log` + trigger `trg_licitacao_raia_track` ativos ✓
- Papéis `lider_licitacao` e `licitador` já existem em `app_role` ✓

**UI**
- Aba **Objeto** (`LicitacaoObjetoTab.tsx`) com `objeto_resumo` + toggle "Disputa valor anônimo" ✓
- Aba **Itens** (`LicitacaoItensTab.tsx`) ✓
- Aba **Histórico Licitatório** (`LicitacaoHistoricoTab.tsx`) ✓
- Hook `useLicitacaoRaiaLog` ✓
- Card exibe `objeto_resumo`, badge de disputa anônima e `valor_estimado` ✓

---

## ⏳ Falta aplicar (escopo Lovable/código)

### 1. Schema — ajustes mínimos
- Adicionar `regiao_estado text` em `public.licitacoes` (usado pelo prompt v2 e listagens)
- Revisar políticas RLS de licitação para usar **`lider_licitacao`** (gestão) e **`licitador`** (operação), removendo dependência do antigo `gestor_captacao`/`gestor_contratos` no escopo Licitação
- (Nada de `gestor_licitacao` — papel descontinuado)

### 2. Edge functions novas
| Função | Papel |
|---|---|
| `licitacao-card-duplicator` | Duplica card AGES↔GSS, copia itens, grava `card_gemeo_id` cruzado, registra `card_duplicado` / `card_criado_por_duplicacao` |
| `licitacao-ata-parser` | Recebe PDF de ata → chama webhook N8N AtaReader → UPSERT em `licitacao_item_concorrentes` |
| `licitacao-item-extractor` | Recebe edital → chama webhook N8N ItemExtractor → persiste em `licitacao_itens` |
| `licitacao-raia-tracker` | Fallback/backfill do raia |
| `licitacao-raia-report-mensal` | Relatório mensal consolidado (pg_cron) |

Webhooks N8N (AtaReader, ItemExtractor, prompt v2 no TenderReanalysis) e IP allowlist/JWT são responsabilidade da equipe externa. Edge functions ficarão prontas para chamar com `Authorization: Bearer <secret>`.

### 3. UI / Frontend
- Botão **"Duplicar para AGES/GSS"** no `LicitacaoDetailDialog` → chama `licitacao-card-duplicator`; link para o card gêmeo quando `card_gemeo_id` existir
- Botão **"Importar Ata (PDF)"** na aba Competitividade → upload → `licitacao-ata-parser`
- Botão **"Re-analisar com prompt v2"** no card (passa `prompt_version=v2`)
- Aba **Competitividade reestruturada**: lista `licitacao_item_concorrentes` agrupado por item/lote, ordenado por `posicao`, com origem (manual vs. ata importada)
- Tela de relatório mensal de tempo de raia (consome `licitacao-raia-report-mensal`)
- Permissões de UI/menu refletindo `lider_licitacao` (gestão completa) vs `licitador` (operação no card)

### 4. pg_cron
- Agendar `licitacao-raia-report-mensal` no dia 1 de cada mês

---

## Ordem sugerida

1. Migration: `regiao_estado` + revisão de policies para `lider_licitacao`/`licitador`
2. Edge `licitacao-card-duplicator` + botão "Duplicar AGES/GSS" + badge de gêmeo
3. Edge `licitacao-item-extractor` + acionamento manual na aba Itens
4. Edge `licitacao-ata-parser` + botão "Importar Ata" + refactor da aba Competitividade
5. Edge `licitacao-raia-tracker` (backfill admin)
6. Edge `licitacao-raia-report-mensal` + pg_cron + tela de relatório

Posso começar pelo passo 1+2 (menor risco, valor imediato) ou seguir a ordem completa. Confirma por onde começar?
