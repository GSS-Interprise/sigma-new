# Chips de Disparo — Runtime, Arquitetura e Runbook

> **O que este doc cobre:** tudo que faz os chips de WhatsApp (IA + manuais) **conectarem e
> dispararem de verdade** no Sigma — infra Evolution, proxy, classificação de chips,
> roteamento de webhooks, pipeline de envio anti-ban, e o runbook de troubleshooting.
>
> **Última atualização:** 2026-06-01 (sessão de correção do proxy + bug de opt-out).
> **Leia junto:** `[[Sigma-Anti-Ban-Arquitetura]]` (Vault), `.claude/handover-proxima-sessao.md`.

---

## 0. TL;DR — o caminho feliz

1. Cada chip é uma **instância no Evolution** (VPS Hostinger, Easypanel).
2. Pra conectar/disparar, a instância precisa de um **proxy residencial BR funcional**
   (hoje **Bright Data ISP**). Sem proxy bom, o Baileys **não gera QR** e **não envia**.
3. Todo envio passa por **`_shared/evo-sender.ts`** → `pre_send_check` (anti-ban) → Evolution.
4. Mensagens **recebidas** são roteadas por **webhook** que depende do **tipo do chip**:
   - `categoria_uso = 'prospeccao_ia'` → `campanha-webhook-bridge` (automação IA + opt-out).
   - `categoria_uso = 'manual'` → `ec4f93d0…` (só captura inbound, **sem automação**).
5. Features automáticas (IA responder, opt-out LGPD) **só podem rodar em chip de IA**.
   Chip manual com automação = operadora humana levando resposta automática no meio da conversa.

---

## 1. Infraestrutura

| Item | Valor |
|---|---|
| VPS | Hostinger `147.93.71.48` (root) — senha no Bitwarden `VPS - Hostinger - SSH root` |
| Orquestrador | Easypanel (`disparador-evolution-api.r0pfyf.easypanel.host`) |
| Evolution API | `evoapicloud/evolution-api:v2.3.7` (container `disparador_evolution-api.1.*`) |
| Banco Evolution | `postgres:17` + `redis:7` (sessões Baileys) |
| Supabase (projeto) | ref `zupsbgtoeoixfokzkjro` |
| N8N | `disparador-n8n.r0pfyf.easypanel.host` (webhook bridge + handlers) |

**Acesso SSH** (Windows sem `sshpass`): usar `paramiko` (Python). Exemplo no §9.

**Config Evolution no banco** (`config_lista_items`): `evolution_api_url`, `evolution_api_key`.
Toda edge lê dali via `getEvoConfig()`.

> ⚠️ **Bug semântico Evolution v2.3.7:** `/instance/fetchInstances` retorna `connectionStatus`
> **cacheado** (mente `open`), enquanto `/instance/connectionState/{inst}` retorna o estado
> **real**. Sempre confie no `connectionState`. (Avaliar upgrade pra v2.4+.)

---

## 2. Proxy — o que faz os chips conectarem

**Por que existe:** WhatsApp bane IP de datacenter rodando muitos números. Cada chip sai por
um **IP residencial BR** pra parecer humano. **Se o proxy falha, NADA conecta nem envia**
(o Baileys nem chega a gerar o QR → `/instance/connect` devolve `{count:0}`, instância fica
travada em `connecting`).

### Provider atual: Bright Data ISP (static residential BR)

| Campo | Valor |
|---|---|
| Provider | Bright Data ISP Compartilhado (`res_static`) |
| Endpoint | `brd.superproxy.io:33335` (protocol `http`) |
| Customer | `hl_10d829af` |
| Zone | `isp_proxy1` (~20 IPs BR, escala pra 50) |
| Username (sticky por chip) | `brd-customer-hl_10d829af-zone-isp_proxy1-session-{chip}` |
| Senha da zone | via **Bright Data API** (token) ou Bitwarden `Bright Data — ISP BR (GSS)` / Supabase Secret `BRIGHT_DATA_PROXY_PASSWORD` |
| Custo | ~$32/mo (20 IPs) |
| Pagamento | CNPJ GSS (Ewerton contratou) |

