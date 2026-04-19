# Plano: Sistema de Disparo Inteligente Anti-Ban

**Data:** 18/04/2026
**Status:** Planejado
**Base:** intel-wave-blast (broadcast-processor + send-evolution-message) + WhatsApp Prospecção (N8N workflow)

---

## Visão geral

O sistema de disparo do Sigma precisa fazer 3 coisas:
1. **Disparar mensagens iniciais** pra leads FRIO → mudar pra CONTATADO
2. **Receber respostas** e rotear pra IA conversar → CONTATADO → EM_CONVERSA
3. **Proteger os chips** de banimento com técnicas anti-detecção

---

## 1. Proteções Anti-Ban (do intel-wave-blast)

### 1.1 Spintax — Mensagens nunca são iguais

Cada mensagem é diferente usando sintaxe de variações:

```
{Boa tarde|Olá|E aí}, {{nome}}! {Tudo bem|Como vai}?
{Sou o|Aqui é o} Dr. Maikon, {cirurgião cardiovascular|médico e gestor} da GSS.
[OPCIONAL] Segue minhas redes: instagram.com/maikonmadeira
```

**Resultado:** 3×2×2×2 = 24 variações possíveis pra mesma mensagem. WhatsApp não detecta como spam.

**Implementação no Sigma:**
- Campo `mensagem_inicial` na campanha aceita spintax
- Função `resolveSpintax()` no broadcast-processor resolve antes de enviar
- Cada envio salva os `variation_indices` pra rastreabilidade

### 1.2 Delay aleatório entre mensagens

```
delay_min_ms: 8000    // mínimo 8 segundos entre msgs
delay_max_ms: 25000   // máximo 25 segundos
```

**Por quê:** WhatsApp detecta disparos que chegam em intervalos fixos. Randomização simula comportamento humano.

**Implementação no Sigma:**
- Campos `delay_min_ms` e `delay_max_ms` na campanha
- `getRandomDelay(min, max)` entre cada envio
- Default conservador: 8-25s (120-180 msgs/hora)

### 1.3 Delay entre lotes (batch pause)

```
batch_size: 10                    // 10 leads por lote
delay_between_batches: 300s       // pausa de 5 min entre lotes
delay_between_batches_max: 600s   // até 10 min (aleatório)
```

**Por quê:** Depois de 10 mensagens, pausa longa. Simula operador que disparou um bloco e foi fazer outra coisa.

**Implementação no Sigma:**
- Campos `batch_size`, `delay_between_batches_min`, `delay_between_batches_max` na campanha
- Broadcast-processor pausa entre lotes com `next_batch_at`
- Self-invoke recursivo: edge function chama a si mesma pra continuar

### 1.4 Rotação de chips (round-robin)

```
rotation_strategy: 'round_robin' | 'random' | 'single'
instance_ids: ['chip-1-id', 'chip-2-id', 'chip-3-id']
```

**Por quê:** Distribuir volume entre múltiplos chips. Se um bane, os outros continuam.

**Implementação no Sigma:**
- Campo `chip_ids` (UUID[]) na campanha em vez de `chip_id` único
- `rotation_strategy` na campanha
- Broadcast-processor alterna chips a cada lote ou a cada mensagem
- Se chip desconecta → pula pro próximo automaticamente

### 1.5 Jitter aleatório

```javascript
const jitter = Math.floor(Math.random() * 2000) + 500;
await new Promise(r => setTimeout(r, jitter));
```

**Por quê:** Adiciona imprevisibilidade extra. Mesmo com delays, um padrão sutil pode ser detectado.

### 1.6 Normalização inteligente de telefone BR

```javascript
function normalizeBrazilianPhone(raw) {
  // Remove +55, adiciona 9° dígito se falta, valida range
}
```

**Por quê:** Telefones mal formatados = erro de envio = gasto de cota sem resultado.

### 1.7 Lock atômico de processamento

```sql
UPDATE broadcast_campaigns 
SET next_batch_at = lockUntil
WHERE id = campaign_id AND next_batch_at IS NULL
RETURNING id;
```

**Por quê:** Se duas invocações da edge function rodam ao mesmo tempo, só uma processa. Evita mensagem duplicada.

### 1.8 Pause check a cada 5 mensagens

```javascript
if (processedCount > 0 && processedCount % 5 === 0) {
  const { data: curr } = await supabase.from('campaigns').select('status').eq('id', id).single();
  if (curr?.status === 'paused') break;
}
```

**Por quê:** Permite pausar campanha mid-flight sem esperar o lote inteiro.

---

## 2. Alterações no banco necessárias

