

## Validação dos números do BI Prospec — fechamento

### Estado atual (confirmado em produção)

A RPC `get_bi_prospec_dashboard` está criada e **os números batem com a realidade**:

| KPI | SQL bruto | RPC | Status |
|---|---|---|---|
| Disparos em massa enviados (`status='4-ENVIADO'`) | 2.921 | 2.921 | ✅ |
| Total massa (incluindo fila/falhas) — antigo KPI inflado | 6.246 | separado em sub-métricas | ✅ |
| Conversões (`leads.data_conversao`) | 631 | 631 | ✅ |
| Disparos manuais | 0 | 0 | ✅ (tabela vazia) |
| Emails | 0 | 0 | ✅ (tabela vazia) |
| Permissão RLS | bloqueia sem `captacao.view` | retorna 42501 → toast explícito | ✅ |

Frontend já refatorado: 1 chamada RPC em vez de 9 queries; payload caiu de ~50MB para alguns KB.

### Ajustes finais propostos (3 itens curtos)

**1. Mostrar a granularidade do KPI "Em Massa"**
Hoje o card mostra só `2.921`. Adicionar abaixo dele uma linha pequena com:
`2.921 enviados · 2.753 na fila · 440 sem WhatsApp · 127 bloqueadas`
(dados já vêm em `totais.massa_fila`, `massa_nozap`, `massa_bloqueadas` via RPC).

**2. "Sem dados no período" para canais zerados**
Quando `totais.emails_enviados === 0` e `totais.instagram_enviados === 0`, substituir o gráfico vazio por uma mensagem discreta `"Canal ainda não tem dados no período"` em vez de renderizar barras zeradas (que confundem).

**3. Header com timestamp + remoção do `fetchAllChunks` morto**
- Adicionar no header: `Última atualização: HH:mm` (`dataUpdatedAt` do React Query) + botão "Atualizar".
- Remover a função `fetchAllChunks` (linhas 47–95) e o `chunkSize=1000` que não é mais usada para os KPIs principais. Manter só se usada em drill-down.

### Arquivos afetados

- `src/components/bi/AbaProspec.tsx` — apenas UI (3 trechos pequenos), nenhuma migration nova.

### O que NÃO precisa ser feito

- Migration: a RPC `get_bi_prospec_dashboard`, views agregadas e índices já estão no banco e validados.
- Refatoração das queries: já feita.
- Tratamento de 403: já implementado (toast + estado `semPermissao`).

