# Handover — Próxima Sessão Claude Code
**Criado:** 2026-04-23
**Atualizado:** 2026-05-05 (sessão Bright Data + Sprint 2 antiban + P9 WhatsApp)
**Contexto:** cold-start. Esta sessão termina aqui. Próxima sessão lê este doc primeiro.

---

## 🆕 Update 2026-05-05 (LEIA PRIMEIRO)

**Estado pós-sessão 05/05:**

**Trilhas em paralelo (ambas ativas):**
1. **Anti-Ban (Plano `.claude/plano-aquecimento-anti-ban-v1.md`)** — Sprints 1-2 mergeadas
2. **Melhorias WhatsApp (Plano `.claude/plano-melhorias-whatsapp-sigma-v1.md`)** — Sprint 1 + P9 mergeadas

**Commits relevantes em `main`:**
- `17954c0` Sprint 1 antiban (foundation pre_send_check + helper único)
- `cc070e3` Sprint 1 WhatsApp (3 edges migradas pro helper, retry exponencial, ChatView órfã deletada)
- `f14e5be` Sprint 2 antiban camada 1 (chip-bootstrap automatizado)
- `c80ce7c` Sprint 2 antiban camada 2 (aquecedor-tick + graduator + pair-rotator)
- `b498c14` P9 WhatsApp (UI legada `/sigzap` deletada, redirect)
- `a2558c9` Aquecedor opt-in flag (chips antigos intactos)

**Proxy ativo:**
- **Bright Data ISP Compartilhado, 20 IPs Brasil** (zone `isp_proxy1`, customer `hl_10d829af`, $1.60/IP × 20 = ~$32/mês)
- Endpoint: `brd.superproxy.io:33335`
- Username: `brd-customer-hl_10d829af-zone-isp_proxy1-country-br-session-{chip_id}`
- Senha: `BRIGHT_DATA_PROXY_PASSWORD` (Supabase Secrets) + Bitwarden item `Bright Data — ISP BR (GSS)`
- Configs não-sensíveis: `config_lista_items` (proxy_provider/host/port/zone/customer_id/country)
- Webshare ainda contratado ($28.95/mo) mas inútil (US/EU). **Raul precisa cancelar manualmente.**

**Aquecedor automatizado rodando (3 crons agendados):**
- `chip-aquecimento-graduator-hourly`  `5 * * * *`  (move setup→aquecimento→pronto)
- `chip-pair-rotator-daily`            `0 3 * * *`  (re-sorteia pares power-law)
- `aquecedor-tick-2min`                `*/2 * * * *` (HTTP POST → edge `aquecedor-tick`)

**Opt-in obrigatório:** chip só entra no aquecedor se `chip_state.aquecedor_ativo=true`. Os 46 chips antigos têm `false` (intactos). `chip-bootstrap` seta `true` automaticamente em chips novos.

**Pra Ewerton subir chips novos:**
1. Cadastrar via UI ou chamar `chip-bootstrap` com `{nome: "X"}`
2. Em 2s: instância Evolution + proxy BR + persona BR aleatória + webhook + QR base64
3. Ewerton escaneia QR no celular do número
4. Após 5min connection_state=open, cron graduator move pra fase=aquecimento
5. Cron pair-rotator (próxima madrugada) cria pares power-law
6. Cron aquecedor-tick (2min) gera mensagens orgânicas via OpenAI gpt-4o-mini
7. Após 7d, cron promove pra fase=pronto. Ativa em campanha.

**Pendências críticas pra próxima sessão:**
- [ ] Confirmar chips do Ewerton entraram no fluxo (query: `SELECT nome, fase FROM vw_chip_health WHERE EXISTS (SELECT 1 FROM chip_state WHERE chip_state.chip_id=chips.id AND aquecedor_ativo=true)`)
- [ ] Sprint 2 WhatsApp (P2 typing robusto + P6 read receipts + P8 dashboard saúde) — ~10h
- [ ] Sprint 3 antiban (TTS áudio + stickers + circadian fino) — ~36h, não bloqueante
- [ ] Cancelar Webshare ($28.95/mo) — Raul faz manual
- [ ] JIDs Bruna/Ramone/Ewerton pra `isca_externa` (não bloqueia)
- [ ] Bug task #20 handoff LEAD QUENTE pra Bruna
- [ ] Vault `Decisoes/08-Page-Sigzap-Legacy-Decommission.md` (sugestão, não urgente)

