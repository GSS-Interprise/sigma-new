---
tags: [arquitetura, sigma, financeiro, comunicacao, aprovacao]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-07-09
status: rascunho   # rascunho | pronto-pra-executar | em-execucao | entregue
operador: Raul
repo: sigma-new
parent: modulo-financeiro.md
---

# Arquitetura de Solução — Fluxo de Aprovação Financeira via Canais

> **O que é (1 frase):** o fechamento mensal do financeiro percorre um fluxo tipo Slack — Mavi fecha → João aprova → Thais paga — onde **cada etapa acontece num canal de Comunicação do próprio Sigma**, com notificação Web Push no celular e o sistema reagindo às ações (aprovar / anexar comprovante) sem sair do chat.

## 1. O que precisa funcionar (a capacidade)

O financeiro fecha a produção do mês e precisa de **aprovação da diretoria (João)** antes de pagar, e de **registro do pagamento com comprovante (Thais)** por médico. Hoje isso vive em conversas soltas de WhatsApp. A capacidade traz o fluxo pra dentro do Sigma, no celular, com rastro auditável:

1. **Mavi fecha a competência** → gera o **PDF de fechamento** (consolidado do mês) → o sistema posta no **canal "Financeiro" (Mavi + João)** e notifica o João (push).
2. **João aprova** tocando um **botão de ação na mensagem** (não depende de interpretar texto) → o sistema posta a lista de médicos aprovados no **canal "Comprovantes" (João + Thais)**, um **card por médico**, e notifica a Thais (push).
3. **Thais paga os médicos** e **sobe os comprovantes em lote** (fluxo MUITO simples — o objetivo é alimentar a **contabilidade**). O sistema **lê o nome/dados do médico no PDF** e casa automaticamente com `medicos`, salva no bucket privado `financeiro-anexos`, marca o **pagamento como `pago`**, e encaminha pra contabilidade. O que não casar vai pra uma **fila de "não identificados"** que ela resolve na mão — nunca trava.

## 2. Estado atual (o que já existe — REAPROVEITAR, não recriar)

- **Pagamentos por médico:** `financeiro_pagamentos` (status `pendente|aprovado|pago`, campos `conferido_por/em`, `aprovado_por/em`, `comprovante_status`, `nf_status`) — já tem os estados; só faltam as transições e o disparo.
- **Comunicação (canais):** `comunicacao_canais|mensagens|participantes|notificacoes`. Mensagens têm **`reply_to_id`** (thread — base da associação por médico) e **`anexos TEXT[]`** + bucket `comunicacao-anexos`. Já existe `postarNoCanalFinanceiro` (T05) que posta + notifica participantes.
- **Web Push / PWA:** `push_subscriptions` + `send-web-push` + service worker. **Já dispara em mensagem de canal** → João e Thais recebem no celular sem nada novo. Mobile já ajustado (safe-area, 100dvh, sem zoom iOS).
- **Anexos financeiros:** `financeiro_anexos` + bucket privado `financeiro-anexos` + RLS por papel (T03). Destino final dos comprovantes.
- **Canal `Financeiro — Pagamentos`** (`c22099bc…`) já existe e está ligado em `config_lista_items.financeiro_canal_id` — reusar ou dividir em dois (ver §3).

## 3. A solução desenhada (a forma)

**Novo conceito `financeiro_fechamentos`** (o "lote do mês" que o João aprova):
- `id, competencia (mes/ano), pdf_path, total, qtd_medicos, status (aberto|aguardando_aprovacao|aprovado|pago), criado_por (Mavi), aprovado_por (João), aprovado_em, canal_msg_id`.
- Liga os `financeiro_pagamentos` do mês (via competência) ao fechamento.

**Dois canais** (config novo em `config_lista_items`):
- `financeiro_canal_aprovacao_id` → canal **Financeiro** (Mavi + João): fechamento + aprovação.
- `financeiro_canal_comprovantes_id` → canal **Comprovantes** (João + Thais): cards por médico + comprovantes.

**Botões de ação na mensagem (não interpretar texto livre):**
- O chat precisa suportar **ações inline** numa mensagem (metadata `acao: {tipo, referencia_id}`). João vê "✅ Aprovar fechamento" na mensagem; Thais vê "📎 Anexar comprovante / marcar pago" no card do médico.
- Alternativa de menor esforço se ações inline não couberem: um **link** que abre a tela mobile daquela ação (aprovar / pagar). Decidir na T-planos.

**Listener de canal (a peça nova de backend):**
- Trigger/edge que observa `comunicacao_mensagens` (ou os cliques nos botões de ação) nos dois canais e executa: aprovar fechamento; ao receber comprovante num card (via `reply_to_id` → médico), copiar anexo `comunicacao-anexos` → `financeiro-anexos`, gravar `financeiro_anexos`, marcar `comprovante_status='enviado'` + `status='pago'`.

