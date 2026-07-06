---
tags: [arquitetura, sigma, financeiro]
projeto: SigmaGSS
autor: Raul
data: 2026-07-02
status: rascunho   # rascunho | pronto-pra-executar | em-execucao | entregue
operador: Raul
repo: sigma-new
---

# Arquitetura de Solução — Módulo Financeiro (contas a pagar ponta a ponta + contas a receber)

> Materializa o mapeamento com a Maria Vitória (financeiro GSS). Ver reunião `Reuniões/2026-06-25-GSS-Financeiro-Modulo.md`. Proposta: `Proposta_GSS_Modulo_Financeiro.pdf` (R$ 3.000, entrega).

## 1. O que precisa funcionar (a capacidade)

O financeiro da GSS opera **contas a pagar e a receber dentro do Sigma**, sem depender de Slack e reduzindo o Conta Azul: a produção do médico vem do Dr. Escala → o financeiro confere e dá OK → o médico é avisado automaticamente pra emitir a NF → a NF chega e fica organizada → os sócios aprovam o pagamento por um canal acessível no **celular** → o comprovante é anexado e enviado ao médico/contabilidade. Contas a receber ficam ligadas aos contratos (aviso de contrato novo a faturar).

## 2. Estado atual (o que já existe — REAPROVEITAR, não recriar)

- **Dr. Escala já conectado (read-only):** edge `supabase/functions/drescala-sync/index.ts` puxa plantões da API `api-gateway.drescala.com` (auth `DRESCALA_API_KEY`) e faz upsert em **`escalas_integradas`** (produção por médico: crm, id_externo, unidade, carga_horaria_minutos, tipo_plantao). Essa é a fonte de produção. **Não precisa criar conexão — usar.**
- **Contas a pagar já existe:** `src/pages/Financeiro.tsx` (abas Resumo/Contas a Pagar/SigFinc/Valores) + `src/hooks/useFinanceiroData.ts` (`useGerarPagamentos` gera `financeiro_pagamentos` + `financeiro_pagamento_itens` a partir de `escalas_integradas` × `financeiro_config_valores`). Status enum já tem `pendente|aprovado|pago`, **mas a UI pula direto pendente→pago** (`FinanceiroContasPagar.tsx:97-112`) — a etapa de aprovação não é usada.
- **SigFinc** (`FinanceiroSigFinc.tsx` + `useSigFincResumo.ts`): já cruza `medicos`(lead_id) → `proposta` → `proposta_itens` (valor_medico/valor_contrato) → `financeiro_pagamentos` (realizado, casado por CRM). Base conceitual pra **contas a receber por contrato**.
- **Médicos** (`medicos`): tem `crm` (unique), `lead_id` (FK), e **dados bancários** (`chave_pix`, `banco`, `conta_corrente`). MAS o financeiro identifica o médico por **string CRM**, não por FK — frágil.
- **Comunicação / canais:** `comunicacao_canais|mensagens|participantes|notificacoes` + upload pro bucket `comunicacao-anexos` (`MensagemInput.tsx`, suporta paste/drag). Notificação in-app pronta (`comunicacao_notificacoes`, `src/pages/Notificacoes.tsx`).
- **Contratos** (`contratos`): `data_inicio`, `data_fim`, `status_contrato` (Ativo/Inativo/Encerrado/Pendente), `cliente_id` (clientes têm `email_financeiro`). Variante `contratos_dr_escala`. Base pra amarrar contas a receber.
- **Envio (reutilizável direto):** `send-whatsapp` (Meta Graph, template pt_BR), `send-email-resend` (genérico), `send-contract-email` (já manda documento por e-mail — modelo pra NF/comprovante). Crons de alerta: `alerta-tarefas-2h`, `demandas-deadline-alerter`.
- **Conta Azul:** greenfield — não existe nada no repo.

## 3. A solução desenhada (a forma)

**Princípio:** estender o Financeiro existente, não recriar. Adicionar as camadas que faltam (aprovação real, anexos NF/comprovante, solicitação automática, contas a receber, integração Conta Azul).

**Modelo de dados (novo/estendido):**
- `financeiro_pagamentos`: **adicionar `medico_id uuid FK medicos(id)`** (backfill por CRM, auditado) + campos de fluxo: `nf_status` (nao_solicitada|solicitada|recebida), `nf_solicitada_em`, `aprovado_por`, `aprovado_em`, `comprovante_status`.
- **`financeiro_anexos`** (NOVO — não pendurar no `comunicacao_mensagens.anexos TEXT[]`): `id, pagamento_id FK, tipo (nf|comprovante), arquivo_path, mime, status, enviado_para (medico|contabilidade), enviado_em, criado_por`. Bucket privado próprio (`financeiro-anexos`), RLS. **GRANT após CREATE.**
- **`financeiro_receber`** (NOVO): a partir de `contratos` — `contrato_id FK, cliente_id, competencia (mes/ano), regra (fixo|hora|producao), valor, status (a_faturar|faturado|recebido), nf_saida_path`. Aviso de contrato novo a faturar via `comunicacao_notificacoes` + cron.

