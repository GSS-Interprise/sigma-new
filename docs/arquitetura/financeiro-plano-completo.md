---
tags: [arquitetura, sigma, financeiro, plano, execucao]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-07-16
status: pronto-pra-executar
operador: Raul
repo: sigma-new
parent: financeiro-fluxos-integracao-conta-azul.md
---

# Plano Completo — Módulo Financeiro (execução)

> Plano de execução do módulo financeiro do Sigma. Complementa o **mapa dos fluxos**
> (`financeiro-fluxos-integracao-conta-azul.md`) com escopo confirmado em 16/07, fases
> sequenciadas por valor, dependências e ações imediatas. Base: reuniões Ramone/Mavi
> (10/07 e 15/07) + planilhas reais + avaliação do repo `financeai`.

## 0. Escopo e fronteiras (CONFIRMADO 16/07)

**DENTRO deste módulo (financeiro):**
- Ingestão **multi-fonte** da produção **já consolidada** (botão **"Importar fechamento"** + **seletor** de fonte/contrato).
- Pagar / receber / conferência / fechamento / aprovação (chat-first).
- Conferência do médico **antes da NF**.
- Contas a receber (produção × contrato).
- Cadastro de cliente **integrado ao cadastro de contratos (Bianca)** + particularidades de faturamento.
- **Controladoria / BI** contratado × realizado.
- Integração **Conta Azul (API)** — por último.
- **Inbound de NF** (Resend + MX).

**FORA (outro projeto do Raul — NÃO fazer aqui):** o **tratamento/ajuste dos relatórios crus** da radiologia — classificação de exame (doppler/total/politrauma), tabelas de-para de procedimento/valor, detecção de sub-faturamento. O financeiro **recebe a produção já consolidada**; não processa o relatório bruto.

**FORA (outra sessão):** chips/prospecção e licitações (PNCP × Effecti).

## 1. Estado atual (PRONTO — não refazer)
Contas a pagar (import xlsx + conferência + solicitar NF por e-mail com lembrete + comprovante com OCR do nome), contas a receber com rateio + fluxo a_faturar→faturado→recebido, resumo consolidado, **fechamento** (`financeiro_fechamentos`), **aprovação chat-first via canais** (Mavi fecha → João aprova no canal → Thais sobe comprovante), web push, mobile responsivo. Contas João/Thais criadas. Edges: `financeiro-solicitar-nf`, `financeiro-processar-comprovantes`, `financeiro-nf-inbound` (aguardava infra).

## 2. Ações imediatas (destravam JÁ — não dependem da Mavi voltar)

- **A0.1 — Inbound de NF (Resend desbloqueado):** criar o subdomínio `nf.gestaoservicosaude.com.br` via API do Resend → gerar o **texto do registro MX** pro suporte da GSS colar no DNS. Depois do MX propagar, o `financeiro-nf-inbound` liga sozinho. *(Ressalva: médicos hoje mandam NF por WhatsApp; o inbound por e-mail só resolve quando o médico responder o e-mail — ver F2/roadmap de hábito.)*
- **A0.2 — Label:** trocar "Aprovar fechamento" → **"Aprovar pagamento"** (correção da Mavi: João aprova o pagamento).
- **A0.3 — Portar helpers do `financeai`** (stack idêntica): `_shared/auth.ts`, `validate.ts`, `csv-export.ts`, `pdf-export.ts`, `reconcile-transactions` (dedup de fechamento). Acelera F1/F5.

## 3. Fases de entrega (sequência por valor)

### F1 — Ingestão multi-fonte: "Importar fechamento" + seletor  ⭐ maior valor
**Objetivo:** a Mavi importa a produção **consolidada** de qualquer fonte e o Sigma gera o fechamento/pagamentos, sem planilha manual.
- **F1.1** UI: botão **"Importar fechamento"** + **seletor de fonte/contrato** (Dr. Escala, Marieta, CIS Navegantes, ambulatório, "outro").
- **F1.2** **Config por contrato** (o coração): mapeamento de colunas → campos (`médico`, `quantidade/horas`, `valor`, `competência`) + regra de geração. Novo cliente = nova config, **sem código**. Tabela `financeiro_import_config` (por contrato).
- **F1.3** Parser Excel/CSV do arquivo consolidado → aplica a config → gera `financeiro_fechamentos` + `financeiro_pagamentos`. Reusa `reconcile-transactions` pra **não duplicar** re-import.
- **F1.4** Dr. Escala: começa por **import** (formato a receber do Raul); **API** (T10) fica pra depois.
- **Dependências:** formato real de cada relatório consolidado (Dr. Escala pendente); demais (Marieta/CIS) já temos amostra.
- **Fronteira:** o arquivo entra **já consolidado**. Se vier cru (radiologia), o tratamento é o **outro projeto** — o financeiro consome a saída dele.

