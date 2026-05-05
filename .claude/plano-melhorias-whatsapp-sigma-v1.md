# Plano Melhorias WhatsApp + SigZap — SigmaGSS v1

**Status:** Proposto, aguardando aprovação Raul
**Data:** 2026-05-05
**Autor:** Claude (após investigação dos pontos do [[Ewerton]])
**Escopo:** Reformar a integração WhatsApp do Sigma (sync, typing, anti-ban gaps, dashboard)
**Horizonte de execução:** 3 sprints × ~1 semana = 3 semanas
**Esforço dev estimado:** ~70-90h
**Independente do:** Plano Anti-Ban (Sprints 2-4 antiban seguem após contratação Bright Data)
**Pode rodar em paralelo:** SIM — não toca em `pre_send_check` nem em `chip_state`/`chip_send_log`

---

## 0. Contexto

[[Ewerton]] reportou em 04-05/05 três problemas operacionais:

1. **Conversas não sincronizam no Sigma após mensagem WhatsApp**
2. **Indicador "digitando..." parece não funcionar**
3. **Várias melhorias estruturais necessárias na parte do WhatsApp**

Esta sessão de investigação confirmou os 3 e descobriu mais 5 problemas estruturais relacionados.

---

## 1. Problemas mapeados (ordem de gravidade)

### P1 — Sync de conversas quebrada por mismatch de tabela 🔴 CRÍTICO

**Onde:** `src/components/sigzap/ChatView.tsx:60-91`

```ts
// ChatView lê da tabela ERRADA:
.from('mensagens')                  // ← LEGADA, sem inserts hoje
.eq('conversa_pai', ...)
.subscribe('postgres_changes', { table: 'mensagens', ... })

// Mas as mensagens reais entram em:
sigzap_messages                      // ← Nova arquitetura, populada por receive-whatsapp-messages
```

**Sintoma:** abrir conversa não mostra histórico recente; mensagem nova chega mas UI não atualiza em real-time. Usuário tem que recarregar manualmente (e mesmo recarregando, não vê).

**Fix:** apontar `ChatView` (e provavelmente outros componentes em `src/components/sigzap/`) pra `sigzap_messages` com colunas certas (`conversation_id`, `from_me`, `message_text`, `created_at`).

**Esforço:** 4-6h dev (precisa rever 3-5 componentes, rodar testes na UI, verificar tipos TS).

---

### P2 — Typing indicator fire-and-forget sem validação 🟡 MÉDIO

**Onde:** `supabase/functions/campanha-ia-responder/index.ts:246-263`

```ts
try {
  await fetch(presenceUrl, {
    method: "POST",
    body: JSON.stringify({ number: phoneDigits, presence: "composing", delay: typingDelay }),
  });
} catch (_) { /* presence é best-effort */ }
await sleep(typingDelay);
```

**Problemas:**
- Resposta da Evolution não é validada (status 200? 4xx?)
- `delay` no payload pode estar sendo interpretado errado dependendo da versão Evolution
- Sem persistência de log = ninguém sabe se está funcionando
- Se Evolution rejeitar (chip offline ou payload inválido), só `await sleep` continua e mensagem sai sem typing

**Fix:**
- Validar response status, logar em `chip_send_log` (novo conteudo_tipo `presence`) ou em tabela auxiliar
- Documentar payload correto da Evolution Baileys (pode ser `delay` em ms, mas algumas versões esperam segundos)
- Adicionar fallback: se sendPresence retornar erro, ainda envia mas sem typing simulation

**Esforço:** 2-3h dev.

---

### P3 — Bypass do anti-ban em 3 edges 🔴 CRÍTICO

**Onde:**
- `supabase/functions/send-sigzap-message/index.ts:119-121` (envio manual via UI)
- `supabase/functions/ia-resposta-medico/index.ts:435` (IA legacy)
- `supabase/functions/send-whatsapp/index.ts` (legado, possivelmente não usado)

```ts
// Todas fazem POST direto sem helper:
await fetch(`${evoUrl}/message/sendText/${instanceName}`, { ... });
```

**Problema:** mensagens enviadas por essas edges **não passam pelo `pre_send_check`**, **não logam em `chip_send_log`**, **não respeitam warm-up curve**, **não disparam health monitor**. Bypass total do que foi construído na Sprint 1 anti-ban.