**Ingestão da produção do mês — duas fases:**
- **Fase 1 (roda já): importação por relatório.** A Maria Vitória gera o relatório **Consolidado - Previsão** (`relatorio_consolidado_previsao_financeiro.xlsx`, 1 aba "Tabela"; ~4 linhas de cabeçalho e depois colunas: Profissional · Registro Profissional (CRM) · Razão Social · CNPJ · CPF · Local · Setor · Qtde de Plantões · Qtde de Horas · Qtde de Itens · Valor Itens Est. · Valor Hora Est.). Uma tela sobe esse arquivo → parseia → gera a **produção do mês** em `financeiro_pagamentos` (1 linha por profissional/mês/unidade), casando médico por CRM (`medico_id`). Desacopla do cronograma da API do Dr. Escala. **`financeiro_pagamentos` está vazia hoje** — o import é o ponto de entrada dos dados.
- **Fase 2 (depois): Dr. Escala via API.** O Raul acordou com os responsáveis do Dr. Escala um **contrato JSON** dos dados que ele precisa; eles vão expor via API. O Sigma consome a **mesma estrutura da Fase 1** — troca só a fonte de ingestão, o resto do fluxo não muda.
- **Canal "Financeiro" na Comunicação:** ao a Mavi **conferir e aprovar**, a produção/pagamento é publicada num **canal dedicado da aba Comunicação** (nome tipo "Financeiro") pros sócios aprovarem no celular — substitui o Slack.

**Fluxo contas a pagar (ponta a ponta):**
1. **Produção do mês** entra por importação do relatório (Fase 1) ou API Dr. Escala (Fase 2) → `financeiro_pagamentos`.
2. **Conferência (Mavi):** confere o fechamento por médico e dá **OK** → a produção é publicada no canal "Financeiro" da Comunicação e dispara `financeiro-solicitar-nf`.
4. `financeiro-solicitar-nf` (NOVO, reusa `send-whatsapp`/`send-email-resend`): avisa o médico pra emitir NF no valor conferido; seta `nf_status=solicitada`.
5. Médico envia NF → upload em `financeiro_anexos (tipo=nf)` → `nf_status=recebida`.
6. **Aprovação dos sócios** (tela mobile-friendly): sócio vê valor+NF e dá OK → `status=aprovado`, `aprovado_por/aprovado_em`; `comunicacao_notificacoes` avisa. **Substitui o Slack.**
7. Pagamento feito (Thais) → upload do comprovante (`tipo=comprovante`) → edge `financeiro-enviar-comprovante` manda ao médico e/ou contabilidade.
8. (Opcional) `financeiro-conta-azul-sync` (NOVO, greenfield): espelha o pagamento no Conta Azul via API.

**Requisito transversal (duro):** todas as telas de conferência e **aprovação abrem no navegador do celular** (iOS/Android), sem app. Responsivo obrigatório (requisito do João — ele aprova de qualquer lugar).

## 4. Fora de escopo (anti-alucinação — OBRIGATÓRIO)

- **Emissão de NF pelo próprio Sigma** (API de prefeitura) — hoje a emissão é feita pela prefeitura; fase posterior, arquitetura à parte.
- **Substituição total do Conta Azul** — só integração via API nesta capacidade. Substituir depende do levantamento do que a contabilidade usa dele (pré-requisito, ver §5).
- **Conexão direta com o banco** (extrato/baixa/pagamento automático) — o comprovante entra por **upload manual** (Thais), não puxado do banco.
- **App nativo** — é web responsivo (navegador), não app de loja.
- **Automatizar a conferência** — a conferência do fechamento segue **manual** (decisão da Mavi); o sistema só organiza e dispara o pós-OK.

## 5. Riscos / pegadinhas / dependências