**Papéis / contas:**
- **João** = novo papel de aprovação (usar `diretoria` ou criar `aprovador_financeiro`). **Precisa conta no Sigma.**
- **Thais** = papel de pagamento (usar `gestor_financeiro` ou criar `pagador_financeiro`). **Precisa conta no Sigma.**
- Ambos entram como participantes dos canais respectivos.

## 4. Fora de escopo (anti-alucinação)

- **Não** substitui a solicitação/recebimento de NF (T06) — isso é outro fluxo, já pronto/adiantado.
- **Não** integra Conta Azul (T11) nem Dr Escala API (T10).
- **Não** processa pagamento de verdade (transferência) — a Thais paga no banco dela; o Sigma só registra o comprovante.
- **Não** cria contabilidade/DRE — é fluxo de aprovação operacional, não relatório contábil.

## 5. Riscos / pegadinhas / dependências

- **Detecção de ação no chat:** texto livre é frágil → usar botão de ação/metadata ou link pra tela. **Não** implementar por palavra-chave.
- **Associação comprovante ↔ médico:** depende de a Thais responder **no card do médico** (`reply_to_id`). Se ela postar solto, o listener não sabe o médico → precisa de fallback (ex.: exigir reply, ou UI que já abre no médico certo).
- **GRANT após CREATE TABLE** (`financeiro_fechamentos`) — senão edges crasham 42501.
- **João e Thais sem conta** hoje — bloqueia push/participação. Criar antes.
- **Bucket cross-copy:** comprovante entra em `comunicacao-anexos` (chat) e precisa ir pra `financeiro-anexos` (privado) — cuidar RLS/service_role.
- **Deploy de edge obrigatório** ao mexer em `supabase/functions/*`.

## 6. Plano de Execução — as tarefas (cada item ≈ 1 PR)

- [ ] **A1 — Contas + papéis** de João (aprovação) e Thais (pagamento) + participação nos canais.
- [ ] **A2 — `financeiro_fechamentos`** (tabela + RLS + GRANT) ligando os pagamentos da competência.
- [ ] **A3 — Fechar competência (Mavi):** ação na tela → gera PDF consolidado → cria fechamento → posta no canal Financeiro com botão "Aprovar".
- [ ] **A4 — Ações inline no chat** (metadata `acao` + render do botão no mobile) OU link pra tela de ação. Decidir e implementar.
- [ ] **A5 — Aprovação (João):** botão marca `aprovado` → posta um card por médico no canal Comprovantes.
- [ ] **A6 — Comprovantes em lote (Thais):** upload de vários PDFs → edge extrai texto e casa o médico por **múltiplos sinais** (nome + razão social/CNPJ da PJ + dados bancários de `medicos` + valor) → copia p/ `financeiro-anexos` → `pago` + encaminha contabilidade (`financeiro-enviar-comprovante`). Não-casados → **fila de revisão** (casa na mão). PDFs escaneados (imagem) → OCR só se necessário; senão caem na fila.
- [ ] **A7 — Reflexo na lista de médicos / contas a pagar:** status `pago` aparece na hora + push de confirmação.
- [ ] **A8 — Mobile pass:** validar os 3 toques (aprovar / anexar / confirmar) no Safari iOS + Chrome Android.

## 7. Critério de pronto (verificável)

- [ ] Mavi fecha jul/2026 → João recebe push → aprova no celular com 1 toque → Thais recebe push.
- [ ] Thais responde no card de um médico com o PDF → aquele médico vira `pago` na lista, comprovante no bucket privado.
- [ ] Nada depende de interpretar texto livre do chat.
- [ ] Tudo funciona no navegador do celular.
- [ ] RLS testada (comprovante não acessível sem auth).

## 8. Decisões travadas (2026-07-09, com o Raul)

- Aprovação por **lote do mês** (fechamento = PDF consolidado), não médico a médico.
- **João** aprova com **botão de ação** (não palavra-chave). Fluxo dele é chat-first.
- **Thais**: fluxo **MUITO simples** — sobe comprovantes em lote, sistema **lê o nome/dados do médico no PDF** e casa automático. Comprovante serve pra **contabilidade**. Não-casados → fila de revisão.
- Web Push já cobre a notificação mobile.
- **Contas:** João = `jhcvillela@yahoo.com.br` · Thais = `thaissdebom@gmail.com`.

## 9. Aberto (confirmar antes de executar)

- Papéis: criar `aprovador_financeiro` (João) / `pagador_financeiro` (Thais) — recomendação.
- Método de criação de conta: senha temporária (Raul repassa) vs convite por email.
- A4 (só p/ o João): **botão inline** no chat (melhor UX) vs **link pra tela** (menos esforço)?
- Casamento por nome no PDF: risco de o favorecido ser a **PJ**, não o médico → casar por múltiplos sinais + fila de revisão (já previsto em A6).
