# Plano de Melhorias Pós-MVP — Máquina de Prospecção
**Criado em:** 2026-04-19 (após validação multimodal end-to-end)
**Contexto:** Bloco 2 está tecnicamente fechado. Esse plano cobre as 4 melhorias críticas pra produção real.

---

## Princípios

1. **Reutilizar infra existente** — não criar tabelas/serviços paralelos
2. **Ordem por valor × esforço** — entregar o que destrava decisão da Ramone primeiro
3. **Tradeoffs explícitos** — cada decisão com alternativa e por que descartei
4. **Sem over-engineering** — Bloco 3 e 4 ainda vêm; resistir a antecipar features

---

## Camadas

| Camada | O que entrega | Esforço | Quando |
|---|---|---|---|
| **1. Métricas + Dashboard** | Ramone consegue medir performance | 4-6h | Antes da call de amanhã (parcial) |
| **2. Fallback de chip** | Disparo + IA sobrevivem chip caído | 5h | Pós-call (parcial amanhã) |
| **3. IA mais humana** | Reduz detecção como bot | 1h ganho rápido + research | Amanhã + iterativo |
| **4. Q&A handoff humano** | IA não inventa quando não sabe | 1.5-2 dias | Bloco 2 final ou Bloco 3 |

---

## Camada 1 — Métricas + Dashboard

### Problema
Hoje todos os dados estão no banco (`campanha_leads`, `lead_historico`, `chips`) mas só temos cards básicos no `/prospeccao`. Ramone vai pedir KPIs e não temos onde mostrar.

### Solução

**1.1 — VIEW de métricas agregadas**
```sql
CREATE OR REPLACE VIEW vw_campanha_metricas AS
SELECT
  c.id, c.nome, c.status,
  COUNT(*) FILTER (WHERE cl.status != 'frio')                          AS disparados,
  COUNT(*) FILTER (WHERE cl.status IN ('em_conversa', 'aquecido'))     AS em_conversa,
  COUNT(*) FILTER (WHERE cl.status = 'quente')                         AS quentes,
  COUNT(*) FILTER (WHERE cl.status = 'convertido')                     AS convertidos,
  COUNT(*) FILTER (WHERE cl.status = 'descartado')                     AS descartados,
  COUNT(*) FILTER (WHERE cl.status = 'quente'
    AND cl.data_status < NOW() - INTERVAL '1 hour')                    AS quentes_esperando,
  AVG(EXTRACT(EPOCH FROM (cl.data_status - cl.data_primeiro_contato))/3600)
    FILTER (WHERE cl.status IN ('quente', 'convertido'))               AS horas_ate_quente,
  COUNT(DISTINCT cl.chip_usado_id)                                     AS chips_usados
FROM campanhas c
LEFT JOIN campanha_leads cl ON cl.campanha_id = c.id
GROUP BY c.id;
```

**1.2 — Página `/prospeccao/relatorio`** (ou expandir dashboard atual)
- 4 cards principais: pipeline, em conversa, quentes, conversão %
- **Card crítico em vermelho**: "Leads quentes esperando >1h" + lista
- Funil visual (frio → contatado → em_conversa → quente → convertido)
- Tabela performance por chip (volume + erro %)

### Esforço: 4-6h
- 1h: migration da VIEW
- 2h: hook + componentes
- 2h: página + cards + tabela
- 1h: ajustes visuais

### Mudanças
- ✅ 1 migration (VIEW)
- ✅ 1 página + 3 componentes React
- ❌ Edge functions

---

## Camada 2 — Fallback de chip

### Problema (validado lendo o código)
- **Disparo** (`campanha-disparo-processor` linha 233+): se Evolution retorna erro, lead vai pra `failed`. Não retenta com outro chip da campanha.
- **IA** (`campanha-ia-responder` linha 185+): responde via mesmo `instance_name` que veio na webhook. Se aquele chip estiver fora, IA fala sozinha.
- **Healthcheck**: inexistente. Bruna só descobre chip caído pelos efeitos.

### Solução

**2A — Retry no disparo (1h, alta prioridade)**
```typescript
// Pseudo-código:
for (const chip of [chipPrincipal, ...chipsBackup]) {
  try {
    const resp = await fetchWithTimeout(`${evoUrl}/message/sendText/${chip.instance_name}`, ...);
    if (resp.ok) { sucesso = true; chipUsado = chip; break; }
    chip.errosConsecutivos++;
  } catch (e) { /* tenta próximo */ }
}
if (!sucesso) marcarLeadFalhou();
```
Marcar `chips.status = 'suspeito'` após 3 erros consecutivos (campo já existe).

**2B — Fallback na IA (2h)**
- Quando IA tenta responder e Evolution falha:
  1. Buscar outros chips ativos da mesma campanha (`campanha.chip_ids` ∩ `chips.online = true`)
  2. Tentar próximo chip da lista
  3. Se conseguir: atualizar `campanha_leads.chip_atual_id` (novo campo)
  4. Continuar conversa pelo chip novo