### 2.1 Novos campos em `campanhas`

```sql
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS delay_min_ms INTEGER DEFAULT 8000;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS delay_max_ms INTEGER DEFAULT 25000;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 10;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS delay_between_batches_min INTEGER DEFAULT 300;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS delay_between_batches_max INTEGER DEFAULT 600;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS chip_ids UUID[] DEFAULT '{}';
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS rotation_strategy TEXT DEFAULT 'round_robin';
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS next_batch_at TIMESTAMPTZ;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS responsaveis UUID[];
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS disparos_enviados INTEGER DEFAULT 0;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS disparos_falhas INTEGER DEFAULT 0;
```

### 2.2 Novos campos em `campanha_leads`

```sql
ALTER TABLE campanha_leads ADD COLUMN IF NOT EXISTS variation_indices INTEGER[];
ALTER TABLE campanha_leads ADD COLUMN IF NOT EXISTS chip_usado_id UUID;
ALTER TABLE campanha_leads ADD COLUMN IF NOT EXISTS erro_envio TEXT;
ALTER TABLE campanha_leads ADD COLUMN IF NOT EXISTS mensagem_enviada TEXT;
```

---

## 3. Edge Functions a criar

### 3.1 `campanha-disparo-processor` (NOVA)

Adaptação do `broadcast-processor` do intel-wave-blast para o modelo do Sigma.

**Fluxo:**
```
Recebe { campanha_id } →
  Busca campanha (config, chips, briefing) →
  Verifica lock (next_batch_at) →
  Busca campanha_leads WHERE status = 'frio' LIMIT batch_size →
  Para cada lead:
    1. Resolve spintax da mensagem_inicial
    2. Substitui variáveis ({{nome}}, {{especialidade}})
    3. Escolhe chip (rotation_strategy)
    4. Envia via send-evolution-message
    5. Atualiza campanha_leads: frio → contatado
    6. Registra touchpoint em lead_historico
    7. Delay aleatório (delay_min_ms ~ delay_max_ms)
  Fim do lote →
    Pausa (delay_between_batches_min ~ max) →
    Self-invoke pra próximo lote
```

**Proteções integradas:**
- Lock atômico via `next_batch_at`
- Pause check a cada 5 msgs
- Timeout safety (50s max por invocação)
- Erro por lead não para o lote (catch individual)
- Chip desconectado → pula pro próximo da lista

### 3.2 `campanha-ia-responder` (NOVA)

Adaptação do workflow WhatsApp Prospecção para edge function.

**Fluxo:**
```
Webhook SigZap recebe mensagem →
  Identifica lead pelo phone_e164 →
  Busca campanha_leads WHERE lead_id = X AND status IN ('contatado', 'em_conversa', 'aquecido') →
  Busca campanha → briefing_ia + mensagem_inicial →
  Monta prompt dinâmico (template base + briefing da campanha) →
  Busca histórico de msgs da conversa (sigzap_messages) →
  [Se áudio → Whisper transcrição] →
  [Se imagem → GPT-4o Vision] →
  Chama Claude API com prompt + histórico →
  Parseia saída JSON →
  Envia resposta via Evolution API →
  Atualiza status: contatado → em_conversa → aquecido → quente →
  Se ALERTA_LEAD → cria tarefa em tarefas_captacao + notifica responsáveis
```

**Prompt dinâmico gerado do briefing_ia:**
```
<contexto>
Você é {{persona}} da GSS Saúde. Fala como colega de profissão.
</contexto>

<oportunidade>
  <servico>{{briefing_ia.servico}}</servico>
  <diferencial>{{briefing_ia.diferencial}}</diferencial>
  <valor>{{briefing_ia.valor}}</valor>
  <objecoes>{{briefing_ia.objecoes}}</objecoes>
</oportunidade>

<responsaveis>
  Quando não souber responder, dispare alerta para: {{responsaveis}}
</responsaveis>

<fluxo_conversa>
  PASSO 1 — Confirmar perfil (especialidade, RQE)
  PASSO 2 — Origem e formação
  PASSO 3 — Experiência na área
  PASSO 4 — Abertura para proposta
  PASSO 5 — Handoff → pedir permissão → notificar operador
</fluxo_conversa>
```

### 3.3 `send-evolution-message` (COPIAR do intel-wave-blast)

Copiar direto — já funciona com Evolution API. Adaptar:
- Trocar `whatsapp_instances` → `chips` (tabela do Sigma)
- Trocar `whatsapp_instance_secrets` → buscar config do Evolution API da VPS

---

## 4. Workflow N8N de orquestração

