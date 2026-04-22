

## Problema

O cronômetro mostra **105d 12h** porque o lead tem uma raia antiga (de campanha/proposta encerrada) que nunca foi fechada. Quando ele entra numa **nova proposta** com o mesmo número, o sistema pega a raia antiga em vez de abrir uma nova janela de contato isolada para a proposta atual.

Exemplo real: lead participou da campanha Chapecó com o número A → foi fechado por falta de interesse → semanas depois entra em outra proposta da mesma campanha (ou outra) com o mesmo número → conversa do WhatsApp já existe → trigger não abre nova raia porque acha que "já tem uma aberta" ou pega o tempo desde a primeira mensagem histórica.

## Conceito: janela de contato por (lead × proposta)

Cada vínculo `(lead, campanha_proposta)` tem sua própria janela de raia, **independente** de conversas antigas no WhatsApp. O cronômetro de tempo na raia mede **a janela atual desta proposta**, não o tempo absoluto desde a primeira mensagem do número.

Regras:

1. **Abertura da janela** = momento em que o lead é vinculado à proposta (`campanha_proposta_leads.created_at`) OU quando uma mensagem outbound é enviada após o vínculo, **o que vier primeiro relevante para esta proposta**.
2. **Fechamento da janela** acontece em 4 situações:
   - Operador clica **"Encerrar"** → `status_final = 'encerrado'`
   - Operador clica **"Próxima fase"** → `status_final = 'transferido'` (abre raia do próximo canal)
   - **Proposta é encerrada** (`campanha_propostas.status = 'encerrada'`) → fecha automaticamente todas as raias abertas dessa proposta como `status_final = 'proposta_encerrada'`
   - **Campanha é encerrada** → fecha em cascata todas as raias das propostas dessa campanha
3. **Reabertura em nova proposta**: quando o mesmo lead é vinculado a uma nova `campanha_proposta`, abre-se uma raia NOVA, isolada, com `entrou_em = now()`. A trigger de mensagem outbound deve filtrar por `campanha_proposta_id` específico, não pelo lead globalmente.

## Causa raiz do bug atual

A trigger `trg_sigzap_outbound_marca_contactado` hoje:
- Olha todas as `campanha_propostas ativas` que contêm o lead
- Insere raia se "não existe raia aberta WhatsApp" para aquele `(lead, proposta)`
- **Problema**: a query do frontend (`useLeadCanais`) pega a raia mais antiga aberta do lead, ignorando a proposta — então mostra 105d de uma proposta antiga que nunca foi fechada quando o lead aparece numa nova.

E também: ao **vincular o lead a uma proposta nova**, nenhuma raia é aberta. Só abre quando manda mensagem. Se o operador abrir o dossiê antes de mandar mensagem, vê resíduo de proposta antiga.

## O que vai mudar

### 1. Migration SQL

**a) Trigger no vínculo do lead à proposta** (`campanha_proposta_leads AFTER INSERT`):
- Abrir uma raia inicial "a contactar" em `campanha_proposta_lead_canais` para o canal inicial da cascata da proposta (geralmente WhatsApp), com `entrou_em = now()`, `status_final = NULL`. Ou deixar sem raia até a primeira mensagem — escolher uma das duas para consistência. **Decisão**: deixar SEM raia até o primeiro envio (evita poluir métrica). O frontend já trata "sem raia" como "A contactar" e mostra `—` no cronômetro.

**b) Corrigir `trg_sigzap_outbound_marca_contactado`**:
- A query atual não está restrita corretamente por proposta. Garantir que cada `(lead, proposta_ativa)` que NÃO TEM raia aberta para o WhatsApp recebe uma raia nova com `entrou_em = now()`. Ignorar raias de propostas encerradas.
- Idempotência: já existir raia aberta para `(lead, proposta, canal=whatsapp)` → não recriar.

**c) Trigger no encerramento da proposta** (`campanha_propostas AFTER UPDATE WHEN status muda para 'encerrada'`):
- Fechar todas as raias abertas (`status_final IS NULL`) de `campanha_proposta_lead_canais` daquela proposta com `status_final = 'proposta_encerrada'`, `saiu_em = now()`, `motivo_saida = 'proposta_encerrada'`.

**d) Trigger no encerramento da campanha** (`campanhas AFTER UPDATE WHEN status muda para 'encerrada'/'concluida'`):
- Para cada `campanha_proposta` ativa daquela campanha, marcar como encerrada (cascata vai disparar a trigger do item c).

**e) Backfill imediato**:
- Fechar todas as raias `(status_final IS NULL)` cuja proposta está com `status = 'encerrada'` → marcar `status_final = 'proposta_encerrada'`, `saiu_em = encerrada_em da proposta`.
- Para o lead atual mostrando 105d: identificar a raia órfã, fechá-la, e se ele está vinculado a uma proposta ativa sem raia aberta, abrir uma nova com `entrou_em = now()`.

### 2. Backend (`useLeadCanais` hook)

- Garantir que a query de "raia atual" filtra por `campanha_proposta_id` específico (parâmetro do dossiê) e por `status_final IS NULL`. Verificar que o componente pai já passa o `campanhaPropostaId` correto.
- Se hoje a query usa só `lead_id`, restringir.

### 3. Sem mudanças visuais

A coluna "Tempo na raia" continua igual; só vai mostrar o tempo correto da janela atual da proposta.

## Arquivos alterados

- nova migration SQL (4 triggers + backfill)
- `src/hooks/useLeadCanais.ts` — confirmar/corrigir filtro por `campanha_proposta_id`
- (opcional) `src/components/disparos/CampanhaLeadsList.tsx` — confirmar que passa `campanha_proposta_id` no hook

## Resultado

- Lead vinculado a proposta nova → raia começa do zero quando o operador manda a primeira mensagem (ou já fica em "A contactar" mostrando `—`).
- Encerrar proposta/campanha → todas as raias abertas dessa proposta/campanha fecham automaticamente.
- Mesmo lead voltando em nova proposta → janela isolada, cronômetro correto.
- Bug do "105d 12h" sumirá após o backfill.

