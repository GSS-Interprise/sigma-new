

## Restaurar fluxo "Adicionar Disparo" no Disparos Zap, vinculado a Campanha → Proposta

Voltar ao modelo antigo de criar disparos pela tela `/disparos/zap` (botão **Adicionar Disparo**), mas com a fonte de contatos vinda da **lista da proposta dentro da campanha selecionada**. Status de envio e fallback de chip permanecem como hoje.

### Fluxo do botão "Adicionar Disparo"

Modal `DisparosNovoDialog` (substituindo/atualizando o `DisparosImportDialog`):

1. **Select Campanha** (obrigatório) — lista `campanhas` com `status = 'ativa'` (ou todas, com filtro padrão "ativas").
   - Se houver apenas **1 campanha ativa**, vem pré-selecionada.
2. **Select Proposta** (obrigatório) — lista `campanha_propostas` da campanha escolhida com `status = 'ativa'`.
   - Se a campanha tiver apenas **1 proposta ativa** → pré-selecionada.
   - Se tiver **mais de uma** → select fica vazio, usuário precisa escolher (validação `required`).
3. **Preview da lista** — mostra `disparo_listas` vinculada à `campanha_proposta` e a contagem de números (`disparo_lista_itens` com telefone válido). Read-only.
4. **Configurações de envio** (mantidas do fluxo antigo):
   - Chip principal + chips fallback (multi-select).
   - Mensagem inicial (template).
   - Delays / batch size — defaults da campanha, editáveis.
5. **Botão "Criar Disparo"** → cria registro em `disparos_campanhas` (modelo antigo) populando `lista_id` e `campanha_proposta_id` para rastreabilidade, e enfileira contatos a partir de `disparo_lista_itens` da proposta (status inicial `1-ENVIAR`).

### Mudanças

**Frontend:**
- `src/pages/DisparosZap.tsx`:
  - Remover o aviso "Novo modelo de disparos / use o dossiê" e voltar a renderizar o botão **"Adicionar Disparo"** no header.
  - Abrir `<DisparosNovoDialog />` ao clicar.
- `src/components/disparos/DisparosNovoDialog.tsx` **(novo)**:
  - Campos: `campanha_id` (Select), `campanha_proposta_id` (Select dependente), preview da lista, `chip_id`, `chip_fallback_ids`, mensagem inicial, delays.
  - Lógica de auto-seleção:
    - `useQuery` campanhas ativas → se length=1, set default.
    - Ao escolher campanha, `useQuery` propostas ativas → se length=1, set default; senão deixa vazio + `required`.
  - `useQuery` lista vinculada (`disparo_listas` + count de `disparo_lista_itens`) para preview.
  - Mutation `criarDisparo` que insere em `disparos_campanhas` com `campanha_proposta_id` + `lista_id` e dispara função/edge para enfileirar os contatos a partir de `disparo_lista_itens`.
- Manter `DisparosMonitor` / `DisparosZapRanking` como estão.
- A aba **Zap** dentro do `CampanhaPropostaModal` (`ZapTab`) volta a ser apenas leitura/acompanhamento (já é o que tínhamos antes do desvio) — o **botão de criação fica apenas em /disparos/zap**.

**Backend (Supabase):**
- Garantir que `disparos_campanhas` tenha as colunas `campanha_proposta_id uuid` e `lista_id uuid` (verificar; se faltar, migration adicionando + FKs + index). Sem mudanças em status/fallback.
- Função/edge `criar-disparo-da-proposta` (ou reaproveitar a existente de import) que:
  - Lê `disparo_lista_itens` da `lista_id` informada.
  - Filtra telefones válidos / não-blacklist.
  - Insere em `disparos_log` (ou tabela equivalente da fila) com status `1-ENVIAR` vinculados ao `disparos_campanhas.id`.

### Resultado

- Na tela `/disparos/zap`, volta o botão **Adicionar Disparo** com o fluxo de criação completo.
- A escolha de **campanha + proposta** define automaticamente a fonte dos números (lista da proposta).
- Auto-preenchimento quando há só 1 opção; obrigatório quando há ambiguidade.
- Status de envio (`1-ENVIAR` … `06-BLOQUEADOR`) e lógica de fallback de chip permanecem idênticos ao fluxo atual.
- O dossiê da campanha continua exibindo a aba Zap como acompanhamento (sem botão de criação ali).

