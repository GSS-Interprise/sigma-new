

## Bloqueio de leads em fila de disparo em massa no Disparo Manual

Quando um lead estiver com status `1-ENVIAR`, `2-REENVIAR` ou `3-TRATANDO` na tabela `disparos_contatos`, ele aparecerá **bloqueado** na interface de Disparo Manual, impedindo que o captador envie mensagem manual e cause duplicidade/risco de ban.

### Comportamento visual

Na coluna de leads (`DisparoManualLeadsColumn`):
- Lead bloqueado aparece com **opacidade reduzida**, ícone de cadeado (`Lock`) e badge "Em fila".
- Permanece **clicável** para visualizar dados, mas com indicação clara do bloqueio.

No painel do lead (`DisparoManualLeadPanel`):
- Quando o lead selecionado estiver bloqueado:
  - Banner amarelo no topo: "⚠️ Este lead está em fila de disparo em massa (status: X-NOME). Envio manual bloqueado para evitar duplicidade."
  - Campo de mensagem **desabilitado**.
  - Botão "Enviar" **desabilitado** com tooltip: "Em fila de disparo em massa".
  - Ações alternativas (Blacklist, Banco de Interesse, Liberar Lead) permanecem habilitadas.

### Mudanças técnicas

**1. `src/hooks/useLeadsAContactar.ts`**
- Adicionar campo `bloqueado_disparo_massa: boolean` e `status_disparo: string | null` ao tipo `LeadAContactar`.
- Na consulta a `disparos_contatos`, além de detectar "contactado" (status `4-ENVIADO`), também detectar se o lead possui registro com status `1-ENVIAR`, `2-REENVIAR` ou `3-TRATANDO` em qualquer campanha ativa, e marcar como bloqueado.

**2. `src/components/sigzap/manual/DisparoManualLeadsColumn.tsx`**
- Renderizar badge "Em fila" + ícone `Lock` quando `lead.bloqueado_disparo_massa === true`.
- Aplicar classe visual diferenciada (opacidade ~70%, borda tracejada).
- Tooltip ao hover: "Em fila de disparo em massa".

**3. `src/components/sigzap/manual/DisparoManualLeadPanel.tsx`**
- Buscar status do lead via novo hook ou prop derivada.
- Exibir banner de aviso quando bloqueado.
- Desabilitar `Textarea` da mensagem e botão "Enviar".
- Adicionar tooltip explicativo no botão.

**4. (Opcional) Filtro adicional**
- Adicionar nova aba de filtro "Bloqueados" ao lado de "Todos / Não lidos / Contactados", para o captador identificar rapidamente quais estão em fila.

### Fluxo de desbloqueio automático

Quando o `disparos-callback` ou `campanha-disparo-processor` atualizar o status para `4-ENVIADO`, `5-NOZAP` ou `6-BLOQUEADORA`, o React Query do hook `useLeadsAContactar` revalidará e o lead voltará ao estado normal (contactado ou disponível).

### Arquivos editados

- `src/hooks/useLeadsAContactar.ts`
- `src/components/sigzap/manual/DisparoManualLeadsColumn.tsx`
- `src/components/sigzap/manual/DisparoManualLeadPanel.tsx`