**Sticky session = anti-ban correto:** `-session-{id}` fixa o mesmo IP por chip. Sessions
diferentes = IPs diferentes. Cada chip deve ter sua própria session estável.

**Pegar a senha da zone via API** (não precisa de Bitwarden):
```powershell
$tok = '<BRIGHT_DATA_API_TOKEN>'
(Invoke-RestMethod -Uri 'https://api.brightdata.com/zone/passwords?zone=isp_proxy1' `
  -Headers @{ Authorization = "Bearer $tok" }).passwords[0]
```

**Checar status da conta Bright Data** (suspensão = billing):
```powershell
Invoke-RestMethod -Uri 'https://api.brightdata.com/status' -Headers @{ Authorization = "Bearer $tok" }
# status:'active' + proxy test 200 = ok ; 'suspended' = fatura/pagamento pendente (resolver no painel)
```

**Aplicar proxy numa instância** (Evolution API):
```
POST {evoUrl}/proxy/set/{instanceName}
{ "enabled": true, "host": "brd.superproxy.io", "port": "33335", "protocol": "http",
  "username": "brd-customer-hl_10d829af-zone-isp_proxy1-session-{chip}", "password": "{zonePwd}" }
```
Depois **`POST /instance/restart/{instanceName}`** pra o socket pegar o proxy novo.

> Existe a edge **`chip-apply-proxy-bulk`** pra aplicar em massa, e o **`chip-bootstrap`**
> aplica automaticamente em chip novo. O rollout manual (§10) é o fallback quando precisa
> agir fora desse fluxo.

### Histórico de providers
- **Webshare** (US/EU) — não tem BR; ficou como proxy global e **quebrou** (auth 407) em
  ~31/05, derrubando todas as instâncias. **Cancelar** (custa ~$28.95/mo à toa).
- **Bright Data ISP BR** — provider definitivo desde 05/05/2026.

---

## 3. Classificação de chips (`chips` table)

Colunas-chave: `instance_name`, `numero`, `categoria_uso`, `tipo_instancia`, `pode_disparar`,
`status`, `connection_state`, `webhook_url` (⚠️ **mirror não confiável** — veja §4), `proxy_config`.

| `categoria_uso` | O que é | Automação IA/opt-out? |
|---|---|---|
| `prospeccao_ia` | Chips de prospecção automatizada (prospec-raul-90XX) | ✅ **SIM** |
| `manual` | Celulares de operadoras (Antônia, Bruna, Letícia, Amanda, Ester…) | ❌ **NÃO** |
| `inbound` | Recepção (Trafego Pago) | ❌ Não dispara cold |

**Estado atual (2026-06-01):**
- `prospeccao_ia`: 14 ativos, 1 inativo
- `manual`: 22 ativos, 22 inativos
- `inbound`: 1 ativo

> **Regra de ouro:** automação (IA responder, opt-out LGPD) **só** em `categoria_uso='prospeccao_ia'`.
> Chip manual = humano conversando. Filtro de exemplo em `chip-healthcheck` (`.eq("categoria_uso","prospeccao_ia")`).

---

## 4. Roteamento de webhooks (inbound) — o gotcha crítico

Quando um contato responde, o Evolution dispara um webhook **por instância**. Qual URL define
se a mensagem entra na automação ou só vira histórico:

| Webhook (N8N) | Pra quem | O que faz |
|---|---|---|
| `…/webhook/campanha-webhook-bridge` | **chips IA** | Parse → detecta opt-out/Q&A → enfileira → **IA responder** |
| `…/webhook/ec4f93d0-9b33-49f0-b810-69cf2587e5ab` | **chips manuais** | Só captura inbound (Sigzap), **sem automação** |
| `…/webhook/3a9459e1-…` | legado/alguns manuais | (inbound) |

> ⚠️ **`chips.webhook_url` (banco) está DESSINCRONIZADO da realidade.** A verdade é o que está
> **no Evolution** (`GET /webhook/find/{instance}`). Sempre confira no Evolution, não no banco.

**Incidente 01/06:** 10 chips **manuais** estavam apontados pro `campanha-webhook-bridge` →
recebiam automação de IA/opt-out → operadora levava "não vou mais te chamar" no meio de
conversas reais. Corrigido re-apontando pro `ec4f93d0` (§11).

---

## 5. Pipeline de ENVIO — `_shared/evo-sender.ts`

**Single point of send:** toda chamada `/message/*` do Evolution passa por
`sendWhatsAppText()` / `sendWhatsAppMedia()`. Fluxo interno:

1. **`pre_send_check`** (RPC Postgres) — warm-up curve + rate limit + health + reply rate.
   Retorna `{ allow, reason, delay_ms, retry_in_ms }`.
2. **Delay gaussiano** (`delay_ms`) antes de enviar (anti-padrão de bot).
3. **POST Evolution** com **retry exponencial** pra códigos transitórios (429/500/502/503/504),
   backoff até 8s, 3 tentativas default.
4. **Log** em `chip_send_log` (sent/rate_limited/failed) e `chip_health_event` quando há erro.

**Score de health por erro HTTP** (gravado em `chip_health_event.score_delta`):
| Código | Tipo | score_delta |
|---|---|---|
| 401 | `disconnect_401` | +60 |
| 403 | `http_403` | +40 |
| 463 | `463_timelock` | +35 |
| 429 | `http_429` | +25 |
| rede/outros | `failed_send` | +5 |

`eventoOrigem` (bucket anti-ban): `aquecimento`, `cold_disparo`, `cadencia`, `resposta_ia`,
`manual`, `qa_relay`, `opt_out`, `handoff`, `healthcheck`.

---

## 6. Edge functions (mapa do domínio de disparo)

| Função | Papel |
|---|---|
| `campanha-disparo-processor` | Motor cold: spintax, rotação de chip, retry/fallback, agenda T2 |
| `campanha-cadencia-processor` | Executa touches pendentes da cadência (templates por campanha) |
| `campanha-ia-responder` | IA conversacional (perfil unificado, régua frio/morno/quente, Q&A) |
| `campanha-opt-out-handler` | Blacklist LGPD + confirmação (⚠️ ver §7 — só IA) |
| `campanha-qa-handoff-handler` / `campanha-qa-relay` | Q&A pro responsável da campanha |
| `campanha-email-sender` | Resend com footer LGPD |
| `lead-perfil-extrator` | Extrai perfil da timeline (GPT-4o-mini) |
| `_shared/evo-sender.ts` | **Único caminho de envio** (§5) |
| `evolution-api-proxy` | Proxy das chamadas do front pro Evolution (connect, QR, webhook, proxy…) |
| `chip-bootstrap` | Setup de chip novo: aplica proxy + webhook + settings |
| `chip-apply-proxy-bulk` | Aplica proxy em massa |
| `chip-healthcheck` / `chip-disconnect-classifier` | Monitor de saúde / classifica desconexão |
| `aquecedor-tick` | Aquecimento de chip novo |
| `bridge-healthcheck` / `bridge-healthcheck-v2` | Saúde do bridge N8N |
| `receive-whatsapp-events` / `receber_mensagem_whatsapp` | Handlers de inbound |
| `send-disparo-manual` / `send-sigzap-message` | Envio manual (UI Sigzap) |

---

## 7. Feature de Opt-out / LGPD — escopo correto

**O que faz:** quando um lead de campanha IA pede pra sair, o `campanha-opt-out-handler`:
1. Insere na `blacklist` (trigger marca `leads.opt_out=true` e pausa campanhas);
2. Envia **uma** confirmação: *"ok, entendido. Não vou mais te chamar por aqui…"*.

**Regra:** **SÓ pode rodar em `categoria_uso='prospeccao_ia'`.** Em chip manual, é a operadora
conversando — automação não deve tocar.

**Garantias hoje:**
- **Roteamento (já feito):** chips manuais não apontam mais pro bridge → não acionam o handler.
- **Código (pendente, ver §12):** falta guard `categoria_uso='prospeccao_ia'` no handler/ia-responder
  + **idempotência** (hoje re-envia mesmo se já está na blacklist).

**Detector de opt-out (N8N, `campanha-webhook-bridge` → campo `is_opt_out`):** está **agressivo
demais** — classificou agenda de médico, menu automático e negociação como "quero sair".
Precisa revisão (§12).

---

## 8. Anti-ban — config runtime (`antiban_global_config`)

Estado atual (2026-06-01):
| Campo | Valor | Nota |
|---|---|---|
| `health_pause_threshold` | **99** | Raul subiu de 95→99 em 31/05 (≈ desativa pause por health) |
| `health_pause_hours` | 2 | |
| `reply_rate_threshold` | **0** | Raul zerou em 31/05 (desativa pause por reply rate) |
| `reply_rate_min_samples` | 50 | |
| `reply_rate_pause_hours` | 6 | |
| `warmup_curve` | `[10,20,35,50,60,70,80]` | msgs/dia por dia de aquecimento |

**Crons pausados em 31/05** (decisão de remover o conceito "suspeito" — ver
`[[22-Remover-Conceito-Suspeito-Chips]]`):
- jobid **9** `chip-healthcheck-5min` → schedule `0 0 31 2 *` (nunca)
- jobid **15** `chip-health-monitor-1min` → schedule `0 0 31 2 *` (nunca)

> Esses crons usavam `sendPresence` que dava falso-negativo e marcava chip OPEN como suspeito.
> Reescrever usando `connectionState` real, ou manter desligado (equipe gerencia manualmente).

---

## 9. Acesso operacional (snippets)

> **Segredos:** nunca commitar JWT/senha/token. Service_role JWT e token Bright Data ficam no
> Bitwarden / arquivo de memória local. Abaixo, `$jwt` e `$tok` assumidos já carregados.

**Ler config Evolution + checar estado REAL de um chip:**
```powershell
$base = "https://zupsbgtoeoixfokzkjro.supabase.co/rest/v1"
$cfg = Invoke-RestMethod -Uri "$base/config_lista_items?select=campo_nome,valor&campo_nome=in.(evolution_api_url,evolution_api_key)" -Headers @{ apikey=$jwt; Authorization="Bearer $jwt" }
$url = ($cfg | ? campo_nome -eq 'evolution_api_url').valor.TrimEnd('/')
$key = ($cfg | ? campo_nome -eq 'evolution_api_key').valor
Invoke-RestMethod -Uri "$url/instance/connectionState/$([uri]::EscapeDataString('prospec-raul-9002'))" -Headers @{ apikey=$key }
```

**SSH na VPS via paramiko (Windows):**
```python
import paramiko
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("147.93.71.48", username="root", password="<senha Bitwarden>", timeout=30)
i,o,e = c.exec_command("docker logs --tail 250 $(docker ps --format '{{.Names}}' | grep evolution-api | head -1) 2>&1 | tail -250")
print(o.read().decode())
```

---

## 10. Runbook — troubleshooting

| Sintoma | Causa provável | Diagnóstico / Solução |
|---|---|---|
| QR não aparece / "não foi possível gerar" pra **todos** os chips | Proxy global quebrado (auth 407) → Baileys não conecta → `/connect` = `{count:0}` | Teste o proxy de dentro do container (`curl -x ... https://web.whatsapp.com`). Se 407: proxy suspenso/expirado → trocar/renovar. Direto dá 200 = rede ok. |
| QR não aparece só pra **1 chip** | Sessão Baileys travada / creds velhas | `/instance/restart/{inst}`; se persistir, `/instance/logout/{inst}` + reescanear QR. |
| Chip diz `open` mas não envia (`evolution_500`) | `fetchInstances` mente (cache); estado real é `connecting` | Conferir `connectionState`; reiniciar; validar proxy. |
| Conta Bright Data `suspended` | Billing (fatura/pagamento) | `api.brightdata.com/status`; resolver no painel `brightdata.com.br/cp` (login Ewerton/CNPJ GSS). |
| QR demora ~15-20s pra aparecer após restart | Latência normal do proxy residencial no init do Baileys | Esperar; clicar "Gerar novo QR Code" na UI. |
| Chip da operadora "manda mensagem sozinho" | Chip **manual** apontado pro `campanha-webhook-bridge` (automação) | Conferir webhook real (`/webhook/find`); re-apontar pro `ec4f93d0` (§11). |
| Lead/médico recebeu "não vou mais te chamar" errado | Detector de opt-out (N8N) falso-positivo | Tirar da `blacklist` + `leads.opt_out=false`; revisar `is_opt_out` no N8N. |
| Envio negado silenciosamente | `pre_send_check` (rate limit/warmup/health) | Olhar `chip_send_log.pre_send_check_result` e `reason`. |

---

## 11. O que fizemos nesta sessão (2026-06-01)

### A. Proxy: webshare quebrado → Bright Data
- **Diagnóstico:** webshare (`p.webshare.io:80`) devolvia **407** globalmente → todas as
  instâncias travadas em `connecting`, QR não gerava (`count:0`), disparos com `evolution_500`.
  Provado com instância nova de teste (também sem QR) + teste de conectividade de dentro do
  container (proxy 407, direto 200).
- **Bright Data estava `suspended`** (billing); Raul regularizou → voltou `active` (teste saiu
  por IP residencial BR no Rio, ASN ML Telecom).
- **Aplicado:** proxy Bright Data **sticky por chip** (`-session-{chip}`) + restart nos **37
  chips ativos** (IA + manual + inbound), via classificação do banco. 0 falhas. QR voltou a
  gerar (validado em chips manual e IA).

### B. Bug do opt-out automático em chip manual
- **Diagnóstico:** 10 chips **manuais** apontados pro `campanha-webhook-bridge` →
  `campanha-opt-out-handler` auto-respondia "não vou mais te chamar" e blacklistava contatos,
  **no meio de conversas humanas**. Detector de opt-out (N8N) com falso-positivo grave.
- **Estancado:** os 10 chips manuais re-apontados do `campanha-webhook-bridge` → `ec4f93d0`
  (webhook manual sem automação). Chips IA seguem no bridge (correto).
- **Revertido:** 5 entradas falsas removidas da `blacklist` (Fabiana, Diego, Patrick,
  Dr. Felipe Orlandi, Matheus Botarelli); `leads.opt_out=false` no Matheus (único flagado por
  match exato de telefone). Mantida 1 entrada legítima (`+554899811289`, reclamação de dados).

---

## 12. Pendências / próximos passos

- [ ] **Deploy do guard** (precisa token SBP Management API novo, o atual expirou): no
  `campanha-opt-out-handler` e `campanha-ia-responder`, **só rodar se `categoria_uso='prospeccao_ia'`**
  + **idempotência** no envio de confirmação (não re-enviar se já blacklistado).
- [ ] **Revisar detector de opt-out no N8N** (`campanha-webhook-bridge` → `is_opt_out`) — está
  classificando agenda/negociação/menu como opt-out.
- [ ] **Env global do Evolution** ainda aponta pro webshare quebrado — trocar pra Bright Data
  como rede de segurança (chip novo sem `chip-bootstrap` cairia no webshare 407 de novo).
- [ ] **Cancelar webshare** no painel (~$28.95/mo à toa).
- [ ] **Normalizar telefone** no opt-out handler (salvou sem o 9º dígito → trigger só pegou 1 lead).
- [ ] **Rescan QR** dos chips IA `close` (9003, 9007, 9009, 9011, 9012).
- [ ] **Avaliar upgrade do Evolution** (v2.3.7 tem o bug de cache `fetchInstances` vs `connectionState`).
- [ ] **Sincronizar `chips.webhook_url`** com a verdade do Evolution (mirror desatualizado).
