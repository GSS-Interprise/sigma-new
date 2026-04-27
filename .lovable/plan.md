## Problema

Ao mover uma licitação para **Arrematado**, o banco aborta com:
`record "new" has no field "modalidade"`

Causa: o trigger `create_captacao_card_on_licitacao_arrematada` (que cria o pré-contrato e o rascunho de contrato automaticamente quando a licitação vira "arrematados") referencia `NEW.modalidade` ao montar o `overlay_json` do rascunho, mas **a tabela `licitacoes` não possui a coluna `modalidade`**. Qualquer UPDATE de status para `arrematados` quebra.

Como o trigger é `AFTER UPDATE` e não tem `WHEN`, ele dispara em qualquer update — mas o erro só aparece quando entra no bloco `IF NEW.status = 'arrematados'`, que é exatamente o caso atual.

Além disso, na investigação anterior já tínhamos pendente decidir se o trigger `create_disparo_task_on_licitacao_won` (que cria tarefa em `worklist_tarefas` automaticamente) deveria ser removido — você disse que **não quer criação automática de tarefa**, só pelos 3 pontinhos. Vou aproveitar pra resolver os dois de uma vez.

## Plano

### 1. Corrigir o trigger do pré-contrato (migration)
Atualizar a função `create_captacao_card_on_licitacao_arrematada` removendo a referência a `NEW.modalidade` do `overlay_json` (mantendo os demais campos: numero_edital, objeto, orgao, uf, valor_estimado, data_disputa, data_arrematacao). Isso desbloqueia o arremate imediatamente e mantém a criação automática de pré-contrato + rascunho funcionando como antes.

### 2. Remover criação automática de tarefa ao arrematar (migration)
Conforme combinado: tarefa só nasce manualmente pelos 3 pontinhos. Vou:
- `DROP TRIGGER licitacao_to_disparo_automation ON public.licitacoes`
- `DROP FUNCTION public.create_disparo_task_on_licitacao_won()`

### 3. Validar
Após as migrations, mover um card pra Arrematado deve:
- Atualizar o status sem erro
- Criar o pré-contrato e o rascunho automaticamente (comportamento existente)
- **Não** criar tarefa em `worklist_tarefas` automaticamente

## Detalhes técnicos

Migration única com:
```sql
-- 1. Recriar função sem NEW.modalidade
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
... overlay_json sem 'modalidade' ...
$$;

-- 2. Remover automação de tarefa
DROP TRIGGER IF EXISTS licitacao_to_disparo_automation ON public.licitacoes;
DROP FUNCTION IF EXISTS public.create_disparo_task_on_licitacao_won();
```

Nenhuma mudança de código frontend necessária.