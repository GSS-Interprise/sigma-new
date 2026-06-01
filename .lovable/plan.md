## Exclusão permanente da licitação 7671488

**Alvo:** `PE 900062026 - Rio de Janeiro/RJ`  
ID: `2356a303-b7f4-4cd2-9b06-aed57dc65b2d`  
Status atual: `captacao_edital`

## Dependências encontradas

Varri todas as tabelas com `licitacao_id`:

| Tabela | Registros |
|---|---|
| licitacoes_atividades | 1 |
| worklist_tarefas | 1 |
| licitacoes_anexos | 0 |
| licitacao_itens | 0 |
| licitacao_resultados | 0 |
| ages_licitacoes | 0 |
| contrato_rascunho | 0 |
| licitacao_descartes | 0 |
| licitacoes_edit_locks | 0 |
| proposta | 0 |
| effect_sync_logs | 0 |
| lead_historico | 0 |

**Arquivos:** não há registro em `licitacoes_anexos`, então não há arquivos no Storage para apagar.

## Ação (migration única)

```sql
DELETE FROM licitacoes_atividades WHERE licitacao_id = '2356a303-...';
DELETE FROM worklist_tarefas     WHERE licitacao_id = '2356a303-...';
DELETE FROM licitacoes           WHERE id            = '2356a303-...';
```

Operação irreversível. Após aprovar, executo a migration e confirmo a remoção.