- **PRÉ-REQUISITO BLOQUEANTE:** levantar com a **contabilidade** tudo que eles precisam do Conta Azul antes de qualquer integração/substituição (T09). Não começar T09 sem isso.
- **Médico por CRM string é frágil:** o backfill `medico_id` pode não casar (CRM divergente, médico sem cadastro em `medicos`). Auditar antes de confiar; manter fallback por CRM.
- **NÃO reusar `comunicacao_mensagens.anexos TEXT[]`** pra NF/comprovante (sem metadados/status) — usar `financeiro_anexos` própria.
- **Dr. Escala é read-only e sync mensal:** a conferência depende do `drescala-sync` estar rodando e atualizado; conferir antes de gerar pagamentos.
- **Calendário apertado:** solicita NF a partir do **dia 20**, médicos enviam até **dia 30**, pagamento no **último dia útil**. A automação de solicitação/cobrança tem que respeitar essa janela.
- **Dados sensíveis (LGPD):** NF, comprovantes e dados bancários → bucket **privado** + RLS estrita. `financeiro-anexos` nunca público.
- **Convenções do repo:** `GRANT ... TO authenticated, service_role` após todo `CREATE TABLE`; edge editada = **deploy obrigatório** confirmado; `encodeURIComponent` em chamadas Evolution.
- **Mobile:** validar as telas de aprovação no Safari iOS e Chrome Android de verdade (é o caso de uso principal dos sócios).

## 6. Plano de Execução — as tarefas (cada item ≈ 1 PR)

### Fase 1 — produção via relatório (roda já)

- [x] **T01 — `medico_id` nos pagamentos.** ✅ 05/07 (`20260705120000_...sql`): add `medico_id FK medicos(id) ON DELETE SET NULL` + `nf_status`/`nf_solicitada_em`/`aprovado_por`/`aprovado_em`/`comprovante_status`/`conferido_por`/`conferido_em` + índices. Sem backfill (tabela vazia); casamento por CRM acontece no import (T02).
- [x] **T02 — Importação do relatório de produção.** ✅ 06/07 (`20260706120000_...sql` + `FinanceiroImportProducaoDialog.tsx`): botão "Importar produção" no header do Financeiro → parse do xlsx no front (SheetJS; pula cabeçalho, acha "Profissional", lê até "Total") → RPC `importar_producao_financeiro` casa médico por CRM (dígitos+UF), grava produção do mês (`fonte='import'`, idempotente por mês) e reporta não-casados. Parse validado contra o arquivo real (totais batem: R$ 198.288 · 1836h · 248 plantões).
- [x] **T03 — Anexos financeiros.** ✅ 07/07 (`20260707120000_financeiro_rls_gestor.sql` [pré-req RLS gestor_financeiro/diretoria] + `20260707130000_financeiro_anexos.sql` + `FinanceiroAnexos.tsx` + `FinanceiroFileViewerDialog.tsx`): tabela `financeiro_anexos` + bucket privado `financeiro-anexos` + policies por papel. Upload de NF/comprovante no `FinanceiroDetalhe` (NF seta `nf_status='recebida'`); preview via `createSignedUrl` (bucket privado, padrão contratos).
- [x] **T04 — Conferência + OK (Mavi).** ✅ 07/07 (`useConferirPagamento` + botão no `FinanceiroDetalhe`): Mavi confere a produção importada e dá OK → grava `conferido_por/em` (RLS gestor_financeiro permite) → dispara T05.
- [x] **T05 — Canal "Financeiro" na Comunicação (Slack-like).** ✅ 07/07 (`postarNoCanalFinanceiro`): ao conferir, posta o lançamento (médico/valor/competência) no canal configurado (`config_lista_items.financeiro_canal_id`) + notifica participantes (Diretoria). João aprova respondendo no canal (informal, decisão do Raul). **Setup manual:** criar o canal "Financeiro" pela UI (Mavi + Diretoria como participantes) e gravar o `canal_id` em `config_lista_items.financeiro_canal_id`.
- [~] **T06 — Solicitar NF + rastrear resposta.**
  - [x] **T06a (outbound) ✅ 07/07** (`financeiro-solicitar-nf` deployada + botão "Solicitar NF" no Detalhe): envia por email (via `send-email-resend`, `from` = `financeiro@gestaoservicosaude.com.br`) com **reply-to tokenizado** `nf+<pagamento_id>@<financeiro_nf_reply_domain>`, opcional WhatsApp, seta `nf_status=solicitada`, loga em `sigma_email_log`. Suporta `email_override` p/ simulação. **Validado com médico real** (Resend key com domínio verificado; `send-email-resend` ganhou `from` por chamada). 752/752 médicos têm email.
  - [x] **T06b (inbound) — webhook construído ✅ 06/07** (`financeiro-nf-inbound` deployada, `--no-verify-jwt`): event `email.received` → casa pelo token (`nf+<id>@` no `to`/`received_for`, fallback `[NF-xxxxxxxx]` no assunto) → baixa anexo via `GET /emails/receiving/{email_id}/attachments` (`download_url`) → sobe em `financeiro-anexos` → `nf_status=recebida` + avisa no canal. Verificação Svix opcional (`RESEND_WEBHOOK_SECRET`). Roteamento por token testado. **Falta pra ligar:** (1) domínio de recebimento `nf.gestaoservicosaude.com.br` + MX no Resend; (2) webhook no Resend → `.../financeiro-nf-inbound` (event `email.received`); (3) secret `RESEND_WEBHOOK_SECRET`.
  - Fix de passagem: `sigma_email_log` estava sem GRANT (RLS on) → log não gravava; corrigido (`20260706140000_sigma_email_log_grant.sql`).
