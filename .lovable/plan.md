

## Plano: Corrigir exibição de telefone LID + melhorar busca automática de lead

### Problemas identificados

1. **Header mostra LID como telefone** — O campo `contact_phone` contém `97676213370883` (LID do WhatsApp), não um número real. Quando o contato é LID, deveria mostrar o telefone do lead vinculado ou esconder o número falso.

2. **Modal não reaparece ao voltar na conversa** — O `useEffect` na linha 311-331 faz `setAutoMatchDialogOpen(false)` ao trocar de conversa, mas quando volta, o `linkedLead` já está em cache e o effect não dispara de novo.

3. **Push name já é o `contact_name`** — O webhook já salva o `pushName` do WhatsApp como `contact_name` na tabela `sigzap_contacts`. Não existe coluna separada. O matching por nome já usa `contact_name`.

4. **Matching por nome fraco** — "Jaime" com 1 parte de nome dá match em qualquer "Jaime" no banco, mesmo com sobrenome diferente. Precisa priorizar resultados onde mais partes do nome coincidem.

### Alterações planejadas

**Arquivo: `src/components/sigzap/SigZapChatColumn.tsx`**

1. **Header — esconder LID, mostrar telefone real do lead**
   - Na linha 1421-1423, quando `isLidContact` for true, mostrar o telefone do lead vinculado (`linkedLead?.phone_e164` ou `leadFromJoin?.phone_e164`) ou "Contato LID" em vez do número LID cru.

2. **Fix modal não reaparecendo**
   - No `useEffect` linha 311-331 (troca de conversa), NÃO fazer `setAutoMatchDialogOpen(false)` — deixar o estado ser controlado apenas pelo effect que detecta `linkedLead` (linha 239-248).
   - Adicionar `conversaId` como dependência forte no effect do auto-match para re-disparar ao voltar.

3. **Melhorar scoring de nome**
   - Quando o contato tem apenas 1 parte de nome (ex: "Jaime"), exigir score mínimo mais alto ou buscar por match exato de primeiro nome.
   - Penalizar resultados onde o sobrenome do lead não bate com nenhuma parte do nome do contato.
   - Se só tem 1 parte de nome e múltiplos resultados com score igual, não abrir o modal automático — abrir o dialog manual de vinculação para o usuário escolher.

### Resultado esperado

- Contatos LID mostram "Contato LID" ou o telefone real do lead vinculado no header
- Modal de auto-match reaparece toda vez que selecionar conversa sem lead vinculado
- Nomes com 1 parte (ex: "Jaime") não fazem match errado com leads de sobrenome diferente

