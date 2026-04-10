

## Plano: Atualizar campo "Proposta Vinculada" sem refresh

### Problema
Quando uma proposta é criada via `NovaPropostaDialog`, o `onSuccess` invalida `['lead-propostas', leadId]` mas **não** invalida `['lead-propostas-count', leadId]`. A aba de conversão do prontuário usa exatamente essa query (`lead-propostas-count`) para mostrar se existe proposta vinculada. Por isso, o campo só atualiza após refresh manual.

### Correção

**Arquivo: `src/components/medicos/NovaPropostaDialog.tsx` (~linha 308)**

Adicionar invalidação da query `lead-propostas-count` no `onSuccess` da mutação de salvar proposta:

```typescript
onSuccess: () => {
  toast.success(isEditing ? "Proposta atualizada!" : "Proposta criada!");
  queryClient.invalidateQueries({ queryKey: ['lead-propostas', leadId] });
  queryClient.invalidateQueries({ queryKey: ['lead-propostas-count', leadId] });  // ← ADICIONAR
  queryClient.invalidateQueries({ queryKey: ['propostas-itens'] });
  handleClose();
},
```

Isso é suficiente porque o `LeadProntuarioDialog` já está montado e escutando essa query key. Ao invalidá-la, o React Query refaz o fetch automaticamente sem precisar de real-time.

### Escopo
- 1 arquivo, 1 linha adicionada
- Nenhuma migração necessária