### 4.1 Cron de disparo diário (NOVO)

```
Schedule Trigger (a cada 30 min) →
  Buscar campanhas ativas (status = 'ativa') →
  Para cada campanha:
    Verificar se já atingiu limite_diario_campanha →
    Se não: invocar campanha-disparo-processor
```

### 4.2 Webhook de resposta (NOVO ou adaptar SIGMA-EVO)

```
Webhook Evolution API (mensagem recebida) →
  Ignorar fromMe →
  Debounce 10s (via Supabase em vez de Google Sheets) →
  Identificar lead por phone →
  Verificar se lead está em alguma campanha ativa →
  Se sim: invocar campanha-ia-responder
  Se não: rotear pro SigZap normal
```

---

## 5. Configurações expostas no modal de campanha

### Aba "Configuração" (já existe, adicionar):

```
Chips WhatsApp:         [Multi-select de chips]
Estratégia de rotação:  [Round-robin | Aleatório | Sequencial]
Responsáveis:           [Multi-select de usuários]
```

### Aba "Disparo" (NOVA):

```
Limite diário:          [___120___] disparos/dia
Tamanho do lote:        [___10___] msgs por lote
Delay entre msgs:       [_8_]s min  [_25_]s max
Pausa entre lotes:      [_5_]min min  [_10_]min max
```

Preview calculado:
> "Com essa configuração: ~120 msgs/dia, cada lote de 10 demora ~3min, pausa de 5-10min entre lotes. Estimativa de conclusão: 40 dias para 4.731 leads."

### Aba "Mensagem" (já existe, melhorar):

```
[Editor com suporte a spintax]

Preview: "Boa tarde, Dr. João! Tudo bem? Sou o Dr. Maikon..."
Variações possíveis: 24

Variáveis disponíveis:
  {{nome}} — Nome do médico
  {{especialidade}} — Especialidade do lead
  {{cidade}} — Cidade do lead
  {{uf}} — Estado do lead
```

---

## 6. Ordem de implementação

### Fase 1 — Banco + Edge Functions (4h)
1. ALTER TABLE campanhas (novos campos de disparo)
2. ALTER TABLE campanha_leads (variation_indices, chip_usado, erro)
3. Copiar send-evolution-message (adaptar pra chips do Sigma)
4. Criar campanha-disparo-processor (adaptar broadcast-processor)
5. Corrigir trigger handoff (sem dependência de campanha_propostas)

### Fase 2 — IA Conversacional (4h)
1. Criar campanha-ia-responder (edge function)
2. Template de prompt dinâmico a partir do briefing_ia
3. Integrar com SigZap webhook (rota de decisão: campanha ou normal)
4. Debounce via Supabase (substituir Google Sheets)

### Fase 3 — N8N Workflows (2h)
1. Cron de disparo diário
2. Webhook de resposta com routing

### Fase 4 — Frontend ajustes (2h)
1. Aba de disparo no modal de campanha (delays, batch, rotation)
2. Editor de spintax com preview
3. Seletor de múltiplos chips + responsáveis
4. Link no sidebar

### Fase 5 — Testes e validação (2h)
1. Campanha de teste com 5 leads
2. Verificar delays e spintax
3. Simular ban de chip e fallback
4. Testar IA respondendo
5. Verificar handoff de lead quente

---

## 7. Configuração padrão recomendada (conservadora)

| Parâmetro | Valor | Justificativa |
|---|---|---|
| delay_min_ms | 8000 | 8s mínimo entre msgs (humano leva 5-15s) |
| delay_max_ms | 25000 | 25s máximo (variação grande = difícil detectar) |
| batch_size | 10 | 10 msgs por lote (operador humano faria similar) |
| delay_between_batches_min | 300 | 5min pausa (como se fosse fazer café) |
| delay_between_batches_max | 600 | 10min máx (imprevisível) |
| limite_diario_campanha | 120 | 120/dia por campanha (meta oficial ~250/dia) |
| rotation_strategy | round_robin | Distribui igualmente entre chips |

**Com 3 chips + 10 campanhas:** 120 × 10 = 1.200 msgs/dia ÷ 3 chips = 400/chip/dia (seguro)

---

## 8. Monitoramento e alertas

### No dashboard de campanha:
- Taxa de falha por chip (se > 10% → chip problemático)
- Velocidade de envio (msgs/hora)
- Leads sem resposta há > 48h (pool de re-tentativa)

### Alertas automáticos:
- Chip desconectou → notificação pro admin + ativa fallback
- Taxa de falha > 20% → pausa automática da campanha
- Lead quente → notificação urgente pra responsáveis
