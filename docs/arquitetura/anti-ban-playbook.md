# Anti-Ban Playbook — WhatsApp prospecção (Sigma GSS)

Plano completo de proteção anti-bloqueio usado no Sigma, pronto pra portar pra outro CRM. Parâmetros reais (extraídos do código/banco em 16/06/2026).

## Filosofia
Duas regras: **(1) imitar humano** em ritmo, horário e conteúdo; **(2) nunca confiar no provider** — todo envio passa por um gate central que pode negar/atrasar. Defesa em camadas: infra → aquecimento → ritmo → saúde → higiene de lista → conteúdo → recuperação.

---

## 1. Infraestrutura
- **API oficial** via servidor gerenciado: Evolution (self-host) **ou uazapi** (proxy nativo, mais estável — recomendado).
- **1 chip = 1 número + 1 proxy residencial/ISP BR fixo** (no Sigma: Bright Data ISP BR). Proxy fixo por instância; fixar também o env global de proxy (instância nova herda).
- **Estado do chip sempre fresco**: webhook de conexão + cron de sync a cada 5 min. **Só dispara chip com `connection_state='open'`**.
- uazapi: provider gerencia reconexão; só sincroniza estado. Evolution: precisa restart no reconnect.

## 2. Aquecimento (antes de prospectar) — `aquecedor-tick` (cron 2 min)
Chip novo entra na fase **`aquecimento`**: NÃO dispara cold, só gera **eventos orgânicos** (conversas entre os próprios chips do pool).
- Parceiro sorteado por **power-law**; mensagem gerada por **IA com persona**; horário humano (acorda 7h / dorme 23h; dead-zone com 2% de chance; fim de semana fator 0.5).
- **Curva de limite diário** (`warmup_curve`), dia a dia: **10 → 20 → 35 → 50 → 60 → 70 → 80**; do 8º dia em diante, liberado.
- **Graduação automática** (`chip-aquecimento-graduator`, hourly): `aquecimento → pronto → producao`.

## 3. Ritmo de disparo cold (o coração) — `campanha-disparo-processor`
- **35 cold/dia POR CHIP** (`COLD_CAP_DIA=35`), global somando todas as campanhas.
- **1 cold por chip por ciclo** (sem rajada).
- **Espaçamento 15–20 min entre ciclos** (randômico) → ~35/dia ao longo da janela.
- **Janela 07–17h, dias úteis** (configurável por campanha).
- **Rotação de chips**: round_robin / random / single. Fallback: tenta primário; se negar/falhar, tenta o próximo (respeitando 1/ciclo).
- **Lock**: `next_batch_at` evita concorrência; o processor se auto-invoca pra encadear ciclos.

## 4. Gate central de envio — `pre_send_check` (RPC, roda em TODO envio)
Ordem dos guards (primeiro que bate, nega):
1. **Pause ativa** (`chip_state.paused_until`).
2. **Fase válida**: cold/cadência só se chip em `pronto`/`producao`.
3. Chip em `aquecimento` só aceita evento `aquecimento`.
4. **Health crítico** ≥ threshold (99) → auto-pause 2h.
5. **Limite diário de warmup** (curva acima) enquanto nos 7 primeiros dias.
6. **Rate por minuto** (por evento).
7. **Rate por hora** (por evento).
8. **Reply rate crítico** (< threshold, mín. 50 amostras) → pause 6h. *(No GSS o auto-pause por reply foi desligado em 31/05; threshold=0.)*

Se passa: retorna **delay gaussian** a aplicar antes do POST. **Degradação graciosa**: health ≥60 → delay ×2; ≥75 → delay ×5 (segura o ritmo antes de pausar).

### Rate config por tipo de evento (`antiban_rate_config`)
| evento | /min | /hora | delay min–max |
|---|---|---|---|
| cold_disparo | 3 | 15 | 8–20s |
| cadencia | 3 | 15 | 8–20s |
| aquecimento | 5 | 25 | 5–30s |
| resposta_ia | 10 | 30 | 0 |
| handoff | 5 | 25 | 1–4s |
| opt_out / qa_relay | 5 | 25 | 1–4s |
| manual | 20 | 150 | 0 |

