

## Plano: Desconverter envia lead para coluna "Devolução Contratos"

### Contexto
A coluna `Devolucao_Contratos` já existe no banco (`kanban_status_config`, módulo `disparos`, ordem 8). O Kanban já carrega colunas dinamicamente via `useKanbanColumns`, então a coluna já aparece no board. O problema é que as duas mutações de desconversão ainda definem o status como `'Acompanhamento'`.

### Alteração

**Arquivo:** `src/components/medicos/LeadProntuarioDialog.tsx`

1. **Linha ~982** — Mutação de desconversão (Kanban médicos): trocar `status: 'Acompanhamento'` por `status: 'Devolucao_Contratos'`
2. **Linha ~1256** — Mutação de desconversão do Corpo Clínico: trocar `status: 'Acompanhamento'` por `status: 'Devolucao_Contratos'`
3. Adicionar invalidação de `['leads-acompanhamento']` no `onSuccess` da primeira mutação (já existe na segunda)

### O que NÃO muda
- Nenhuma migração necessária (coluna já existe)
- Nenhuma alteração de rota ou componente de Kanban
- O Kanban de acompanhamento já renderiza a coluna dinamicamente

