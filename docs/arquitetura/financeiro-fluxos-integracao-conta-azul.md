---
tags: [arquitetura, sigma, financeiro, conta-azul, integracao, mapa]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-07-10
status: rascunho   # rascunho | pronto-pra-executar | em-execucao | entregue
operador: Raul
repo: sigma-new
parent: modulo-financeiro.md
---

# Mapa dos Fluxos Financeiros ponta-a-ponta + Integração Conta Azul

> Consolida a reunião com Ramone/Mavi (10/07) e a análise dos relatórios reais (Carestream,
> Marieta, PDF Conta Azul). Objetivo: deixar o financeiro **fluido** dentro do Sigma, com o
> **Conta Azul como ERP contábil** (não se substitui — R$1.400/mês, histórico desde 2023) e o
> **Sigma como camada operacional/automação** que alimenta o Conta Azul via API.

## 1. Princípio

- **Sigma** = ingestão da produção + conferência + aprovação + comprovantes + automação. É onde o trabalho acontece.
- **Conta Azul** = fornecedores, categorias, contas a pagar/receber contábeis, histórico, base da contabilidade. Recebe do Sigma via API.
- **Robô de radiologia** (entrar exame a exame pra classificar doppler) = **OUTRO projeto**. Fora deste escopo — e desnecessário pra 80-90% (ver §3).

## 2. FLUXO A — Contas a pagar (médicos)

Estado atual entre colchetes: [pronto] / [falta] / [parcial].

1. **Ingestão da produção — MULTI-FONTE** (a grande lacuna nova). Não é só Dr. Escala:
   - **Dr. Escala** — [parcial] import xlsx feito (T02); API direta [falta] (T10).
   - **Radiologia Carestream** (CEPOM PDF, São João Batista PDF/Excel, resto Excel) — [falta]. Relatório bruto (13k linhas: paciente, descrição, módulo, médico) → classifica via tabelas de-para → resumo por médico.
   - **Radiologia Marieta** — [falta]. Matriz médico × tipo já classificada (TC/USG/DOPPLER/ANGIO/RM). Import mais simples.
   - **CIS Navegantes** (Antônia) — [falta]. Planilha própria.
   - **Ambulatório** — [falta, a mapear].
2. **Etapa "conferência → médico antes da NF"** (radiologia) — [falta]. Ex.: médico do CEPOM confere a produção dele (raio-x, tomo, USG...) antes de emitir a nota. Hoje é manual por WhatsApp.
3. **Conferência (Mavi) + fechamento** — [pronto] (T04/fechamento). Gera pagamento por médico.
4. **Solicitar NF ao médico** — [pronto] (T06a, email tokenizado). **Receber NF** — [pronto no código, aguarda Resend Pro + MX] (T06b).
5. **Aprovar PAGAMENTO (João)** — [pronto]. ⚠️ correção da reunião: João aprova o **pagamento**, não a conferência/fechamento. Ajustar label "Aprovar fechamento" → "Aprovar pagamento".
6. **Pagar + comprovante (Thais)** — [pronto] (upload lote + OCR do nome).
7. **Enviar pro Conta Azul (API)** — [falta]. Criar as contas a pagar no Conta Azul após aprovação.
8. **Comprovante → contabilidade** — [pronto] (financeiro-enviar-comprovante).

## 3. Tabelas de-para (a chave da automação de radiologia)

A GSS **já mantém** essas tabelas em Excel — viram config cadastrável no Sigma, por cliente:
- **Equivalência** — módulo do PACS → tipo de exame (CT→Tomografia, MG→Mamografia…).
- **Procedimentos** — código/descrição → **valor** (ex.: Abdome Total → R$69,30, o "dobro" do doppler já mapeado). ~681 itens.
- **Médicos** — nome no relatório do cliente → médico GSS (de-para de nomes).

Com elas, o Sigma **importa o relatório bruto → classifica → valora → agrupa por médico → gera o fechamento**, sem planilha manual. O robô só resolve o **resíduo** (descrição faltando no relatório).

