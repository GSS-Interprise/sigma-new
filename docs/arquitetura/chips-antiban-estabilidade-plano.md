# Plano de melhorias — Chips, Anti-ban e Estabilidade

Consolidação da investigação (19/06/2026) + decisões do Raul. Objetivo: sistema **estável**, **operacional** (sem bloqueios que travam chip bom) e com **capacidade de mapear** quedas — mantendo o anti-ban que funciona.

## Diagnóstico (estado real hoje)
- **17 chips ativos** → só **3 usáveis** pra disparo (open + sem bloqueio). ~18%.
- **needs_qr: 3.722 eventos/24h** → maioria dos chips com **sessão WhatsApp morta** (não só flapando), e ninguém re-escaneia o QR.
- **`chip_auto_reconnect_log`: 46.949 linhas, +24k/semana** — o reconnect grava `needs_qr` **toda rodada (5min) pra cada chip morto** = bloat de escrita.
- **uazapi: 0 chips** — solução de estabilidade pronta no código, não adotada.
- Bug warmup: chip `pronto` sem `warmup_start_date` → limite 0 → chip maduro travado (corrigidos 4 manualmente em 19/06).

## Decisões (Raul)
- **Anti-ban core fica HARDCODED** (não vira config de UI): **35 cold/dia por chip**, **1 por ciclo**, **espaçamento aleatório em minutos** (15–20min) pra não parecer robô. Mantém como está.
- **Warmup curve + limite-0: remover o que for anti-operacional.** Chip conectado e graduado deve disparar, respeitando só o 35/dia + ritmo. Sem curva diária travando.

---

## Melhorias (priorizadas)

### 1. Remover a curva de warmup (anti-operacional)  🔴 alta
- **O quê:** tirar o guard `warmup_daily_limit` do `pre_send_check` e a função `chip_warmup_limit`. Some o limite-0 e a curva 10→80.
- **Mantém:** 35/dia (no `campanha-disparo-processor`), 1/ciclo, espaçamento 15–20min, rate por minuto/hora, health auto-pause. O anti-ban por ritmo continua.
- **Aquecimento organico** (`aquecedor-tick`) pode continuar pra chip `novo` (conversas entre chips), mas **não bloqueia mais o cold** de chip graduado.
- **Onde:** RPC `pre_send_check`, função `chip_warmup_limit`. Migration + deploy.
- **Impacto:** acaba o "chip pronto travado em limite 0". Chip conectado dispara.

### 2. Parar o bloat do log de QR  🔴 alta (performance)
- **O quê:** o `chip-auto-reconnect` só deve logar `needs_qr` **na transição** (quando o chip VIRA close), não toda rodada. Dedupe: se já está close e já logou, não loga de novo.
- **Retenção:** limpar `chip_auto_reconnect_log` antigo (> 30 dias) num cron.
- **Onde:** edge `chip-auto-reconnect` + cron de limpeza.
- **Impacto:** corta ~95% das escritas (3.7k/dia → dezenas). Banco mais leve.

### 3. Alerta de "chip precisa de QR"  🔴 alta (operacional)
- **O quê:** quando um chip vira `needs_qr`, **avisar** (grupo/notificação) pra alguém re-escanear. Hoje cai e fica caído sem ninguém saber.
- **Onde:** no `chip-auto-reconnect` (na transição), dispara aviso. Reusa o report do grupo.
- **Impacto:** ataca a causa de 14/17 mortos — sessão morta sem re-pareamento.

### 4. Painel de capacidade / saúde dos chips  🟡 média (mapear quedas)
- **O quê:** uma tela (ou aba no BI/Disparos) mostrando por chip: estado real, há quanto tempo open, quedas nas últimas 24h, needs_qr desde quando, usável sim/não. Resumo no topo: "X de Y chips disparando agora".
- **Fonte:** view nova sobre `chips` + `chip_auto_reconnect_log` (agora enxuto) + `chip_health_event`.
- **Impacto:** Raul/Bruna enxergam a capacidade real e qual chip precisa de ação. É o "mapear" que o Raul pediu.

### 5. Migração uazapi (estabilidade de verdade)  🟡 média/alta
- **O quê:** adotar uazapi (proxy nativo, gerencia reconexão) pros chips de disparo. Fluxo já existe (Nova Instância → provider uazapi). Migrar aos poucos, medir queda vs Evolution.
- **Impacto:** ataca a raiz do flapping/sessão-morta (Evolution+Baileys+proxy residencial). É o caminho pro sistema parar de cair tanto.

### 6. Drift DB × Evolution no envio  🟢 baixa
- **O quê:** o `connection_state` em cache mente no instante do envio ("Connection Closed"). O envio já tem retry; avaliar checar estado live antes de marcar erro, ou confiar no retry + fallback de chip (já implementado no envio manual).
- **Impacto:** menos "falha fantasma".

---

## Ordem de execução
1. **#1 + #2** juntos (migration pre_send_check/warmup + edge reconnect dedupe) — destrava chip + tira o bloat. Deploy.
2. **#3** alerta de QR — operacional imediato.
3. **#4** painel de capacidade.
4. **#5** uazapi (contínuo, mede e migra).
5. **#6** ajuste fino do envio.

## O que NÃO muda
- 35/dia, 1/ciclo, espaçamento aleatório em minutos, rate min/hora, health auto-pause: **hardcoded, intactos**. Anti-ban por ritmo preservado.