**Fix:** migrar todas pro `_shared/evo-sender.ts` (mesmo padrão usado nas 6 edges já migradas).

**Esforço:** 4-5h dev (mesma operação que Sprint 1 fez nas outras 6).

---

### P4 — Caminho oculto enviando fora do helper 🔴 CRÍTICO

**Sintoma:** `chip_send_log` vazio nos últimos 30min, mas `sigzap_messages` mostra disparos cold do `disparador-pediatria` em 05/05 13:42-13:46 ("Olá Dr(a)., tudo bem? Estamos com vagas disponíveis para UT...").

**Hipóteses:**
- Workflow N8N legacy enviando direto via Evolution sem passar pelo Sigma
- Cron do N8N processando alguma fila antiga
- Algum bot externo conectado à VPS

**Fix proposto (investigação):**
1. SSH na VPS, listar workflows N8N ativos: `n8n list:workflow --active=true`
2. Procurar workflows que façam POST direto em `/message/sendText`
3. Capturar logs Evolution dos últimos 30min: `docker logs disparador_evolution_api --since 30m | grep sendText`
4. Cruzar com IPs de origem dos requests (workflow N8N tem IP interno conhecido)

**Decisão pós-investigação:**
- Se workflow legacy não-essencial: desativar/deletar
- Se workflow legacy útil: portar pra edge function que use o helper
- Documentar todos os caminhos de envio em arquitetura nova

**Esforço:** 3-4h investigação + variável (1-8h pra portar/desativar dependendo do que encontrar).

---

### P5 — Sem retry exponencial em 429/503 🟡 MÉDIO

**Onde:** `supabase/functions/_shared/evo-sender.ts` (helper Sprint 1) retorna `{sent:false, reason, retryInMs}` mas callers não implementam retry.

**Problema:** mensagens em rate-limit transitório (429) ou Evolution down rapidinho (503) viram falha permanente. Caller (edge) precisa decidir reagendar — na prática só `campanha-disparo-processor` reagenda, outros descartam.

**Fix:**
- Helper deve fazer retry interno até N vezes com exponential backoff (2s, 4s, 8s) pra códigos transitórios (429, 500, 502, 503, 504)
- Códigos fatais (401, 403, 440) ainda retornam imediatamente
- Configurável: `maxRetries`, `retryOnCodes`

**Esforço:** 2h dev no helper + tests.

---

### P6 — Sem read receipts outbound 🟢 BAIXO (UX)

**Onde:** Sigma nunca chama `/chat/markMessageAsRead` da Evolution.

**Sintoma:** quando médico responde, ele NÃO vê "✓✓ azul" no chat dele. Pequena perda de UX — pode parecer que ninguém leu, gera ansiedade desnecessária.

**Fix:** ao receber mensagem em `receive-whatsapp-messages`, após gravar em `sigzap_messages`, chamar `/chat/markMessageAsRead/{instance}` com o `wa_message_id`.

**Esforço:** 1-2h dev.

---

### P7 — Tabelas legadas confusas 🟢 BAIXO (limpeza)

**Onde:** DB tem 12 tabelas relacionadas a mensagem:
```
comunicacao_mensagens, mensagens, messages, messages_2026_05_01..08, sigzap_messages
```

**Problema:** confusão de schema — qualquer dev novo entrando vai se perder. `messages_2026_05_*` parecem partições automáticas de uma migração antiga (provavelmente Lovable Cloud → Supabase).

**Fix:**
1. Auditar tabelas legadas (último insert, último read em logs)
2. Consolidar tudo em `sigzap_messages`
3. Drop tabelas órfãs (`mensagens`, `messages`, `messages_2026_*`, `comunicacao_mensagens` se não usadas)
4. Atualizar comentários SQL: `COMMENT ON TABLE sigzap_messages IS 'Mensagens WhatsApp — tabela canônica desde 04/2026'`

**Esforço:** 2-3h auditoria + 1h drop + tests (~4-5h total).

⚠️ **Alta cautela:** drop de tabela é irreversível. Fazer backup antes (pg_dump) e validar 100% que não tem código novo lendo.

---

