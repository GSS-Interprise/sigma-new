## Pacote Licitação — Bloco DB + UI core

Recorte do PDF (itens 1–4, 7, 8, 12 do roadmap §14), sem nada que dependa de N8N/Gemini. Role `lider_licitacao` (já existente) assume o papel que o PDF chama de `gestor_licitacao` — sem criar role novo.

---

### Fase 1 — Schema do banco (1 migration)

**ALTER `licitacoes`** (§3.2)
- `empresa_disputante text` ('GSS' | 'AGES' | null)
- `card_origem_id uuid` (FK self)
- `card_gemeo_id uuid` (FK self)
- `disputa_valor_anonimo boolean default false`
- `objeto_resumo text`
- Unique index parcial `(card_origem_id, empresa_disputante) WHERE card_origem_id IS NOT NULL`

**ALTER `licitacao_itens`** (§3.3) — coexistem com legacy
- `lote text`, `numero_item text`
- `qnt_unit_total numeric(14,4)`, `qnt_valor_und numeric(14,4)`
- `vlr_total_estimavel numeric(14,2) GENERATED`
- `vlr_und_deliberado numeric(14,4)`
- `origem_extracao text default 'manual'`
- Index `(licitacao_id, lote)`

**ALTER `licitacao_item_concorrentes`** (§3.4)
- `valor_total numeric(14,2)`, `origem text default 'manual'`
- `ata_anexo_id uuid` (FK `licitacoes_anexos`)
- `requer_revisao_manual boolean default false`
- Index parcial em `ata_anexo_id`

**Nova tabela `licitacao_raia_log`** (§3.5)
- Schema completo do PDF + GRANTs + RLS + policy de leitura via `permissoes`
- Trigger `fn_licitacao_raia_track` em `AFTER UPDATE OF status ON licitacoes`
- **Backfill** a partir de `licitacoes_atividades` (tipo `mudanca_status`); cards sem histórico ganham 1 linha aberta com `created_at`

---

### Fase 2 — UI: nova aba **Itens** (§5.1)
Substitui/expande o que existe hoje em `licitacao_itens`.
- Componente `LicitacaoItensTab.tsx` agrupado por `lote`
- Edição inline com auto-save (debounce 1s) — reusa padrão de `useLicitacaoAutoSave`
- Colunas: nº | Descrição | Und | Qtd | Vlr Un | Vlr Tot (calculado pelo `GENERATED`)
- Ações: **Adicionar item**, **Adicionar lote**, **Remover**, **Exportar CSV**
- Sem botão "Extrair com IA" (fora de escopo nesta fase)

---

### Fase 3 — UI: nova aba **Histórico Licitatório** (§7.3)
- Componente `LicitacaoHistoricoTab.tsx`
- Hook `useLicitacaoRaiaLog(licitacao_id)` lê `licitacao_raia_log` agregado por `status`
- Linha do tempo visual (barras horizontais proporcionais) + tabela de passagens
- Nomes/cores das raias via `useKanbanColumns('licitacoes')` (já existe)
- Cabeçalho: "Tempo total no funil", "Raia atual"
- Sem cron/relatório mensal (fora de escopo nesta fase)

---

### Fase 4 — UI: separar **Objeto** + flag **Valor anônimo** (§9)
- `LicitacaoDetailDialog.tsx`: nova aba **Objeto** com editor rich-text (campo `objeto`); aba **Resumo** passa a exibir/editar `objeto_resumo` (textarea, ≤500 chars)
- Listagens (`LicitacoesKanban`, lista de cards) trocam exibição de `objeto` → `objeto_resumo` com fallback ao `objeto` truncado
- Exports CSV usam `objeto_resumo`
- Checkbox **Disputa de valor anônimo** próximo ao status no header do card → grava `disputa_valor_anonimo`

---

### Fora deste pacote (próximos blocos)
- Aba Competitividade reestruturada + AtaReader (depende de N8N)
- Workflow ItemExtractor + botão "Extrair com IA" (depende de N8N)
- Duplicar AGES↔GSS (edge `licitacao-card-duplicator`) — possível adicionar como bloco extra se priorizado
- Separação de permissões Contratos↔Licitação + role `gestor_licitacao`
- Relatório mensal de raia (cron + edge)
- Prompt v2 / re-análise IA
- Segurança N8N (header auth, IP allowlist)

---

### Pontos abertos (a confirmar antes da migration)
1. **`quantidade` legacy vs `qnt_unit_total` novo** em `licitacao_itens`: o doc recomenda convergir. Plano atual: **coexistem** (mais seguro); convergência fica como follow-up depois que o frontend novo estiver estável.
2. **Backfill de raia**: cards muito antigos podem gerar inconsistências. O backfill loga em `licitacao_raia_backfill_log` (tabela temporária) pra revisão manual.
3. **`empresa_disputante` em cards existentes**: começa `null` (legado). Sem migração automática — fica pra UI marcar quando o card for tocado.

---

### Entregáveis
- 1 migration Supabase (5 ALTERs + 1 CREATE TABLE + trigger + backfill)
- 2 hooks novos: `useLicitacaoRaiaLog`, `useLicitacaoItens` (CRUD)
- 3 componentes novos: `LicitacaoItensTab`, `LicitacaoHistoricoTab`, `LicitacaoObjetoTab`
- Edição de `LicitacaoDetailDialog.tsx` (novas abas, checkbox valor anônimo, swap objeto)
- Edição de `LicitacoesKanban.tsx` (exibe `objeto_resumo`)