## 4. FLUXO B — Contas a receber (clientes)

1. **Contrato** (Bianca cadastra cliente/contrato) — integração cliente↔contrato [parcial]. A Mavi NÃO cadastra cliente; o que ela precisa é a **execução do serviço pra faturar**.
2. **Produção executada do cliente** (o que foi feito) cruzada com o contrato — [falta].
3. **NF de saída** (GSS emite pro cliente) + extração dos dados — [parcial] (upload NF por cliente feito; extração automática [falta]).
4. **Faturamento** com **particularidades por cliente** (janela de faturamento: um fatura 20→21, outro 1→30) — [falta].
5. **Enviar pro Conta Azul (API)** — contas a receber [falta].
6. **Recebimento** — [parcial] (fluxo a_faturar→faturado→recebido feito).

## 5. FLUXO C — Integração Conta Azul (API)

- **Auth:** OAuth 2.0 Authorization Code (portal developers-portal.contaazul.com). Token Bearer. Rate limit 600/min, 10/s.
- **Enviar (Sigma → CA):** contas a pagar (médicos aprovados), contas a receber (faturamento por contrato).
- **Puxar (CA → Sigma):** fornecedores/clientes cadastrados, categorias, status de pagamento, histórico — pra não duplicar cadastro e refletir o que já existe desde 2023.
- **Edge nova:** `conta-azul-sync` (OAuth + endpoints). Guardar tokens em secret. Pré-req: **levantar com a contabilidade** o que exatamente usam do Conta Azul (bloqueante, já registrado em modulo-financeiro.md §5).

## 6. FLUXO D — Controladoria / BI financeiro (pedido da Ramone)

- **Contratado × realizado por cliente** (ex.: 1.900 consultas contratadas × 1.100 feitas) → renegociar contrato. [falta]
- **Faturamento por cliente / margem / taxa** — [falta]. Alimentado pelas NFs (Fluxo B) e produção.
- Vira uma aba de **controladoria** no BI (categoria Financeiro), que a Ramone e a Mavi analisam.

## 7. Fora de escopo (anti-alucinação)

- Robô que entra exame a exame no PACS (classificação por imagem) — outro projeto.
- Substituir o Conta Azul — só integrar.
- Substituir o Slack — decisão em aberto (Mavi avalia ao voltar de férias); não bloquear o financeiro por isso.

## 8. Riscos / dependências

- **Pré-req bloqueante:** levantar com a contabilidade o uso do Conta Azul antes da API (§5).
- Cada cliente de radiologia tem **formato e regra próprios** — o importador precisa ser configurável, não hard-coded.
- Descrição de exame faltando no relatório → cai em fila de revisão (não trava), robô é fast-follow.
- Resend Pro + MX ainda pendentes (destrava o recebimento de NF).

## 9. Fases de execução (proposta)

- **F1 — Import radiologia (matriz):** importador do Marieta (já classificado) → pagamentos. Mais rápido, valida o padrão.
- **F2 — Import radiologia (bruto) + tabelas de-para:** Carestream + equivalência/procedimentos/médicos cadastráveis. Cobre o grosso do trabalho manual da Mavi.
- **F3 — Conferência → médico** (radiologia) antes da NF.
- **F4 — API Conta Azul** (`conta-azul-sync`): enviar contas a pagar/receber (após levantamento com contabilidade).
- **F5 — Contas a receber por contrato** + particularidades de faturamento.
- **F6 — BI de controladoria** (contratado × realizado).
- Ajuste imediato (fora de fase): label "Aprovar fechamento" → "Aprovar pagamento".

## 10. Pendências pra terça (reunião presencial)

- Receber os relatórios que faltam (CIS Navegantes, ambulatório, São João Batista) pra mapear formatos.
- Confirmar particularidades de faturamento por cliente.
- Levantamento Conta Azul com a contabilidade.
- POPs de chips (prospecção) — item separado.