**Detalhes plenos no Vault:** `C:\Users\rauls\cofre-obsidian\Projetos\SigmaGSS.md` entrada 2026-05-05.

---

## 0. Contexto em 30 segundos

Raul Seixas (Pulse ID) contratado pela **GSS Saúde** (agência de plantões médicos) pra construir CRM Sigma com máquina de prospecção via WhatsApp + IA.

**Contrato:** 4 blocos (Disparo, Pipeline Prospecção, Perfil Médico, Inteligência Campanha). 23/03–20/06/2026.

**Hoje:** Bloco 2 tecnicamente fechado, Bloco 3 antecipado em 55%, Bloco 4 não iniciado. Plano Anti-Ban v1 + Plano Melhorias WhatsApp em execução paralela.

**Stakeholders:** Ramone (diretora), Maikon (gestor, cirurgião cardiovascular), Bruna (prospecção operacional), Ewerton (dev GSS — escopo reduzido).

---

## 1. Primeiras 5 coisas a ler (ordem)

1. **Esta seção "Update 2026-05-05" acima** — estado pós-sessão Sprint 2 antiban
2. `.claude/plano-aquecimento-anti-ban-v1.md` — plano antiban completo
3. `.claude/plano-melhorias-whatsapp-sigma-v1.md` — plano WhatsApp (P1-P9)
4. `.claude/plano-master-prospeccao.md` — plano mestre v2 canônico (4 trilhas)
5. `plan/relatorios/status-projeto-geral.md` — status com percentuais

Se a pergunta do Raul for operacional (não-codificação), ler primeiro `plan/relatorios/sessao-19-23-abril-resumo.md` pra contexto recente.

---

## 2. Memória canônica

Tudo em `C:\Users\rauls\.claude\projects\C--Users-rauls-sigma-new\memory\`:

- `MEMORY.md` — índice principal, sempre carregado
- `user_raul_role.md`, `user_raul.md` — quem é o user
- `feedback_*.md` — como Raul quer que eu trabalhe (git identity, sem PRs, sempre pull first, safety-first, nunca co-author Claude Code)
- `feedback_ewerton_scope.md` — Raul lidera tecnicamente, Ewerton realinhou
- `project_bloco2_estado_atual.md` — estado detalhado
- `project_ramone_20abr.md` — decisões da reunião 20/04
- `reference_acesso_vps_n8n.md` — credenciais infra

---

## 3. Credenciais e acessos (em memory)

- **Supabase Management API:** `$SBP_TOKEN_FROM_BITWARDEN` (atualizado 24/04 — anterior expirou). **Sempre verificar `reference_supabase_token.md`** antes de usar — pode rotacionar.
- **Service role JWT** (runtime das edges + pg_cron, válido até ~2036): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSI...DyapBTSccnh-0I7am5EP-VsqguKmr0VP95FeGjbXitI`
- Project: `zupsbgtoeoixfokzkjro.supabase.co`
- Evolution API: `https://disparador-evolution-api.r0pfyf.easypanel.host/` + key `Gss-Wpp-Evolution-@2025-S3guR0`
- N8N: `https://disparador-n8n.r0pfyf.easypanel.host/`
- VPS: `ssh root@147.93.71.48` (chave rauls@Alfred configurada)
- OpenAI: configurada como env var `OPENAI_API_KEY` nas edge functions
- Resend: key temporária (do Raul) salva em `config_lista_items.resend_api_key`. Domínio GSS ainda não verificado — from é sandbox `onboarding@resend.dev`.

**Importante:** se Management API der 401, é porque o `sbp_` rotacionou. Pegar novo em `reference_supabase_token.md` ou pedir pro Raul gerar em `supabase.com/dashboard/account/tokens`. O **service_role JWT é separado** e continua funcionando — só o sbp_ rotaciona.

---

## 4. Arquitetura em 60 segundos

### Fluxo de disparo
```
campanha criada (UI) 
 → campanha-disparo-processor (edge)
   → spintax + chip rotation + retry fallback
   → Evolution API manda WhatsApp
   → UPDATE campanha_leads SET proximo_touch_em (agenda T2)
```

