## Endpoint GET `/instances-status` para relatório n8n

Criar um edge function público (autenticado por token) que retorna o status atual de todas as instâncias/chips + métricas de disparos, para o n8n consumir 2x/dia e montar o relatório.

### 1. Edge function `supabase/functions/chips-status-report/index.ts`

- `verify_jwt = false` (chamado pelo n8n)
- Autenticação via header `Authorization: Bearer <token>` validando contra `public.api_tokens` (`ativo=true`, respeitando `expires_at`), mesmo padrão já usado em `api-licitacoes`
- Atualiza `last_used_at` do token
- CORS liberado

**Query params opcionais:**
- `since` (ISO date) — janela para métricas de disparos. Default: início do dia atual (America/Sao_Paulo).
- `until` (ISO date) — default: `now()`.

**Resposta JSON:**
```json
{
  "generated_at": "2026-07-02T12:00:00Z",
  "window": { "since": "...", "until": "..." },
  "resumo": {
    "total": 20,
    "conectados": 15,        // connection_state = 'open'
    "conectando": 1,
    "caidos": 4,             // connection_state = 'close'
    "usaveis": 14,           // usavel = true (da vw_chip_saude)
    "quedas_no_periodo": 3,  // chips com ultima_queda dentro da janela
    "reconectados_no_periodo": 2  // chip_auto_reconnect_log dentro da janela
  },
  "disparos": {
    "total": 1234,           // count chip_send_log sent_at na janela
    "sucesso": 1200,         // status='success'
    "falha": 34,
    "por_chip": [ { "chip_id": "...", "nome": "...", "enviados": 120, "falhas": 2 } ]
  },
  "instancias": [
    {
      "id": "...",
      "nome": "prospec-raul-9001",
      "numero": "...",
      "provedor": "uazapi",
      "categoria_uso": "prospec",
      "connection_state": "open",
      "usavel": true,
      "pode_disparar": true,
      "estado_desde": "...",
      "ultima_queda": "...",
      "quedas_24h": 0,
      "health": 95,
      "disparos_periodo": 120,
      "falhas_periodo": 2
    }
  ]
}
```

**Fontes de dados:**
- `vw_chip_saude` — snapshot atual (já usado na página)
- `chip_send_log` agregado por `chip_id` e por status na janela
- `chip_auto_reconnect_log` para "reconectados no período"

### 2. Como o n8n usa

- **Manhã (~08:00):** GET sem `since` → status atual + disparos zerados. Reporta "X conectados, Y caídos".
- **Fim do dia (~18:00):** GET com `since=<início do dia>` → mostra quedas, reconexões e volume de disparos do dia.

Token gerado manualmente via SQL em `api_tokens` (o usuário já tem esse padrão).

### 3. Sem alterações de schema

Todas as tabelas/views necessárias já existem. Nada de migração.

### Detalhes técnicos

- Uso de `SUPABASE_SERVICE_ROLE_KEY` internamente para acesso agregado (o endpoint é protegido pelo bearer token próprio).
- Validação de query params com Zod.
- Erros: 401 (sem/token inválido), 400 (params inválidos), 500 (erro interno) — todos com CORS.