### P8 — Sem dashboard de saúde do canal 🟡 MÉDIO

**Onde:** não existe.

**Problema:** Sigma não tem visão consolidada de:
- Mensagens entrando/h (volume real)
- Taxa de erro Evolution últimas 24h
- Latência média IA (delta entre msg recebida e resposta enviada)
- Status do bridge N8N (working/down)
- Distribuição de mensagens por chip
- Conversações sem resposta há mais de X horas

Hoje a única visão é via `bridge-healthcheck-v2` (5 métricas, mas não detalhadas) e logs Supabase (cru).

**Fix:** dashboard Lovable em `src/pages/SigZapHealth.tsx` com:
- Cards de KPI (msgs in/h, msgs out/h, error rate, latency p50/p95)
- Gráfico de volume por hora últimas 24h
- Tabela de chips com status: connection_state, msgs hoje, health_score, paused?
- Lista de "Conversas esquecidas" (humano atribuído + sem resposta há >2h)
- Alerta visual se bridge_health=down

**Esforço:** 6-8h dev (component + queries + estilização Lovable).

---

## 2. Sprint plan

### Sprint 1 — Fixes críticos (semana 1, ~16-20h)

**Objetivo:** sync funciona, todos os envios passam pelo helper, sem caminhos ocultos.

| Task | Esforço | Detalhes |
|---|---|---|
| **Fix P1**: ChatView lê `sigzap_messages` | 4-6h | Trocar tabela + filter + realtime + tipos TS. Auditar outros componentes em `src/components/sigzap/` que possam estar com mesmo bug |
| **Fix P3**: migrar `send-sigzap-message`, `ia-resposta-medico`, `send-whatsapp` pro helper `evo-sender.ts` | 4-5h | Mesmo padrão Sprint 1 anti-ban: import helper, substitui POST direto, define `eventoOrigem` apropriado (`manual`, `resposta_ia`, etc) |
| **Investigar P4**: caminho oculto enviando | 3-4h | SSH VPS, listar workflows N8N, logs Evolution, identificar quem está bypassando |
| **Fix P5**: retry exponencial no helper | 2h | Adicionar `maxRetries`, `retryOnCodes` no `sendWhatsAppText`, backoff 2/4/8s |
| Tests E2E | 3h | Manual: enviar via UI → ver chip_send_log; mandar msg pra chip → ver UI atualizar |

**Entrega:** UI sincroniza em real-time, todos os envios logados no `chip_send_log`, retries automáticos em 429/503.

---

### Sprint 2 — Robustez de canal (semana 2, ~12-16h)

**Objetivo:** typing confiável, read receipts, dashboard básico.

| Task | Esforço | Detalhes |
|---|---|---|
| **Fix P2**: typing indicator robusto | 2-3h | Validar response Evolution + log opcional + fallback se falhar |
| **Fix P6**: read receipts outbound | 1-2h | Chamar `markMessageAsRead` em `receive-whatsapp-messages` após gravar |
| **Fix P8 v1**: dashboard de saúde básico | 6-8h | Página `SigZapHealth.tsx` com KPIs + gráfico volume + tabela chips |
| Documentação operacional | 2-3h | Runbook pra Bruna/Ewerton: como ler dashboard, o que cada métrica significa, quando alertar |

**Entrega:** equipe operacional tem visão clara do canal em tempo real.

---

### Sprint 3 — Limpeza estrutural (semana 3, ~10-14h)

**Objetivo:** schema limpo, tabelas legadas removidas, documentação completa.

| Task | Esforço | Detalhes |
|---|---|---|
| **Fix P7**: auditar tabelas legadas | 2-3h | `mensagens`, `messages`, `comunicacao_mensagens`, `messages_2026_*` — quem usa, último insert/read |
| **Fix P7**: backup + drop seguro | 1-2h | `pg_dump` schema das legadas, drop em transação, validar prod por 24h |
| Comentários SQL nas tabelas canônicas | 1h | `COMMENT ON TABLE sigzap_messages IS '...'` |
| Atualizar handover docs | 1-2h | `.claude/handover-proxima-sessao.md` com arquitetura WhatsApp atualizada |
| Dashboard saúde v2 | 4-6h | Refinamentos pós-feedback Sprint 2: alertas, drill-down por chip, conversas esquecidas |