### Fluxo de resposta (lead responde WhatsApp)
```
Evolution webhook
 → N8N bridge (campanha-webhook-bridge)
   → Parsear (extrai phone, msg, opt-out, quoted_msg_id)
   → IF Q&A reply? → campanha-qa-relay (se for resposta de responsável)
   → IF Opt-out? → campanha-opt-out-handler
   → Insert na fila (campanha_msg_queue) → Wait 10s → dono da fila? → Consolidar
   → campanha-ia-responder (edge)
     → busca perfil unificado + timeline cross-canal
     → IA com prompt v8 (régua frio/morno/quente)
     → multimodal (audio→Whisper, imagem→Vision, ambos via decrypt Evolution)
     → se AGUARDA_RESPOSTA_HUMANA → campanha-qa-handoff-handler
     → envia msgs via Evolution com typing indicator
     → UPDATE histórico + status
     → se maturidade=quente + ALERTA_LEAD → dispara handoff_telefone
```

### Fluxo de cadência
```
pg_cron 12h UTC seg-sex
 → campanha-cadencia-processor
   → busca campanha_leads com proximo_touch_em <= NOW()
   → executa WhatsApp (Evolution) ou Email (Resend)
   → registra em campanha_lead_touches
   → avança proximo_touch_em pro próximo passo
   → guards: opt_out, classificacao, cooldown, humano_assumiu, aguarda_resposta_humana
```

---

## 5. Edge functions deployadas

| Função | Papel |
|---|---|
| `campanha-disparo-processor` | Motor anti-ban: spintax, rotação chip, retry fallback, agenda T2 |
| `campanha-ia-responder` | IA conversacional v8 (multimodal, perfil, régua, Q&A detection) |
| `campanha-cadencia-processor` | Executa touches pendentes (cron diário) |
| `campanha-email-sender` | Resend wrapper com footer LGPD |
| `campanha-opt-out-handler` | Blacklist + confirmação LGPD |
| `campanha-qa-handoff-handler` | Envia pergunta pro responsável da campanha |
| `campanha-qa-relay` | Captura quote do responsável, IA reformula, envia pro médico |
| `lead-perfil-extrator` | GPT-4o-mini extrai perfil da timeline, UPSERT banco_interesse_leads |

---

## 6. Schema essencial

### Tabelas centrais
- `leads` (157k+) — identidade + phone_e164 + arrays whatsapp_phones/emails + campos LGPD (opt_out, classificacao, cooldown_ate, consent_*)
- `campanhas` — config da campanha + briefing_ia (JSONB) + cadencia_template_id + cadencia_ativa
- `campanha_leads` — pipeline por lead por campanha (status, historico_conversa JSONB, proximo_touch_em, proximo_passo_id, aguarda_resposta_humana, humano_assumiu)
- `lead_contatos` (287k+) — 1:N com leads (tipo/valor/is_primary/ativo/origem)
- `banco_interesse_leads` — perfil IA extraído (modalidade, valor_min, UFs/cidades, observacoes_ia, confianca_score)
- `lead_historico` — touchpoints (tipo_evento enum, metadados JSONB, criado_em)
- `sigzap_messages` — chats manuais (usa from_me, conversation_id)
- `campanha_msg_queue` — fila debounce 10s do bridge
- `campanha_lead_touches` — histórico de cada touch de cadência
- `campanha_perguntas_pendentes` — Q&A handoff (alerta_msg_id, respondida, relayed)
- `cadencia_templates` + `cadencia_passos` — config de cadência (editável)
- `blacklist` (38) — opt-outs + triggers retroativos
- `chips` — WhatsApp instances (tipo_instancia='disparos' ou 'trafego_pago')

### Views
- `vw_lead_timeline` — UNION lead_historico + campanha_leads.historico_conversa + sigzap_messages
- `vw_campanha_metricas` — agregado por campanha
- `vw_leads_quentes_esperando` — alertas >1h
- `vw_chip_performance_7d` — erros/disparos por chip

