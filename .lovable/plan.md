## Diagnóstico

Fluxo de **responsável** em demandas (worklist_tarefas):

| Cenário | Status hoje |
|---|---|
| Criar demanda com responsável | ✅ Notifica + vira finalizador |
| Trocar responsável na edição | ❌ Atualiza no banco, **não notifica** o novo responsável |
| Todos os finalizadores confirmam | ✅ Tarefa vira `concluida` automaticamente |
| Admin encerra manualmente | ✅ Status muda, ❌ ninguém é notificado |
| Conclusão (qualquer caminho) | ❌ Criador / responsável / mencionados não recebem aviso |

## Correções

### 1. Notificar novo responsável ao editar
Em `src/hooks/useDemandas.ts` → `useAtualizarDemanda`:
- Antes do update, ler `responsavel_id` atual.
- Se mudou e o novo ≠ usuário logado: inserir em `system_notifications` (`tipo: demanda_responsavel`, link `/demandas?tarefa={id}`).
- Garantir que o novo responsável também é adicionado a `worklist_tarefa_finalizadores` (hoje só acontece se `finalizadores` for enviado no input — passar a aplicar sempre que `responsavel_id` mudar).

### 2. Notificar conclusão
Centralizar num helper local `notificarConclusao(tarefaId, motivo)` que:
- Busca `titulo`, `created_by`, `responsavel_id` da tarefa + mencionados + finalizadores.
- Insere `system_notifications` (`tipo: demanda_concluida`) para todos os envolvidos exceto quem disparou a ação.

Chamar esse helper em:
- `useToggleConfirmacaoDemanda` logo após o `update status=concluida` (linhas 977-993).
- `useAtualizarStatusDemanda` quando `status === "concluida"` (linha 486).

### 3. (Pequeno polimento) Atividade de troca de responsável
Já existe `tipo: "edicao"` genérico. Adicionar uma entrada extra `tipo: "atribuicao"` com `detalhes: { de, para }` quando o responsável mudar, para aparecer claro no histórico.

## Sem mudanças

- Estrutura de tabelas (já temos `system_notifications`, `worklist_tarefa_finalizadores`).
- Lógica de encerramento automático — está correta.
- UI: o sino global (`NotificacoesSino`) já consome `system_notifications` e abre `link`, então as novas notificações aparecem sem mexer em componente.

## Validação

- Criar demanda atribuindo a outro usuário → confirmar notificação chega (já funciona, regressão).
- Editar demanda trocando o responsável → novo responsável recebe notificação e vira finalizador.
- Todos os finalizadores confirmarem → criador + responsável + mencionados recebem "demanda concluída".
- Admin encerrar manualmente → mesmos destinatários recebem "demanda concluída".
