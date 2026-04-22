

## Regra: lead aberto não pode estar em duas propostas da mesma campanha

Um lead pode participar de **várias campanhas ao mesmo tempo** (ex.: campanha de Generalista + campanha de Pediatra), mas dentro de **uma única campanha** ele só pode estar vinculado a **uma proposta ativa por vez**. Para colocá-lo em outra proposta da mesma campanha, é preciso primeiro encerrar o vínculo atual.

## O que vai mudar

### 1. Migration SQL — bloqueio no banco

**a) Função de validação** `valida_lead_unico_por_campanha()`:
- Antes de inserir um vínculo em `campanha_proposta_leads`, verifica se o lead já tem outro vínculo ativo (lead aberto = sem `removido_em` E proposta com `status != 'encerrada'`) em outra `campanha_proposta` da **mesma campanha**.
- Se já existir, lança erro: `Lead já está ativo em outra proposta desta campanha (proposta X). Encerre o vínculo atual antes de adicioná-lo aqui.`

**b) Trigger BEFORE INSERT** em `campanha_proposta_leads` chamando essa função.

**c) Índice parcial único** para reforçar a regra a nível de banco:
- `CREATE UNIQUE INDEX ON campanha_proposta_leads (campanha_id_da_proposta, lead_id) WHERE removido_em IS NULL` — usando uma coluna gerada ou via expressão com subquery não funciona direto, então a garantia fica via trigger + cleanup. (Mantemos só a trigger; índice exigiria desnormalizar `campanha_id`.)

**d) Backfill — diagnóstico**:
- `SELECT` listando casos atuais de leads duplicados na mesma campanha (sem corrigir automaticamente, só relatar). O operador decide qual manter via UI.

### 2. Frontend — feedback claro ao operador

**a) `useAdicionarLeadsCampanha` / fluxos de vínculo de leads à proposta**:
- Capturar o erro da trigger e mostrar toast amigável: *"Lead João Silva já está ativo na proposta Y desta campanha. Encerre antes de mover."*

**b) Dialog "Vincular leads à proposta"** (no fluxo de adicionar leads à `campanha_proposta`):
- Antes do envio, fazer um `SELECT` prévio que marca quais leads do lote já estão ativos em outra proposta da mesma campanha. Mostrar essa lista em um aviso amarelo: *"3 leads serão ignorados porque já estão ativos em outras propostas desta campanha."*
- Permitir ao operador clicar em **"Ver propostas em conflito"** para abrir mini-lista com link.

**c) Botão "Mover para outra proposta"** na linha do lead em `CampanhaLeadsList`:
- Atalho que: encerra o vínculo atual (`status_final = 'movido'`) + insere em proposta destino selecionada via dropdown. Tudo em uma transação RPC.

### 3. Sem mudança em campanhas diferentes

A regra só vale dentro da mesma campanha. Lead pode aparecer em N campanhas distintas sem restrição.

## Arquivos alterados

- nova migration SQL (função + trigger + query de diagnóstico)
- `src/hooks/useCampanhaLeads.ts` — tratar erro da trigger
- `src/components/disparos/VincularPropostaCampanhaDialog.tsx` ou dialog equivalente de vinculação de leads — pré-validação visual
- `src/components/disparos/CampanhaLeadsList.tsx` — novo botão "Mover para outra proposta"
- nova RPC `mover_lead_entre_propostas(lead_id, proposta_origem, proposta_destino)`

## Resultado

- Tentativa de duplicar lead na mesma campanha → bloqueada com mensagem clara.
- Lead pode estar em campanhas diferentes simultaneamente sem problema.
- Operador tem caminho explícito para mover o lead entre propostas da mesma campanha.

