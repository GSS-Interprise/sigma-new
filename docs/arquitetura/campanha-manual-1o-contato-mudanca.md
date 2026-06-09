---
tags: [arquitetura, sigma-gss, campanhas, manual, mudanca-rumo]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-09
status: PARCIAL — 1.1 (parar disparo auto) + 1.2 (1º contato manual no card) IMPLEMENTADOS 09/06; 1.3 (UI/métricas) pendente
repo: GSS-Interprise/sigma-new
---

# Mudança de rumo — Campanha MANUAL: 1º contato 100% manual

> **Decisão (Raul, 09/06):** em campanha **manual**, o **primeiro contato NÃO é mais disparo automatizado**. A equipe chama os médicos **manualmente via Evolution**, com **chip diferente** do usado pela IA e **leads diferentes**. Só o 1º disparo muda — o que antes eu tinha entendido como automatizado, agora é manual de verdade.

## ✅ Status de implementação (09/06)
- **1.1 Parar disparo automático das manuais — FEITO** (commit `9b40005`): guard no `campanha-disparo-processor` (return early se `tipo_envio='manual'`) + filtro no cron job 11 (`tipo_envio IS DISTINCT FROM 'manual'`). Validado: 7 campanhas IA seguem disparando; a única manual (Urologista) ficou de fora.
- **1.2 1º contato manual no card do lead — FEITO** (commit `fe59838`, requer publish no Lovable): edge nova `campanha-disparo-manual-1contato` (envia pelo chip da campanha + marca `campanha_leads`: data_primeiro_contato + frio→contatado + chip_usado_id) + caixa "Enviar 1ª mensagem" no `LeadConversaUnificada` quando o lead ainda não tem conversa.
- **1.3 UI/métricas (aba Status / Dashboard / wizard) — PENDENTE** (exibição; não crítico).

## 0. Como é HOJE (o que precisa mudar)
- `campanha-disparo-processor` (cron **job 11**) dispara o 1º contato cold de **TODA campanha `tipo_campanha='prospeccao'` ativa**, **incluindo manual** — o WHERE do cron **não filtra `tipo_envio`**. Ele marca `campanha_leads.data_primeiro_contato` + status `frio→contatado`.
- A única diferença manual×IA hoje é na **resposta**: `receive-whatsapp-messages` checa `tipo_envio` e, se manual, **não** aciona a IA (a operadora responde).
- Existe a edge **`send-disparo-manual`** (operadora envia via SigZap/Evolution, escolhendo o chip): ela cria a conversa SigZap, envia, registra em `disparo_manual_envios`/`disparos_contatos` (legado) e atualiza `leads.ultimo_disparo_em` — **mas NÃO marca o `campanha_leads`** da campanha de prospecção.
- As **tarefas** (1º contato, 2º contato…) já são geradas por **trigger** (`trg_campanha_leads_generate_tasks`) quando o lead entra na campanha.

## 1. O que precisa ser ajustado

### 🔴 1.1 Parar o disparo automático das manuais (essencial)
- **Cron job 11:** adicionar `AND c.tipo_envio <> 'manual'` no WHERE (manual não entra na fila de disparo automático).
- **`campanha-disparo-processor`:** guard de defesa — se `tipo_envio='manual'`, `return` cedo (não dispara), mesmo se chamado por outro caminho.
- **Por quê é crítico:** sem isso, o robô dispara os leads frios da manual (que a equipe deveria chamar) → 1º contato indevido/duplicado, no chip errado.

### 🟡 1.2 Vincular o 1º contato manual ao `campanha_leads`
- Quando a operadora faz o 1º contato manual, é preciso marcar **`campanha_leads.data_primeiro_contato` + status `frio→contatado`** daquele lead **naquela campanha**.
- Hoje o `send-disparo-manual` não faz isso (só mexe em `leads`/`disparos_contatos`). Ajuste: a edge passa a receber o `campanha_id` (ou `campanha_lead_id`) e atualiza o `campanha_leads`.
- **Por quê:** sem isso o lead fica `frio` pra sempre na campanha (não conta nas métricas) e — se 1.1 não estiver feito — é re-disparado pelo robô.
- **Onde plugar o envio:** idealmente na **tarefa "1º contato"** (campanha_lead_tasks) — um botão "Enviar 1º contato" que chama `send-disparo-manual` com o `campanha_id`, marca a tarefa como feita e marca o `campanha_leads`.

### 🟡 1.3 UI / métricas (exibição)
- **Aba Status:** pra manual, "disparando agora" não se aplica — trocar por progresso das tarefas ("X de Y 1ºs contatos feitos").
- **Dashboard:** separar "disparos automáticos (IA)" de "1ºs contatos manuais" (são naturezas diferentes).
- **Wizard (criar manual):** a aba "Disparo" (janela 07-17h / anti-ban) faz pouco sentido pra manual; deixar claro que o 1º contato é a equipe que faz. (Briefing IA já não é exigido em manual — corrigido em 08/06.)

### 🟢 1.4 Chip diferente — JÁ garantido
- Categoria `manual` ≠ `prospeccao_ia` + **trava de exclusividade** (1 chip/campanha) já existem. Como a manual deixa de usar o processor, o chip IA nunca é tocado pela manual. Reforço: na criação manual, sugerir/filtrar chip categoria `manual`.

### 🟢 1.5 Leads diferentes — JÁ garantido
- Cada campanha tem seus `campanha_leads`. Duplicar IA→manual (WS4) **move** os frios (separa da IA). Criar manual do zero seleciona leads próprios.

## 2. O que NÃO muda
- Campanhas **IA**: continuam disparando automático (sem alteração).
- A **resposta** manual (operadora conversa) já funciona.
- Anti-ban da IA intacto.

## 3. Esforço estimado
| Ajuste | Tamanho | Observação |
|---|---|---|
| 1.1 parar disparo auto da manual | **pequeno** | cron (1 linha) + guard no processor. Crítico e rápido. |
| 1.2 vincular 1º contato manual ao campanha_leads | médio | `send-disparo-manual` recebe `campanha_id` + marca; ligar à tarefa "1º contato" |
| 1.3 UI/métricas | médio | exibição na aba Status, Dashboard e wizard |

## 4. Ponto de atenção (anti-ban no manual)
O 1º contato manual pela operadora ainda sai de um chip WhatsApp — se ela chamar muitos de uma vez no mesmo chip, há risco de bloqueio. Como é manual e em menor volume, o cap rígido de 35/dia não precisa ser aplicado, mas vale **orientar a equipe** a não disparar em rajada pelo mesmo chip.

## 5. Referências
- `campanha-disparo-processor` (cron job 11) · `send-disparo-manual` · `receive-whatsapp-messages`
- Trigger `trg_campanha_leads_generate_tasks` (gera tarefas) · tabela `campanha_lead_tasks`
- Modelo de campanhas: [[project_modelo_campanhas]] — **esta análise altera o entendimento de que manual também dispara automático.**
- Plano-mestre `plano-mestre-maquina-prospeccao.md`.