- **Tradeoff explícito:** o lead vai ver número diferente. Pode estranhar. Aceitável porque alternativa é silêncio total.
- Mitigação: msg curta de transição se trocar chip ("oi de novo, mudando de número rapidinho aqui").

**2C — Healthcheck periódico (2h)**
- Edge function `chip-healthcheck` (chamada por cron N8N a cada 5min):
  - Para cada chip com `pode_disparar = true`:
    - GET `${evoUrl}/instance/connectionState/${instance_name}`
    - Se `state != "open"`: marcar `chips.online = false`, registrar timestamp
    - Se voltou: marcar `online = true`
  - Se >50% dos chips de uma campanha ativa estão off: alerta WhatsApp pra responsável

### Mudanças
- Banco: 
  - `chips.online` (bool default true), `chips.ultimo_check` (timestamptz)
  - `campanha_leads.chip_atual_id` (uuid FK chips)
- Edge: `campanha-disparo-processor` (retry), `campanha-ia-responder` (fallback), nova `chip-healthcheck`
- N8N: novo workflow `chip-healthcheck-cron` (5min)
- Frontend: indicador visual de chip offline na lista de campanhas

### Esforço total: ~5h

---

## Camada 3 — IA mais humana

### Problema
Prompt atual é decente mas tem tells de bot:
- Pode responder em 200ms
- Sem "digitando..." (médico vê msg aparecer do nada)
- Saudações repetitivas
- Pontuação perfeita
- Sem variação de tom entre conversas

### Solução

**3A — Typing indicator (30min, ganho enorme)**
Antes de cada msg da IA, chamar:
```
POST {evoUrl}/chat/sendPresence/{instance_name}
{ "number": "<phone>", "presence": "composing", "delay": <ms> }
```
Delay proporcional ao tamanho: `Math.min(8000, msg.length * 50)` (cap em 8s).

Implementação no `campanha-ia-responder` antes de cada `sendText` no loop.

**3B — Variar abertura + imperfeição calculada (15min)**
Adicionar ao prompt:
```
- Varie aberturas: "oi", "opa", "e aí dr", "boa", etc. NUNCA "Olá!".
- Pontuação humana: omita vírgulas opcionais, use abreviações naturais (vc, tb, qq).
- Não use emoji estruturado, listas, negrito ou markdown — médico identifica como bot.
- Comprimento variado: ora 1 frase curta, ora 2 frases. Evite uniformidade.
```

**3C — Pesquisa externa (research subagent, paralelo)**
Spawnar subagent pra trazer:
- 5-10 padrões testados de "AI sales agents undetectable"
- Repos de prompt engineering pra B2B
- Casos PT-BR específicos
- Como Manychat, Take Blip, Bland AI lidam com isso

**3D — Variações de prompt por campanha (3h, opcional Bloco 3)**
Hoje briefing tem `info_extra`. Adicionar:
- `tom`: formal | casual | colega (default colega)
- `persona_nome`: nome fictício do "operador" (varia entre campanhas)
- `assinatura`: como assina ("- João", nada, etc)
- Prompt builder usa essas variáveis

**3E — Telemetria de qualidade (2h)**
- Adicionar `campanha_leads.score_humano` (1-5, manual)
- Botão na UI da conversa: "essa conversa pareceu robótica?"
- Bruna marca → vira input pra próxima iteração de prompt

### Esforço
- 3A + 3B: ~45min (fazer amanhã)
- 3C: independente (rodar paralelo)
- 3D + 3E: ~5h (encaixar quando der)

---

## Camada 4 — Q&A handoff humano

### Problema
IA não tem informação granular (valor exato, escala específica, condições não-listadas no briefing). Hoje 2 cenários ruins:
1. IA inventa → médico descobre depois → quebra confiança
2. IA passa pro handoff total → operador recebe "lead quente" mas precisa começar do zero, perde momentum

### Solução
Padrão "pausa-pergunta-relay":
- IA detecta dúvida que não pode responder
- Pausa a IA pra esse lead
- Manda alerta pro operador com pergunta + resumo
- Operador responde **quotando** o alerta no WhatsApp dele
- Sistema captura a resposta (via webhook), IA reformula, manda pro lead, retoma fluxo

### Arquitetura

**Banco**
```sql
CREATE TABLE campanha_perguntas_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_lead_id uuid REFERENCES campanha_leads(id) ON DELETE CASCADE,
  pergunta_resumo text NOT NULL,
  contexto_conversa text,
  alerta_msg_id text NOT NULL,        -- ID da msg que mandamos pro operador
  alerta_phone text NOT NULL,
  alerta_instance text NOT NULL,
  respondida boolean DEFAULT false,
  resposta_humana text,
  respondida_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_pp_alerta_msg ON campanha_perguntas_pendentes(alerta_msg_id) 
  WHERE respondida = false;

ALTER TABLE campanha_leads ADD COLUMN aguarda_resposta_humana boolean DEFAULT false;
```

