## Objetivo

Usar o Resend como provedor de envio de email para o digest diário de demandas (e demais alertas futuros), no lugar da infraestrutura Lovable Emails que exige verificação de domínio pendente.

## Etapas

1. **Conectar o connector Resend** ao projeto via `standard_connectors--connect`. Isso disponibiliza `LOVABLE_API_KEY` + `RESEND_API_KEY` como variáveis de ambiente nas Edge Functions, sem precisar criar/colar chave manualmente.

2. **Criar Edge Function `send-email-resend`** — wrapper genérico que recebe `{ to, subject, html, text? }` e envia via gateway do Resend (`https://connector-gateway.lovable.dev/resend/emails`). Inclui validação Zod, CORS e tratamento de erro. Servirá para qualquer envio transacional do app.

3. **Plugar no `demandas-deadline-alerter`** — após montar o digest por usuário, buscar o email do usuário em `profiles` e chamar `send-email-resend` com um HTML estilizado contendo:
   - Lista de demandas atrasadas (destaque vermelho)
   - Lista de demandas que vencem hoje / em 1 dia / em 2 dias
   - Link direto para `/demandas`
   - Mantém a notificação in-app (`system_notifications`) que já existe.

4. **Domínio do remetente** — usar `onboarding@resend.dev` inicialmente (funciona sem verificação, ideal para testes). Quando o usuário verificar `gestaoservicosaude.com.br` no painel Resend, basta trocar o `from` para `Sigma <demandas@gestaoservicosaude.com.br>`.

5. **Teste manual** — após deploy, invocar `demandas-deadline-alerter` manualmente uma vez para validar o envio antes do cron das 08h disparar.

## Detalhes técnicos

- Endpoint: `POST https://connector-gateway.lovable.dev/resend/emails`
- Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${RESEND_API_KEY}`
- O cron pg_cron diário já está agendado e não precisa mudar.
- A função `demandas-deadline-alerter` já agrupa demandas por usuário em buckets (Atrasadas / Vence hoje / 1 dia / 2 dias) — basta consumir esse agrupamento para o corpo do email.
- Sem nova migração de banco.

## Limitação

Com `onboarding@resend.dev`, o Resend só permite enviar para o email cadastrado na conta Resend até o domínio ser verificado. Para enviar a todos os usuários, será necessário verificar `gestaoservicosaude.com.br` no painel do Resend (https://resend.com/domains) — posso instruir os DNS records assim que estivermos nessa etapa.