- [x] **T07 — Comprovantes.** ✅ 06/07 (`financeiro-enviar-comprovante` deployada + botão "Enviar" no `FinanceiroAnexos` + `send-email-resend` ganhou `attachments`): upload do comprovante (`tipo=comprovante`, já da T03) + envio ao médico e/ou contabilidade (`config_lista_items.financeiro_contabilidade_email`) com o **PDF em anexo**; seta `comprovante_status='enviado'` + marca o anexo. **Validado com anexo real.** Setup opcional: gravar `financeiro_contabilidade_email` no config.

### Fase 2 — automação e expansão

- [ ] **T08 — Contas a receber ligadas a contratos.** Tabela `financeiro_receber` a partir de `contratos` (data_inicio/status); regras por nota (fixo/hora/produção); **aviso de contrato novo a faturar** (cron + `comunicacao_notificacoes`). Reusa conceito do SigFinc. GRANT.
- [ ] **T09 — Painel/resumo financeiro consolidado.** A pagar + a receber no mês (a vencer, pagas, a faturar, faturadas) com os status do novo fluxo. Estende `FinanceiroResumo.tsx`.
- [ ] **T10 — Contrato JSON do Dr. Escala + ingestão via API.** Definir a **spec do JSON** que o Raul entrega aos responsáveis do Dr. Escala + edge que consome via API e alimenta a produção na **mesma estrutura da T02** (troca a fonte, não o fluxo).
- [ ] **T11 — Integração Conta Azul via API (greenfield).** ⚠️ BLOQUEADA até o levantamento com a contabilidade (§5). Edge `financeiro-conta-azul-sync`.

## 7. Critério de pronto (verificável)

- [ ] Build verde; 1 PR por tarefa aprovado pelo Raul.
- [ ] Um médico com produção no Dr. Escala percorre o fluxo: geração → conferência+OK → médico recebe pedido de NF → NF anexada → sócio aprova **pelo celular** → comprovante anexado → médico/contabilidade recebem.
- [ ] Contas a receber: ao entrar um contrato novo, o financeiro é avisado que há algo a faturar.
- [ ] NF/comprovantes em bucket privado (não acessível sem auth); RLS testada.
- [ ] Telas de conferência e aprovação funcionam no navegador do celular (Safari iOS + Chrome Android).
- [ ] T09 (Conta Azul) só entra em execução após o levantamento com a contabilidade.

## 8. Autonomia e direitos de decisão

- **Operador decide sozinho:** como implementar cada tarefa dentro deste desenho; ordem fina; nomes de colunas/edges.
- **Volta pro Raul só em:** bloqueio real · dúvida de escopo/arquitetura · contato com cliente (GSS/contabilidade) · pré-requisito do Conta Azul · capacidade concluída.
- **Mergeia:** Raul, revisando cada PR.

## 9. Checklist de revisão (Raul, antes de `pronto-pra-executar`)

- [ ] **Permissões definidas:** quem confere/solicita (financeiro/Mavi), quem aprova (sócios — Raul/João/Michael), quem paga/sobe comprovante (Thais), quem recebe (médico/contabilidade). Mapear em roles do Sigma.
- [ ] **Casos de erro:** médico sem `medicos.id` (CRM não casa); NF não chega até o dia 30; pagamento passa batido sem comprovante; sync do Dr. Escala desatualizado no fechamento; anexo grande/tipo inválido.
- [ ] **Decisões de negócio confirmadas:** manter Conta Azul (integrar) vs substituir; conferência 100% manual; janela 20→30→último dia útil; comprovante vai pra contabilidade e/ou médico?
- [ ] **Critérios §7 verificáveis** (fluxo ponta a ponta + mobile), não "está bom".
- [ ] **Caso fora do óbvio tratado:** médico não emite NF a tempo (cobrança/atraso).
- [ ] Operador conseguiria começar T01 sem voltar com dúvida de escopo.