### F2 — Conferência do médico antes da NF
**Objetivo:** produção → **resumo ("olheirinho")** → enviar ao médico → médico confere/OK → **então** emite/solicita NF.
- **F2.1** Gerar o resumo por médico (PDF/link) a partir do fechamento (reusa `pdf-export`).
- **F2.2** Envio ao médico (e-mail tokenizado, já existe base em `financeiro-solicitar-nf`) com botão "Confere/Contesta".
- **F2.3** Após OK do médico → dispara a solicitação de NF (fluxo atual).
- **Dependência:** decidir canal (e-mail vs WhatsApp — hoje é WhatsApp; ver roadmap de hábito).

### F3 — Contas a receber (produção × contrato)
**Objetivo:** cruzar a produção executada com o contrato do cliente pra faturar.
- **F3.1** Import da produção do cliente (mesma engine do F1) → cruza com o contrato (grão contrato × item × mês).
- **F3.2** NF de saída (GSS→cliente): upload já existe; **extração automática dos dados** da NF [falta] → alimenta BI de faturamento.
- **F3.3** Particularidades de faturamento por cliente (janela: 20→21 vs 1→30) — campo na config do contrato (F1.2).

### F4 — Cadastro de cliente + integração contratos (Bianca)
**Objetivo:** cliente não é cadastrado pela Mavi — vem do **cadastro de contratos (Bianca)**.
- **F4.1** Integrar/importar o cadastro de clientes/contratos da Bianca (fonte da verdade do "contratado").
- **F4.2** O que interessa à Mavi = **execução do serviço pra faturar** (cliente pode começar meses depois) → vincular execução ↔ contrato.

### F5 — Controladoria / BI (contratado × realizado)
**Objetivo:** o BI que a Ramone leva à diretoria: qual item produziu a menos/mais pra renegociar contrato.
- **F5.1** Grão: **contrato × item × mês**. "Contratado" vem do F4 (Bianca); "realizado" vem do F1/F3 (produção importada).
- **F5.2** View + dashboard (reusa padrão `margin.ts` do financeai). Diferença contratado−realizado por item, com destaque de desvio.
- **Nota:** é BI **do financeiro** (contrato × faturado/produzido). NÃO é a análise fina de exame/doppler (outro projeto).

### F6 — Conta Azul (API) — por último
**Objetivo:** enviar automaticamente contas a pagar/receber aprovadas pro Conta Azul (integrar, **não** substituir).
- **F6.1** Pré-req bloqueante: **levantar com a contabilidade** o que usam do Conta Azul.
- **F6.2** Edge `conta-azul-sync` (OAuth 2.0) → cria contas a pagar/receber pós-aprovação.

## 4. Dependências externas (GSS — coletar)
| Dependência | Quem | Bloqueia |
|---|---|---|
| **MX no DNS** (`nf.` subdomínio) | GSS/Ramone (Raul pede) | Inbound NF (A0.1) |
| **Formato do relatório Dr. Escala** | Raul recebe | F1.4 |
| **Cadastro de contratos (Bianca)** — acesso/schema | GSS | F4, F5 |
| **Levantamento uso Conta Azul** | contabilidade/Mavi | F6 |
| Validação E2E com produção do mês | Mavi (pós-férias) | aceite final |

## 5. Reuso do `financeai` (resumo)
- **Portar:** `auth.ts`, `validate.ts`, `csv-export.ts`, `pdf-export.ts`, `reconcile-transactions`, `margin.ts`.
- **Referência:** `budgets`/`monthly_close` (controladoria), `ocr-document` (só pra PDF bagunçado — CEPOM/São João, se preciso).
- **Não tem:** Conta Azul, config de-para → construir.
- ⚠️ **`.env` commitado no `financeai`** (segredos no GitHub) — rotacionar/limpar.

## 6. Notas de PWA / comunicação
Substituir Slack por Sigma (driver de custo) via **PWA** (instalar como app — João/Thais/Eron). Web push já pronto. Repassar senha temporária a João/Thais. *(Operacional; foi pedido na reunião financeira mas não bloqueia F1–F6.)*
