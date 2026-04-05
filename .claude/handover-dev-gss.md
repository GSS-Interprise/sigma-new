# Handover Pós-Migração — Sigma GSS
## Para o Dev da GSS

### Projeto Novo
- **Supabase Dashboard**: https://supabase.com/dashboard/project/zupsbgtoeoixfokzkjro
- **URL API**: https://zupsbgtoeoixfokzkjro.supabase.co
- **Repo GitHub**: https://github.com/GSS-Interprise/sigma-new

---

## 1. SECRETS (Edge Functions → Secrets)

As seguintes secrets precisam ser configuradas no Supabase novo.
Ir em: **Dashboard → Edge Functions → Secrets** (ou Project Settings → Edge Functions → Secrets)

Copiar os valores do projeto antigo ou gerar novas nos provedores:

| Secret | Onde pegar | Usado por |
|--------|-----------|-----------|
| `WEBHOOK_SECRET` | Projeto antigo ou definir novo | `receber_mensagem_whatsapp`, `receive-support-email-reply` |
| `RESEND_API_KEY` ou `SENDGRID_API_KEY` | Dashboard do provedor de email | `send-support-email`, `send-bulk-emails`, `send-contract-email`, `resend-ticket-email` |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | `ia-resposta-medico`, `revisar-mensagem`, `parse-medico-data`, `process-doctor-document` |
| `EVOLUTION_API_URL` | Config da instância Evolution | `evolution-api-proxy`, `send-whatsapp`, `send-sigzap-message` |
| `EVOLUTION_API_KEY` | Config da instância Evolution | Mesmos acima |
| `LOVABLE_API_KEY` | Pedir ao Lovable para configurar | Funcionalidades internas do Lovable |

**Nota**: O Lovable Cloud não expõe secrets já salvas. Se não tiver anotado, gere novas nos dashboards dos provedores.

---

## 2. N8N WEBHOOKS — URLs para atualizar

### 2.1 URLs que o N8N ENVIA para o Sigma (atualizar nos workflows do N8N)

Substituir `qyapnxtghhdcfafnogii` por `zupsbgtoeoixfokzkjro` em todos os webhooks:

| Workflow N8N | URL Antiga | URL Nova |
|-------------|-----------|----------|
| Disparos callback | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/disparos-callback` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/disparos-callback` |
| Licitações API | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/api-licitacoes` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/api-licitacoes` |
| WhatsApp messages | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/receive-whatsapp-messages` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/receive-whatsapp-messages` |
| WhatsApp events | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/receive-whatsapp-events` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/receive-whatsapp-events` |
| Email status | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/email-status-callback` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/email-status-callback` |
| Support email reply | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/receive-support-email-reply` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/receive-support-email-reply` |
| Escalas API | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/escalas-api` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/escalas-api` |
| DR Escala sync | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/drescala-sync` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/drescala-sync` |
| DR Escala BI | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/drescala-bi` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/drescala-bi` |
| Disparo email reply | `https://qyapnxtghhdcfafnogii.supabase.co/functions/v1/receive-disparo-email-reply` | `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/receive-disparo-email-reply` |

**IMPORTANTE**: Também atualizar a **Service Role Key** nos headers de autenticação (Bearer token) dos workflows N8N. A nova key está em:
Dashboard → Project Settings → API → `service_role` key

### 2.2 URLs que o Sigma ENVIA para o N8N (já estão no banco)

Estas URLs estão armazenadas nas tabelas e **não precisam mudar** (apontam para o N8N, não para o Supabase):

| Tabela | Chave | Verificar se foi importado |
|--------|-------|---------------------------|
| `config_lista_items` | `n8n_disparos_webhook_url` | `SELECT * FROM config_lista_items WHERE campo_nome = 'n8n_disparos_webhook_url';` |
| `supabase_config` | `licitacao_webhook_url` | `SELECT * FROM supabase_config WHERE chave = 'licitacao_webhook_url';` |
| `supabase_config` | `licitacao_webhook_by_id_url` | `SELECT * FROM supabase_config WHERE chave = 'licitacao_webhook_by_id_url';` |

---

## 3. INTEGRAÇÕES EXTERNAS

### Evolution API (WhatsApp)
- Atualizar webhook URLs na configuração da instância Evolution para apontar para o novo Supabase
- URLs: `receive-whatsapp-messages`, `receive-whatsapp-events`, `receber_mensagem_whatsapp`

### Effect ERP
- Atualizar endpoint que envia dados de licitações para `api-licitacoes`

### D Rescala
- Atualizar URLs de `drescala-sync` e `drescala-bi`

### Email Provider (Resend/SendGrid)
- Atualizar webhook de delivery status para `email-status-callback`
- Atualizar webhook de reply para `receive-support-email-reply`

### Escalas API
- Atualizar tokens em `escalas_api_tokens` se necessário

---

## 4. AUTH — Configuração de URLs

No Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: Configurar o domínio de produção
- **Redirect URLs**: Adicionar `https://seu-dominio.com/*`

---

## 5. STORAGE — MIGRADO ✅

Arquivos migrados do storage antigo para o novo (2026-04-05):

| Bucket | Migrados | Status |
|--------|----------|--------|
| licitacoes-anexos | 2305 | ✅ Público |
| lead-anexos | 1630 | ✅ Público (resto são Google Drive links) |
| ages-documentos | 103 | ✅ Público |
| contratos-documentos | 399 | ✅ Migrado (era privado) |
| medicos-documentos | 354 | ✅ Migrado (era privado) |
| **Total** | **4491** | **Independente do projeto antigo** |

URLs no banco estão como paths relativos — o sistema usa o storage novo automaticamente.

---

## 6. SENHAS DOS USUÁRIOS

Os 36 usuários foram importados com senha temporária. Eles precisarão usar **"Esqueci minha senha"** para definir uma nova senha, OU o admin pode redefinir via Dashboard → Authentication → Users.

---

## 7. DADOS PENDENTES

### ~1.500 leads faltantes
- Causa: `chave_unica` duplicada no CSV
- Solução: `DROP INDEX idx_leads_chave_unica;` → reimportar CSV → recriar index
- Impacto: baixo, são registros duplicados

### ~2.500 sigzap_messages faltantes
- Causa: payload JSON muito grande (>1MB por mensagem)
- Solução: importar individualmente via SQL Editor ou ignorar (são mensagens com mídia grande)
- Impacto: baixo, histórico de mensagens

---

## 8. CHECKLIST DE TESTES

- [ ] Login funciona (testar com raul.sxs27@gmail.com)
- [ ] Perfis carregam corretamente
- [ ] Leads: listagem, criação, edição
- [ ] Licitações: kanban, detalhes, anexos
- [ ] Contratos: listagem, detalhes
- [ ] Médicos: listagem, documentos
- [ ] Disparos: campanhas, envio (testar com N8N)
- [ ] SigZap: mensagens WhatsApp
- [ ] Escalas: dados carregam
- [ ] Radiologia: pendências
- [ ] Comunicação interna: canais, mensagens
- [ ] Suporte: tickets
- [ ] Edge functions respondem (testar pelo menos 3-4 principais)
- [ ] Storage: upload/download de arquivos

---

## Projeto Antigo (Backup)
- **NÃO DELETAR** até confirmar que tudo funciona
- Manter por pelo menos 1 semana de operação paralela
- Supabase Cloud antigo: `qyapnxtghhdcfafnogii`