### Funções SQL críticas
- `selecionar_leads_campanha(campanha_id, limite)` — RPC que FILTRA blacklist+opt_out+classificacao+cooldown
- `atualizar_status_lead_campanha(campanha_id, lead_id, novo_status, canal)`
- `find_lead_by_phone_fuzzy(phone)` — busca por last 8 digits
- `vincular_contato_novo(lead_id, phone, instance)`
- Triggers: `trg_blacklist_retroativo`, `trg_leads_lgpd_log`

---

## 7. N8N workflows ativos (VPS)

- `campanha_webhook_bridge_01` — recebe webhook Evolution, debounce 10s, chama IA responder/opt-out/qa-relay
- `6ba692c7395b4f009a58` — Campanha Cron Disparo (legado, considerar aposentar — pg_cron ta mais confiável)
- `3e7e3c8a1774417eb898` — Campanha IA Routing (backup)
- `XVh8buLJvsf7txk2` — SIGMA-EVO (do Ewerton, escopo dele)

**IMPORTANTE:** em N8N 2.11 + Docker Swarm, NUNCA usar `docker restart`. Sempre:
```
docker service update --force disparador_n8n
```

Depois de import via CLI, precisa também: `n8n update:workflow --id=X --active=true` + service update.

---

## 8. Decisões do Raul (não volte sem autorização)

1. ✅ Blacklist no selector (não no disparo)
2. ✅ pg_cron > N8N pra cadência diária
3. ✅ Resend pra email
4. ✅ IA não passa valores (frase padrão direciona responsável)
5. ✅ Régua frio/morno/quente (handoff só em quente)
6. ✅ Q&A humano via quote nativo do WhatsApp
7. ✅ Responsável ≠ Ester hardcoded (vem do briefing.handoff_*)
8. ⛔ Re-engajamento descartado (campanha tem fim)
9. ⛔ Aprovação Maicon/jurídico adiada (escopo indefinido)
10. ⛔ Tela única (revisar Ewerton) descartada (baixa prioridade)

---

## 9. Decisões pendentes da Ramone (esperando feedback)

Doc pra ela: `plan/scripts-teste-ia-ramone.md`. Ela precisa responder 3 perguntas (ao final do doc):

1. IA pode dar faixa de valor? (Raul decidiu que NÃO — frase padrão direciona responsável — mas se ela disser o contrário, ajusta)
2. Régua frio/morno/quente faz sentido? (Raul aprovou — confirmação dela só pra validar)
3. Q&A humano — começar simples ou avançada? (já implementamos avançada — confirmação dela só pra validar)

Quando ela responder → ajustes finos no prompt v8 (max 1-2h de trabalho).

---

## 10. Campanha de teste ATIVA (23/04)

ID: `32c058ad-d26a-46a7-9889-6819700eeb90`
Nome: "TESTE - Pediatria Chapecó (Raul, Maikon, Ramone)"
Status: ativa, cadência GSS Básico, handoff pro Raul (+555484351512)

3 leads em `contatado`:
- Dr. Teste Raul (id e814747c-a1ff-446a-b484-a90a29dfb9d2) phone +555484351512
- Dr. Maikon Madeira (id 0f6bd940-48e9-4178-b48b-87954078b9e4) phone +554792153480
- Ramone Matos (id f4aaac06-d69d-4f38-ac78-7a093d411820) phone +554796175923

Chip: "teste raul" (instance "teste raul", número 5195401928)

**Pra testar:** enviar qualquer msg desses 3 números pro chip → IA v8 responde consumindo perfil + timeline + régua + anti-handoff-cedo.

---

## 11. Se o Raul pedir pra "continuar o que estava"

Trilhas completas (não precisa mexer):
- ✅ A — Fundação (LGPD + blacklist + classificações + UI badges)
- ✅ B — Perfil Unificado (contatos + timeline + extrator + IA consome + UI Perfil IA)
- ✅ C — Cadência (schema + cron + email + UI toggle + disparo agenda T2)
- ✅ D — Urgência + IA refinada parcial (prompt v8 + Q&A handoff completo)

