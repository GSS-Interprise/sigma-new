# Runbook de validação controlada do disparo GSS

Este runbook valida a saúde do caminho sem chamar o provedor de WhatsApp e sem
reservar leads. A tarefa de investigação não deve inserir uma execução em
`campanha_dispatch_one_shots` nem publicar código.

## 1. Pré-checagem sem envio

No terminal, executar apenas chamadas sem autorização de envio:

```bash
curl -i https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/campanha-disparo-scheduler
curl -i https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/campanha-disparo-burst
curl -i -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' \
  https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/campanha-disparo-scheduler
curl -i -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' \
  https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/campanha-disparo-burst
```

O resultado esperado é `405 method_not_allowed` nos dois `GETs` e `401
unauthorized` nos dois `POSTs`. Qualquer `2xx` sem autenticação é falha de
segurança; qualquer erro `500` indica dependência de runtime/configuração a
corrigir antes de pensar em leads.

## 2. Conferência autenticada, somente leitura

No SQL Editor, com usuário autorizado, conferir:

```sql
select id, nome, status, tipo_envio, whatsapp_provider,
       official_sender_id, official_template_id, next_batch_at
from public.campanhas
where tipo_campanha = 'prospeccao'
order by updated_at desc;

select started_at, finished_at, status, campaigns_seen,
       campaigns_triggered, sent, failed, error_message
from public.campanha_dispatch_scheduler_runs
order by started_at desc
limit 10;

select created_at, run_at, status, max_contacts,
       attempted_count, sent_count, failed_count, last_error
from public.campanha_dispatch_one_shots
order by created_at desc
limit 10;
```

A campanha GSS deve estar `ativa`, ser `chakra`/`twilio`, ter remetente e
template aprovados e aparecer nos históricos do scheduler. Se o histórico
mostrar `failed`, usar `error_message`/`last_error`; não repetir a execução.

## 3. Teste de envio autorizado (fora desta tarefa)

Só depois de o Raul aprovar explicitamente o canário, usar uma campanha
separada ou uma lista com um único destinatário autorizado. Criar uma execução
com `max_contacts = 1`, conferir o `run_at` e acompanhar a linha pelo SQL acima.
Nunca usar `max_contacts` 250/500 como primeiro teste. O scheduler agora exclui
uma campanha com one-shot vencido da seleção recorrente no mesmo minuto, e o
burst encerra a execução com contadores auditáveis.

Se o canário falhar, manter a campanha pausada, guardar o erro do provedor e
corrigir a dependência (remetente/template/WABA/credencial) antes de ampliar.
Não retentar automaticamente erros de elegibilidade ou pagamento da Meta.
