

## Plano (em português)

Quando uma mensagem for enviada para um lead — não importa de onde (painel manual, chat do SIG Zap ou disparo em massa) — o lead automaticamente:

1. Vira **"Contactado"** na proposta
2. Aparece no **Kanban de Acompanhamento** (coluna "Contatados")
3. Começa a contar **tempo na raia** (cronômetro ao vivo)
4. Ganha dois botões: **"Encerrar"** e **"Próxima fase"**

## O que vai mudar

### 1. Banco de dados (migration)

- **Gatilho automático** na tabela de mensagens: toda vez que uma mensagem sai (`from_me=true`) e a conversa tem lead vinculado:
  - Abre a "raia" do WhatsApp nas propostas ativas desse lead (cronômetro inicia)
  - Marca `leads.status = 'Contatados'` (se ainda estava "Novo")
  - Registra no histórico do lead
- **Função nova** `enviar_lead_proxima_fase`: fecha a raia atual como "transferido" e abre a do próximo canal da cascata da proposta
- **Backfill**: leads que você já contactou (Ewerton, Bruna) serão corrigidos automaticamente

### 2. Disparo em massa (`campanha-disparo-processor`)

Hoje envia direto pela Evolution API mas não registra a conversa no SIG Zap. Vou ajustar para gravar `sigzap_conversations` + `sigzap_messages` com o `lead_id` — assim o gatilho dispara também para envios em massa, e o lead fica visível no inbox do SIG Zap para ser respondido.

### 3. Painel manual (`send-disparo-manual`)

Remover o fechamento prematuro da raia (hoje fecha como "respondeu" no momento do envio). Quem fecha a raia agora é o operador, via os dois botões.

### 4. Lista de leads da proposta (`CampanhaLeadsList`)

- Coluna **"Tempo na raia"** com cronômetro ao vivo (atualiza a cada segundo enquanto a raia está aberta)
  - Lead "A contactar" → mostra `—`
  - Lead "Contactado" → cronômetro rodando
  - Lead fechado → tempo congelado
- Dois botões na linha do lead contactado:
  - 🟢 **Próxima fase** — passa para o próximo canal da cascata
  - 🔴 **Encerrar** — fecha o lead nessa proposta

### 5. Frontend — atualização instantânea

Após qualquer envio, atualizar automaticamente: lista de leads da proposta, Kanban de Acompanhamento e badge de status.

## Arquivos alterados

- Nova migration SQL (gatilho + função nova + backfill)
- `supabase/functions/send-disparo-manual/index.ts`
- `supabase/functions/campanha-disparo-processor/index.ts`
- `src/components/disparos/CampanhaLeadsList.tsx`
- `src/components/disparos/TempoRaia.tsx` (novo, cronômetro ao vivo)
- `src/hooks/useLeadCanais.ts` (novo hook `useEnviarProximaFase`)
- `src/hooks/useDisparoManual.ts` + hook do chat SIG Zap (invalidações)

## Resultado final

Você envia mensagem (de qualquer lugar) → lead vira "Contactado" → aparece no Kanban → cronômetro começa → você decide depois entre **Encerrar** ou mandar para a **Próxima fase**.

