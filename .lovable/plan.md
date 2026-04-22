

## Reformulação dos Disparos Zap — vínculo com Campanhas/Propostas + GET para n8n

### Mudança de modelo

Hoje **Disparos Zap** é um módulo paralelo: você cria uma `disparos_campanhas`, importa contatos manualmente, e o Sigma controla o envio (cron interno + função `disparos-webhook`).

Novo modelo: o disparo Zap passa a ser **um canal de uma proposta dentro de uma campanha** (igual ao Email, Tráfego Pago, Cascata). Quem orquestra o ritmo é o **n8n via GET**. O Sigma só:
1. Disponibiliza o payload dos contatos pendentes (GET).
2. Recebe o callback de status (já existe: `disparos-callback`).
3. Mostra status, métricas e fallback.

```text
Antes:                        Depois:
[Disparos Zap Tab]            [Campanha → Proposta → Aba "Zap"]
   ↓ (criar campanha            ↓ (botão "Adicionar disparo Zap")
     + importar leads)          ↓ (gera lote vinculado à proposta)
   ↓ (cron interno do Sigma)    ↓ (n8n faz GET periódico → recebe payload)
[disparos_contatos]           [disparos_contatos com campanha_proposta_id]
   ↑ callback n8n               ↑ callback n8n (mesmo endpoint)
```

### Regras

- **Não existe mais "criar campanha de disparo isolada" nem "importar contatos manualmente"**. A entrada é sempre: abrir uma proposta de uma campanha → aba **Zap** → "Adicionar disparo".
- Ao adicionar disparo, o Sigma resolve os leads da proposta (via `vw_lead_status_por_proposta` / regras do canal Zap), normaliza telefones, gera o `texto_ia` (spintax/template da proposta) e cria as linhas em `disparos_contatos` com status `1-ENVIAR`, ligadas a `campanha_proposta_id`.
- **Cron sai do Sigma → vai pro n8n**. n8n agenda um GET a cada X minutos.
- Status (`1-ENVIAR`, `2-REENVIAR`, `3-TRATANDO`, `4-ENVIADO`, `5-NOZAP`, `6-BLOQUEADORA`, `7-BLACKLIST`) e fallback (próxima fase da cascata quando `5-NOZAP`/`6-BLOQUEADORA`) **continuam idênticos**.

### 1. Banco

Migration:
- `ALTER TABLE disparos_campanhas` → adicionar `campanha_id uuid` e `campanha_proposta_id uuid` (FKs), tornando `campanha_proposta_id` o vínculo primário. `proposta_id` continua para compatibilidade.
- `ALTER TABLE disparos_contatos` → adicionar `campanha_proposta_id uuid` (índice). Permite GET filtrar direto por proposta.
- Nova RPC `gerar_disparo_zap(campanha_proposta_id)` — idempotente, pega leads elegíveis da proposta (sem raia aberta, sem blacklist, com telefone válido), insere em `disparos_contatos` com `1-ENVIAR`, ignora duplicatas (mesmo lead+proposta+telefone), retorna `{inseridos, ignorados}`.

### 2. Nova edge function `disparos-zap-pendentes` (GET para n8n)

- **Método:** `GET`
- **URL:** `/functions/v1/disparos-zap-pendentes`
- **Auth:** header `x-api-key` com secret `DISPAROS_ZAP_API_KEY` (criar via tool de secrets).
- **Query params opcionais:**
  - `instancia` — filtra por instância específica
  - `limite` — default 50, máx 200
  - `campanha_proposta_id` — opcional, restringe a uma proposta
- **Comportamento:**
  1. Busca `disparos_contatos` com `status='1-ENVIAR'` ou `2-REENVIAR`, respeitando limite diário por instância (`LIMITE_POR_DIA`).
  2. Marca os selecionados como `3-TRATANDO` (lock atômico) e incrementa `tentativas`.
  3. Retorna **o mesmo JSON do "Iniciar"** atual:
     ```json
     {
       "campanha_id": "...",
       "campanha_proposta_id": "...",
       "contatos": [
         { "id": "...", "NOME": "...", "TELEFONE": "55...", "TELEFONE_ORIGINAL": "...",
           "ID_PROPOSTA": "...", "TEXTO_IA": "...", "INSTANCIA": "...",
           "RESPONSAVEL": "...", "tentativas": 0 }
       ],
       "total_pendentes": 50
     }
     ```
- Endpoint exibido no card de webhooks (`WebhookDisparosTab`) com botão copiar + exemplo de uso curl/n8n.

### 3. Frontend

**Removido / desabilitado:**
- `DisparosCampanhasTab` deixa de permitir "Nova Campanha" e "Importar Contatos" — vira só **lista somente leitura** (histórico/monitor) com filtro por campanha/proposta.
- `DisparosImportDialog` aposentado.

**Novo:**
- Em `CampanhaPropostaModal` → adicionar/atualizar aba **"Zap"** com:
  - Botão **"Adicionar disparo Zap"** (chama RPC `gerar_disparo_zap`).
  - Seleção de chip/instância (mesma validação atual de "instância em uso").
  - Painel reutilizando `DisparosContatosPanel` filtrado por `campanha_proposta_id` (métricas, status, ações de admin já existentes — concluir, resetar tratando, resetar nozap, mudar status).
- `WebhookDisparosTab`: novo card no topo destacando o **GET endpoint** com URL completa, header de auth, exemplo de payload retornado, e link para gerar/rotacionar a API key.

**Mantido sem mudança:**
- `disparos-callback` (n8n → Sigma) continua igual.
- Lógica de fallback `5-NOZAP`/`6-BLOQUEADORA` → próxima fase da cascata permanece nas regras de cascata existentes.

### 4. Aposentadoria do cron interno

- A função `disparos-webhook` (`acao: 'iniciar' | 'processar_agendados'`) deixa de ser chamada pelo frontend. Mantida temporariamente em `supabase/functions/` por compatibilidade, mas marcada como deprecated no header.
- O n8n passa a ter um workflow simples: `Schedule (5min) → HTTP GET disparos-zap-pendentes → Loop contatos → enviar via Evolution → POST disparos-callback`.

### Arquivos alterados

- nova migration SQL (colunas + RPC `gerar_disparo_zap`)
- nova edge function `supabase/functions/disparos-zap-pendentes/index.ts`
- secret `DISPAROS_ZAP_API_KEY`
- `src/components/disparos/DisparosCampanhasTab.tsx` — remove criação/import, vira monitor
- `src/components/disparos/CampanhaPropostaModal.tsx` — nova/ajustada aba Zap com botão "Adicionar disparo"
- `src/components/disparos/DisparosContatosPanel.tsx` — aceita filtro por `campanha_proposta_id`
- `src/components/disparos/WebhookDisparosTab.tsx` — novo card do GET endpoint
- arquivar: `DisparosImportDialog.tsx` (remover do uso), header deprecated em `disparos-webhook/index.ts`

### Resultado

- Disparo Zap é parte natural do dossiê da proposta — mesma lógica das outras raias.
- Sigma deixa de orquestrar tempo de envio; n8n controla via GET periódico.
- Mesmo JSON de payload e mesmo callback — workflow do n8n só troca trigger (cron interno → cron próprio + GET).
- Status e fallback intactos.