**Escopo das perguntas que disparam handoff** (decisão Raul 19/04):
- ✅ Dúvidas **técnicas específicas** (procedimento, equipamento, equipe, escala, especificidade do hospital)
- ❌ Valores, condições gerais, benefícios — IA NÃO deve trazer pra humano, deve direcionar pro handoff comercial padrão (já existe)

**Prompt update** (no `buildPrompt`)
```
Se médico fizer pergunta TÉCNICA específica não coberta no briefing 
(procedimento, equipamento, plantão noturno/diurno detalhado, equipe), retorne:
{
  "AGUARDA_RESPOSTA_HUMANA": true,
  "pergunta_resumo": "...",
  "messages": ["uma msg curta tipo 'deixa eu confirmar isso e já te respondo'"]
}
NUNCA invente valores ou condições.
```

**Edge function `campanha-ia-responder`** (modificação)
Quando detectar `AGUARDA_RESPOSTA_HUMANA = true`:
1. Manda a msg de espera pro lead ("deixa eu confirmar...")
2. Marca `campanha_leads.aguarda_resposta_humana = true`
3. Manda alerta pro operador (handoff_telefone), capturando o `messageId` retornado
4. INSERT em `campanha_perguntas_pendentes` com esse messageId

**Bridge N8N** (modificação no Parsear)
Após detectar msg, antes de enfileirar:
- Se a msg tem `data.message.extendedTextMessage.contextInfo.stanzaId` (é uma quote)
- Verifica se esse stanzaId está em `campanha_perguntas_pendentes` (não-respondidas)
- Se sim: chama nova edge `campanha-relay-humano` com a resposta
- Se não: fluxo normal (enfileira)

**Nova edge function `campanha-relay-humano`**
1. Recebe: pergunta_id, resposta_humana, lead_id
2. Pede pra IA reformular: "operador disse X. Formula natural pro Dr Y considerando o contexto Z"
3. Manda mensagem reformulada pro lead via chip original
4. Insere no histórico (role: gss, marker "via humano")
5. Marca pergunta como respondida, libera `aguarda_resposta_humana = false`
6. Se houver msgs do lead na fila durante a espera: edge dispara processamento normal

**Edge case importante**: enquanto `aguarda_resposta_humana = true`, o `campanha-ia-responder` deve sair cedo se receber msg desse lead — só enfileira em `campanha_msg_queue` mas não chama IA. Quando humano responde e libera o flag, próxima msg do lead processa toda a fila acumulada.

### Esforço total: ~12h (1.5 dia)
- 1h migration banco
- 4h nova edge `campanha-relay-humano`
- 2h modificar `campanha-ia-responder` (detecção + alerta + flag)
- 3h modificar bridge N8N (branch quote handling)
- 30min update prompt
- 1.5h frontend (mostrar perguntas pendentes + status na UI)

### Quem decide
A Ramone provavelmente vai amar essa feature — é o que diferencia "IA que assusta" de "IA que destrava". Mas é Bloco 3-friendly. Vale alinhar.

---

## Cronograma sugerido

### Hoje à noite (1h)
- ✅ Atualizar memória + relatório com multimodal funcionando
- ✅ Salvar este plano

### Amanhã antes da call (3-4h)
- Camada 1 parcial: VIEW + 4 cards principais + lista de "quentes esperando"
- Camada 2A: retry de chip no disparo
- Camada 3A + 3B: typing indicator + variar abertura

→ **Demo pra Ramone com:** debounce, multimodal, dashboard, IA mais humana, retry de chip.

### Pós-call (definir prioridade com base na conversa)
- Camada 2B + 2C: fallback IA + healthcheck (~1 dia)
- Camada 4: Q&A handoff humano (~1.5-2 dias)
- Camada 3C: research subagent (paralelo, qualquer momento)
- Camada 3D + 3E: persona + telemetria (~5h)

### Decisões pra alinhar com Ramone
1. **Q&A handoff humano**: prioridade pra Bloco 2 final ou empurrar pro Bloco 3?
2. **Soft launch**: 2 semanas de uso pequeno antes de escalar pra 1000/dia?
3. **Telemetria qualitativa**: Bruna avalia naturalidade conversa por conversa?
4. **Healthcheck cron**: aceitável rodar a cada 5min mesmo fora do horário comercial?

---

## Risco × Custo de cada camada

| Camada | Risco se não fizer | Custo de fazer |
|---|---|---|
| 1 — Métricas | Ramone duvida do progresso, contrato esfria | Baixo (4-6h) |
| 2 — Fallback chip | 1 chip cai → campanha morre silenciosamente | Médio (5h) |
| 3 — IA humana | Médicos detectam bot, reputação GSS atinge | Baixo (1h ganhos rápidos) |
| 4 — Q&A handoff | IA inventa, perde leads, ou handoff prematuro | Alto (1.5-2 dias) |

**Recomendação minha:** 1 + 2A + 3A + 3B amanhã (~5h). Resto depende da call com Ramone.