**Entrega:** schema limpo, dashboard maduro, próximo dev entra e entende.

---

## 3. Princípios diretores

1. **Não tocar em `pre_send_check`, `chip_state`, `chip_send_log`** — esses são da Sprint 1 anti-ban e estão funcionando. Plano novo USA esses recursos, não modifica.
2. **Helper único `evo-sender.ts` é o caminho** — qualquer envio Evolution passa por ele. Sem exceção.
3. **Realtime > polling** — UI não pode depender de F5. Tudo via Supabase Realtime escutando tabelas canônicas.
4. **Validar antes de assumir** — sempre logar resposta Evolution, não confiar em fire-and-forget pra coisas críticas.
5. **Backups antes de drop** — qualquer DROP TABLE precisa de pg_dump da tabela exportado pra storage Supabase.
6. **Testes manuais antes de deploy** — toda edge migrada precisa smoke test (enviar 1 msg de teste, conferir log) antes de mergear.

---

## 4. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| ChatView refator quebra UI em prod | Média | Alto | Deploy primeiro em ambiente staging (criar branch `feat/sigzap-sync`), testar manual, só depois merge. Lovable tem preview branches? |
| Migrar 3 edges sem helper introduz bug | Baixa | Médio | Mesmo padrão Sprint 1, já validado |
| Drop tabela legada quebra algum componente esquecido | Média | Crítico | pg_dump + rollback plan + 7 dias de monitoramento pós-drop |
| Workflow N8N legacy é essencial e ninguém sabe | Média | Médio | Investigação primeiro, não desativar até identificar dependência |
| Dashboard fica feio/lento | Baixa | Baixo | Lovable já tem componentes ok; queries simples + index |

---

## 5. Dependências

- ⚠️ **NÃO depende de Bright Data proxy** — pode rodar 100% em paralelo ao plano anti-ban
- ⚠️ **NÃO depende das iscas humanas** — não tem nada com aquecedor
- ⚠️ Depende: acesso SSH VPS pra investigar P4 (caminho oculto)
- ⚠️ Depende: ambiente staging Lovable ou equivalente pra testar UI antes de prod

---

## 6. Decisões abertas (precisam Raul)

1. **Ordem de prioridade entre antiban e melhorias WhatsApp**: rodar plano novo enquanto antiban espera Bright Data, ou esperar Bright Data e rodar tudo junto?
2. **Drop tabelas legadas em P7**: agressivo (drop direto após backup) ou conservador (rename pra `_legacy_` por 30d antes de drop)?
3. **Dashboard saúde**: usar Lovable + componentes nativos ou integrar com Grafana/Metabase externo?
4. **Investigação P4**: posso fazer SSH+queries logs ou prefere pedir pro Ewerton/equipe técnica fazer?

---

## 7. Métricas de sucesso

Pós Sprint 1 (1 semana):
- ✅ Mensagens entrando aparecem na UI em <2s (Realtime funcionando)
- ✅ 100% dos envios logados em `chip_send_log` (zero bypass)
- ✅ Caminho oculto identificado e portado/desativado

Pós Sprint 2 (2 semanas):
- ✅ Read receipts visíveis pro médico em <5s da resposta
- ✅ Dashboard responde em <1s pra qualquer query
- ✅ Equipe opera o canal sem precisar pedir ao dev pra abrir log

Pós Sprint 3 (3 semanas):
- ✅ DB com apenas tabelas canônicas (sigzap_*)
- ✅ Documentação atualizada (próximo dev entra e entende em <30min)

---

## 8. Veja também

- Plano paralelo: `.claude/plano-aquecimento-anti-ban-v1.md` (Sprints 2-4 antiban)
- Helper compartilhado: `supabase/functions/_shared/evo-sender.ts`
- ADR proxy: [[Decisoes/07-Provider-Proxy-BrightData-ISP]]
- Bug aberto: task #20 (handoff LEAD QUENTE não dispara pra Bruna) — possivelmente relacionado a P3/P4

## 9. Histórico

- **2026-05-05** — Plano criado após [[Ewerton]] reportar 3 problemas. Investigação revelou 5 problemas adicionais. Aguardando aprovação [[Raul]] pra abrir tasks e executar.
