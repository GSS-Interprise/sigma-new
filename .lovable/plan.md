## Diagnóstico — Rastreio e Auditoria de Contratos

### 1) O que JÁ está implementado hoje

**Tabela `auditoria_logs`** (registra `usuario_id`, `usuario_nome`, `usuario_perfil`, `created_at`, `acao`, `dados_antigos`, `dados_novos`, `campos_alterados`):

| Evento | Status | Onde |
|---|---|---|
| Criar contrato | ✅ | `auditoria_logs` (acao=`criar`) |
| Editar contrato (qualquer campo) | ✅ | `auditoria_logs` (acao=`editar`) com diff antigo→novo |
| Anexar arquivo ao contrato | ✅ | `auditoria_logs` (acao=`anexar`) |
| Remover anexo | ✅ | `auditoria_logs` (acao=`remover_anexo`) |
| Criar/editar/excluir itens | ✅ | `contrato_itens` |
| Criar/excluir renovações | ✅ | `contrato_renovacoes` |
| Editar aditivos de tempo | ✅ | `contrato_aditivos_tempo` |
| Envio de resumo por e-mail | ✅ (recente) | `auditoria_logs` + `system_notifications` + e-mail com "Enviado por: Nome" |
| Aba "Atividades" no contrato | ✅ | `AbaAtividadesContrato.tsx` mostra timeline com avatar, ação, campos antes/depois e horário |
| Notificação no sino para destinatários do e-mail | ✅ (recente) | `system_notifications` |

**O que NÃO temos hoje (gaps):**

| Evento | Hoje | Gap |
|---|---|---|
| **Quem visualizou o contrato** (abriu a ficha) | ❌ | Sem registro |
| **Quem visualizou um anexo** (abriu PDF no viewer) | ❌ | Sem registro |
| **Quem baixou um anexo** | ❌ | Sem registro (download direto pelo Storage não é logado) |
| **IP / User-Agent / Dispositivo** | ❌ | Não capturamos |
| **Visualização do e-mail enviado** (open tracking) | ❌ | Resend suporta, mas não está ativado |
| **Clique no link do e-mail** | ❌ | Sem tracking pixel/redirect |
| **Tempo gasto / duração da visualização** | ❌ | Não capturado |
| **Exportação / impressão / cópia para área de transferência** | ❌ | Não capturado |
| **Log de exclusão de contrato inteiro** | ⚠️ Parcial | Trigger DB grava `DELETE` em maiúsculo, mas a aba filtra isso — não aparece para o usuário |
| **Quem reenviou / encaminhou anexo externamente** | ❌ | Fora do nosso escopo (impossível) |

---

### 2) Plano de implementação proposto (em fases)

#### Fase 1 — Tracking de visualização e download (essencial)

1. Criar tabela `contrato_acessos`:
   ```
   id, contrato_id, usuario_id, usuario_nome, tipo_acesso
   ('visualizar_contrato' | 'visualizar_anexo' | 'baixar_anexo' | 'imprimir' | 'exportar_pdf'),
   anexo_id (nullable), ip, user_agent, created_at
   ```
   Com RLS: leitura para usuários do módulo contratos; insert para autenticados.

2. **Frontend — disparar registro** em:
   - `ContratoDialog` / `AbaCadastroContrato`: ao abrir → `visualizar_contrato`
   - `ContratoFileViewerDialog`: ao abrir → `visualizar_anexo`
   - Botão de download de anexo: → `baixar_anexo`
   - Botões de export PDF / imprimir: → `exportar_pdf` / `imprimir`

3. Captura de IP/UA via edge function leve `registrar-acesso-contrato` (lê `x-forwarded-for` e `user-agent` do request).

4. Integrar esses eventos na **Aba Atividades** com ícones próprios (olho, download, impressora) e badge "visualização" (sem antes/depois).

#### Fase 2 — Tracking de e-mail

1. Ativar **Resend webhooks** (`email.opened`, `email.clicked`, `email.delivered`, `email.bounced`).
2. Edge function `resend-webhook` que grava em `sigma_email_log` os eventos com timestamp.
3. Mostrar no histórico: "✉️ Bianca abriu o e-mail às 14:32" / "🔗 clicou no link".

#### Fase 3 — Painel "Quem viu este contrato"

1. Card lateral no `ContratoDialog` listando últimos 20 acessos: foto, nome, ação, data/hora, IP mascarado.
2. Filtro na lista geral de contratos: "Contratos sem visualização nos últimos 30 dias".
3. Métrica em `ContratosMetrics`: total de visualizações / downloads no período.

#### Fase 4 — Hardening e logs administrativos

1. Mostrar logs `INSERT/UPDATE/DELETE` (triggers DB) num modo "auditor" oculto por permissão.
2. Exportar histórico do contrato em CSV/PDF para fins legais.
3. Reter logs com retenção configurável (ex.: 5 anos) — política de purge.

---

### 3) Detalhes técnicos relevantes

- A função `registrarAuditoria` em `src/lib/auditLogger.ts` já é o ponto central — basta criar `registrarAcesso(...)` análogo, ou estender com novos valores de `acao` no enum (`visualizar`, `baixar`, `imprimir`).
- Hoje o tipo de `acao` é uma union TS (`'criar' | 'editar' | 'excluir' | 'anexar' | 'remover_anexo'`); precisaria estender.
- A coluna `dados_novos` já é JSONB livre, então pode receber `{ anexo_nome, anexo_id, ip, user_agent }` sem migração de schema — porém uma tabela própria `contrato_acessos` escala melhor (relatórios, índices, RLS específica).
- O viewer `ContratoFileViewerDialog` precisa expor o `anexo_id` para registrar com precisão.

---

### 4) Recomendação de ordem

1. **Fase 1** (alto valor, baixo custo) — resolve "quem viu, quem baixou, quando" para usuários internos.
2. **Fase 2** (médio custo) — exige Resend webhook configurado; resolve "quem viu o e-mail externamente".
3. **Fase 3** (UI) — torna tudo visível.
4. **Fase 4** (compliance) — opcional, sob demanda.

Diga qual fase quer que eu implemente primeiro (sugiro Fase 1 completa).