Próximos naturais (se ele perguntar):
1. **Soft launch** = a própria campanha TESTE Pediatria UTI Chapecó (intensivista pediátrico) já em uso. Não criar campanha nova "Braço do Norte" — esse nome era só um exemplo en passant da reunião 20/04, eu (assistente) turbinei pra "decisão"
2. **War room dashboard** (modo urgente, faltou)
3. **Fallback chip IA** (se chip cai, tenta outro)
4. **Healthcheck chip via pg_cron** (marca offline automaticamente)
5. **Telemetria naturalidade** (botão "essa msg ficou robô?")
6. **Filtro retroativo Bloco 3** (buscar "quem quer trabalhar em SP?")
7. **Tag insights Kanban Bloco 3**
8. **Dashboard BI Bloco 4** (usando views já prontas)

---

## 12. Problemas conhecidos + workarounds

| Problema | Workaround |
|---|---|
| Domínio Resend GSS não verificado | Sandbox `onboarding@resend.dev` funcionando; Raul configura depois |
| Ewerton pode ressurgir com demandas | Raul lida direto; não alinhar antecipadamente |
| N8N CLI import desativa workflow | Sempre `n8n update:workflow --active=true` + `docker service update --force` |
| encoding UTF-8 via terminal Windows | Usar `--data-binary @file.json` com arquivo UTF-8; via fetch do edge é ok |
| IA não pega o "x-api-key" de função custom do Ewerton | Função dele tem auth custom; não é nosso problema |

---

## 13. Como o Raul trabalha

Salvo na memória (feedback):
- **Nunca** Claude Code como co-author em commits
- **Sempre** usar git identity `raul.sxs27@gmail.com`
- **Nunca** PRs (push direto pra main, Lovable auto-deploy)
- **Sempre** `git pull origin main` antes de qualquer commit
- **Safety-first:** nunca editar sem ler, sempre mostrar diff e aguardar aprovação (exceto em auto-mode)
- **Linguagem:** PT-BR, direto, sem formalidade
- **Escopo Ewerton:** redirecionar pro plano aprovado, sem over-engineering

---

## 14. Comandos úteis

```bash
# Executar SQL no Supabase (substitua TOKEN pelo current de reference_supabase_token.md)
TOKEN="$SBP_TOKEN_FROM_BITWARDEN"
curl -s -X POST "https://api.supabase.com/v1/projects/zupsbgtoeoixfokzkjro/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary "@/path/to/query.json"

# Deploy edge function
cd C:/Users/rauls/sigma-new && SUPABASE_ACCESS_TOKEN=$TOKEN \
  npx supabase functions deploy NOME_FUNCAO --project-ref zupsbgtoeoixfokzkjro

# Import workflow N8N (via SSH)
scp arquivo.json root@147.93.71.48:/tmp/
ssh root@147.93.71.48 "C=\$(docker ps -q -f name=disparador_n8n | head -1); \
  docker cp /tmp/arquivo.json \$C:/tmp/arquivo.json && \
  docker exec \$C sh -c 'n8n import:workflow --input=/tmp/arquivo.json'"
ssh root@147.93.71.48 "docker service update --force disparador_n8n"

# Ler Easypanel logs
ssh root@147.93.71.48 "docker logs --tail 50 \$(docker ps -q -f name=disparador_n8n | head -1)"

# Healthcheck manual (não precisa do sbp_ token, usa JWT service_role)
JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cHNiZ3RvZW9peGZva3pranJvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE1NDA4MSwiZXhwIjoyMDkwNzMwMDgxfQ.DyapBTSccnh-0I7am5EP-VsqguKmr0VP95FeGjbXitI"
curl -X POST "https://zupsbgtoeoixfokzkjro.functions.supabase.co/bridge-healthcheck" \
  -H "Authorization: Bearer $JWT" --max-time 30

# Ver status atual do bridge
curl -X POST "https://api.supabase.com/v1/projects/zupsbgtoeoixfokzkjro/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT campo_nome, valor FROM config_lista_items WHERE campo_nome LIKE '"'"'bridge_health%'"'"';"}'

# Listar pg_cron jobs ativos
curl -X POST "https://api.supabase.com/v1/projects/zupsbgtoeoixfokzkjro/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;"}'
```

---

## 15. Últimas coisas que fiz (atualizado 24/04)