Delay gaussian = média(min,max) + ruído (soma de 4 randoms ≈ normal), clampado em [min,max].

## 5. Saúde do chip — `chip_health_score` + `chip_health_event`
- Cada falha/sinal vira evento em `chip_health_event` com `score_delta` (ex: `failed_send` +5, `http_429`, `disconnect`).
- `chip_health_score` soma os eventos recentes → 0 (ok) a 100 (crítico).
- Usado no guard 4 (auto-pause) e na degradação de delay.
- `chip-auto-reconnect` (5 min) + `chip-disconnect-classifier` reconectam/classificam quedas.

## 6. Higiene de lista (no `selecionar_leads_campanha`)
Lead só entra se: sem duplicata (`merged_into_id` null), telefone válido, `opt_out=false`, `classificacao NOT IN (protegido,proibido)`, fora de cooldown, **não na blacklist**, não em bloqueio temporário, não já em outra campanha ativa, não convertido. (LGPD: opt-in + opt-out aplicados.)

## 7. Conteúdo (cada mensagem diferente)
- **Spintax** `{opção a|opção b|opção c}` + template `{{nome}}/{{especialidade}}/{{cidade}}/{{uf}}` → toda msg única. `variation_indices` registra a combinação usada.
- Normalização de telefone BR + remoção de prefixo "Dr(a)".

## 8. Recuperação / monitoramento (crons)
| cron | freq | papel |
|---|---|---|
| `aquecedor-tick` | 2 min | eventos orgânicos de warmup |
| `campanha-batch-watcher` | 1 min | dispara ciclos das campanhas ativas |
| `chip-auto-reconnect` | 5 min | reconecta/sincroniza estado |
| `bridge-healthcheck-v2` | 5 min | saúde da ponte |
| `chip-aquecimento-graduator` | hourly | promove fase do chip |
| `chip-pair-rotator` | daily 3h | rotaciona pares de aquecimento |

---

## Componentes pra portar
- **Tabelas**: `chips`, `chip_state` (fase, warmup_start_date, paused_until, pause_reason), `chip_send_log`, `chip_health_event`, `antiban_rate_config`, `antiban_global_config` (warmup_curve, thresholds), `chip_provider_secrets`, `blacklist`, `leads_bloqueio_temporario`.
- **Funções**: `pre_send_check`, `chip_health_score`, `chip_warmup_limit`, `chip_window_count`, `chip_reply_rate_24h`, `selecionar_leads_campanha`.
- **Edges**: `campanha-disparo-processor`, `aquecedor-tick`, `_shared/evo-sender` (roteia evolution/uazapi por `provedor`), `chip-auto-reconnect`, `chip-aquecimento-graduator`, `uazapi-webhook`, `uazapi-instance-manager`.

## Processo que seguimos (ordem de implementação)
1. API oficial gerenciada + proxy residencial/ISP fixo por chip.
2. Camada de aquecimento: curva de 7 dias + conversas orgânicas via IA/persona.
3. `pre_send_check` como **gate único** de todo envio (rate/delay/health/warmup/reply).
4. Ritmo cold: 35/chip/dia, 1/ciclo, espaçamento 15–20 min, janela 07–17h úteis.
5. Health scoring + auto-pause + degradação graciosa de delay.
6. Higiene de lista na seleção (blacklist/opt-out/dedup/cooldown/LGPD).
7. Spintax + template por lead.
8. Monitoramento e recuperação por crons.
9. Migração Evolution → uazapi (proxy nativo) pra estabilidade dos chips.

> Tudo é **configurável em tabela** (`antiban_rate_config`, `antiban_global_config`) — dá pra afrouxar/apertar sem deploy. Comece conservador e só afrouxe com reply rate saudável.