1. Criei 4 docs de encerramento: resumo sessão, melhorias, status projeto, este handover
2. Campanha TESTE nova com 3 leads (Raul, Maikon, Ramone) disparados em 23/04 12h UTC
3. UI A.7 e B.6 integradas no AgesLeadProntuarioDialog (badges LGPD + aba Perfil IA)
4. Q&A handoff humano completo end-to-end (schema + 2 edges + bridge quote detection)
5. Prompt IA v8 deployado (régua + frase valor + antes_de_handoff checklist)
6. **24/04:** Identificada perda de mensagens — webhook bridge desregistrado em evento interno do N8N
7. **24/04:** Edge `bridge-healthcheck` + pg_cron 5min com alerta WhatsApp (idempotente em mudança)
8. **24/04:** Reset Ramone+Maikon pra `frio` + pg_cron `disparo-teste-amanha-7h-brt` (one-shot 24/04 10h UTC)
9. **24/04:** Bloco 2 marcado como **100% técnico** (validação real começa 24/04 7h BRT)
10. **24/04 noite (validação produção):** ✅ pg_cron disparou, **3 leads conversaram**:
    - Ramone Matos: **QUENTE** (22 msgs)
    - Dr. Maikon Madeira: **QUENTE** (10 msgs)
    - Dr. Teste Raul: em_conversa (7 msgs)
    - Bridge healthcheck: `ok` (último check 21:50 BRT)
    - Q&A handoff: 0 perguntas pendentes (IA respondeu tudo com briefing)
    - Touches automáticos: 3 (T1 disparo executado pra cada lead)
    - **Sem alertas no WhatsApp do Raul** = bridge ficou estável o dia todo

**Próxima sessão provavelmente:** Raul virá com:
- Feedback do disparo das 7h BRT (Ramone/Maikon receberam, respondendo)
- Decisões da Ramone sobre os 3 scripts
- Resultados do healthcheck (se cairam alertas)
- Possível soft launch real (a própria campanha TESTE Pediatria UTI Chapecó é a vaga real)

## 15.1 Diagnóstico do "webhook unregistered" (problema recorrente)

**Sintomas:**
- N8N retorna `404` ou erro de conexão pra webhook de produção
- Logs mostram: `Received request for unknown webhook: The requested webhook "POST X" is not registered`
- Mensagens da Evolution caem no buraco

**Causas conhecidas:**
- Upgrade automático do N8N (Easypanel atualiza versão) → desregistra workflows
- Eventos internos do N8N (memory pressure, reset implícito)
- `docker restart` em Swarm (desincroniza orquestração) → workflow vira 0/1

**Diagnóstico rápido:**
```bash
# Container vivo?
ssh root@147.93.71.48 "docker ps --filter name=disparador_n8n"

# Webhook responde?
curl -o /dev/null -w "%{http_code}\n" -X POST \
  https://disparador-n8n.r0pfyf.easypanel.host/webhook/campanha-webhook-bridge \
  -H "Content-Type: application/json" -d '{"ping":1}'

# Logs recentes
ssh root@147.93.71.48 "docker logs --since 1h \$(docker ps -q -f name=disparador_n8n | head -1) 2>&1 | grep -iE 'unknown webhook|active version|activated workflow'"
```

**Recovery:**
1. Re-import workflow via CLI (`n8n import:workflow --input=...`)
2. Re-ativar (`n8n update:workflow --id=X --active=true`)
3. **Sempre** `docker service update --force disparador_n8n` (NÃO `docker restart`!)
4. Validar via curl ping no webhook

**Mitigação ativa:**
- Healthcheck pg_cron 5min envia WhatsApp pro Raul (+555484351512) em mudança de status
- Sem spam: só alerta quando muda (down ou up)

---

## 16. Regras de ouro da próxima sessão

1. **NÃO re-implementar** o que já está feito. Ler status primeiro.
2. **NÃO criar "Claude Code" como co-author** em commits.
3. **Sempre `git pull` antes** de qualquer commit.
4. **Safety-first**: mostrar diff antes de aplicar (exceto em auto-mode explícito).
5. **Decisões do Raul em seção 8**: não reverter sem confirmar.
6. **`docker restart` é proibido** em Swarm. Usar `docker service update --force`.
7. **Memória é verdade por momento** — verificar estado atual no banco antes de agir.
8. **Se for lead crítico** (Ramone, Maikon, Raul, Bruna) mencionado por nome: tratar com prioridade.

Boa sessão. 🚀
