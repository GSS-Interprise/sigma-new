

# Auditoria profunda do BI Prospec — diagnóstico e plano de melhoria

## 1. Diagnóstico (dados x realidade)

Rodei contagens diretas no banco para o período padrão da tela (últimos 5 meses, desde 2025-11-01) e comparei com o que o BI exibe.

| Métrica | Realidade (banco) | O que o BI mostra hoje | Diagnóstico |
|---|---|---|---|
| Disparos manuais | **0 registros** (tabela `disparo_manual_envios` está vazia, lifetime = 0) | "Manual" = qualquer coisa | A query é bloqueada por **RLS 403** para a maioria dos usuários (`enviado_por = auth.uid()` ou permissão `captacao.view`). Se o usuário não tiver permissão, retorna erro silencioso e KPI fica 0 — o que parece "bug", mas é permissão. |
| Disparos em massa (`disparos_contatos`) | 6.246 contatos no período, mas **só 2.920 efetivamente enviados** (`status='4-ENVIADO'`); 2.753 ainda em `1-ENVIAR` (fila), 440 `5-NOZAP`, 127 `6-BLOQUEADORA` | Conta **todos os 6.246** como "disparos em massa" | **Erro de definição**: o KPI infla em ~114%. Lista de 2 mil leads ≠ 2 mil disparos. Precisa filtrar por `status='4-ENVIADO'` e usar `data_envio`, não `created_at`. |
| Tráfego pago (`vw_trafego_pago_funil`) | **0 envios reais** (`trafego_pago_envios` está vazia, view tem 1 linha vazia) | 0 — correto, mas pelos motivos errados | A view existe mas não há dados; a tela também sofre **403 RLS** intermitente. |
| Emails (`email_interacoes`) | **0 registros lifetime** | 0 | Correto — mas o canal é exibido como se existisse. |
| Canais de proposta | 172 linhas, **todas `canal=whatsapp` / `status_final=aberto`** | Soma como "instagram", "respondidos", "convertidos" | **Erro de mapeamento**: nenhum lead tem `status_final='respondeu'`, `'convertido'` ou `canal='instagram'` no banco. As métricas "Responderam por canal" e "Instagram" sempre serão 0. |
| Leads convertidos (`leads.data_conversao`) | **631 no período** | Conta separadamente e por colaborador | OK, mas é o único número confiável da tela. |
| `vw_campanha_metricas` | só 2 campanhas no período | mostra 2 | OK |

### Bugs estruturais encontrados

1. **`disparo_manual_envios` query pede `created_at,status` mas o cálculo `porEspecialidade` usa `d.lead_id`** — campo nunca selecionado, então o agrupamento por especialidade dos manuais é sempre 0.
2. **`disparos_contatos` idem**: select pede `data_envio,status,campanha_id,created_at`, mas o código lê `d.lead_id` em `porEspecialidade` e `metricasPorCanal.whatsapp` — campo nunca trazido. Resultado: WhatsApp por especialidade fica zerado mesmo havendo 2.920 envios reais.
3. **Filtro de leads por `created_at`**: `leadsAll` só traz leads criados no período. Um disparo feito hoje para um lead criado em 2024 aparece sem especialidade ("Sem especialidade"), distorcendo o gráfico por especialidade.
4. **Filtro 403 (RLS)** cai silencioso e a tela mostra "0" sem aviso. O usuário acha que é bug.
5. **Cálculo de "Mix por tipo"** soma `disparosMassa.length` (inclui falhas, fila, bloqueados) com `manuais.length` (que é 0 por RLS) — total inflado e enganoso.
6. **Volume baixado é gigantesco**: `leads` baixa **167.543 linhas** (`SELECT id, especialidade, convertido_por, data_conversao, status, created_at`) só para construir um Map de especialidade. ~30-50 MB no navegador.
7. **N+1 mascarado**: `campanhasMetricas` faz `vw_campanha_metricas` → `campanha_propostas` → `campanha_proposta_lead_canais` no client, mesclando manualmente. Deveria ser uma view.
8. **Sem RPC/SQL agregado**: tudo é trazido linha-a-linha (chunks de 1.000) e somado em JS.

---

## 2. Plano de melhoria (em 3 frentes)

### Frente A — Corrigir números (fidelidade aos dados)

1. **`disparos_contatos`**: filtrar por `status='4-ENVIADO'` e usar `data_envio` (não `created_at`) como timestamp do disparo. Adicionar campos extras (enviados / falhas / fila) como sub-métricas.
2. **`disparo_manual_envios`**: incluir `lead_id` no `select`, e tratar 403 com mensagem explícita ("Sem permissão para ver disparos manuais — peça acesso à equipe de Captação"), em vez de mostrar 0.
3. **`disparos_contatos`**: incluir `lead_id` no `select` (já existe a coluna) — destrava agrupamento por especialidade do WhatsApp.
4. **Leads sem filtro de período**: para o mapa `lead → especialidade`, buscar **somente os IDs que aparecem nos disparos do período** (set de UUIDs) e usar `.in('id', ids)`. Cai de 167k para algumas centenas.
5. **`status_final` e `canal`**: adicionar legenda "ainda não há dados" quando o canal estiver zerado em vez de mostrar gráfico vazio.
6. **Mix por tipo**: separar "enviados" (sucesso) de "tentativas" (total). Mostrar dois números por canal.
7. **Tráfego pago**: quando `vw_trafego_pago_funil` retorna linhas com `total_enviados=0`, suprimi-las do KPI.

### Frente B — Reduzir payload (apenas fields necessários)

Hoje cada query baixa centenas de KB ou MB. Trocar por:

| Query | Hoje | Proposto |
|---|---|---|
| `leads` | `id, especialidade, convertido_por, data_conversao, status, created_at` (167k linhas) | RPC server-side: `get_bi_prospec_leads_aggregate(p_inicio, p_fim)` retornando já agrupado por especialidade |
| `disparos_contatos` | `data_envio,status,campanha_id,created_at` (6k linhas) | RPC: `get_bi_prospec_disparos_massa(p_inicio, p_fim)` retornando agregado mensal + por especialidade + por status |
| `disparo_manual_envios` | linhas brutas | RPC: `get_bi_prospec_disparos_manuais(p_inicio, p_fim)` (com filtro de RLS embutido) |
| `email_interacoes` | linhas brutas | RPC: `get_bi_prospec_emails(p_inicio, p_fim)` |
| `campanha_proposta_lead_canais` | linhas brutas | RPC: `get_bi_prospec_canais(p_inicio, p_fim)` |
| `vw_campanha_metricas` + `campanha_propostas` + `campanha_proposta_lead_canais` (3 queries + merge JS) | substituir por uma única view `vw_bi_prospec_campanhas` |

**Resultado esperado**: payload total cai de ~5-50 MB para ~5-50 KB. Tempo de render cai de 5-15s para <1s.

### Frente C — Arquitetura

1. Criar **uma RPC única** `get_bi_prospec_dashboard(p_inicio, p_fim)` que retorna um JSON com todos os KPIs prontos:
   ```
   {
     totais: { manuais, massa_enviados, massa_falhas, massa_fila, trafego, emails, instagram },
     por_especialidade: [...],
     por_canal: {...},
     por_colaborador: [...],
     evolucao_mensal: [...],
     motivos_nao_conversao: [...]
   }
   ```
2. Centralizar lógica de "o que conta como envio" no SQL (uma única definição de verdade).
3. Adicionar **cache `staleTime: 60000`** no React Query para o dashboard inteiro.
4. Adicionar **toast de erro 403** explícito quando RLS bloqueia, em vez de fallback silencioso para 0.
5. Adicionar **badge "Ao vivo" / "Última atualização: HH:mm"** no header.

---

## 3. Detalhamento técnico (entregáveis concretos)

**Migration SQL** (cria infra de agregação):
- `CREATE OR REPLACE VIEW vw_bi_prospec_disparos_massa` — já agregado por mês/status/especialidade (join `disparos_contatos` ↔ `leads`).
- `CREATE OR REPLACE VIEW vw_bi_prospec_disparos_manuais` — idem.
- `CREATE OR REPLACE FUNCTION get_bi_prospec_dashboard(p_inicio timestamptz, p_fim timestamptz) RETURNS jsonb` — `SECURITY DEFINER`, com checagem de permissão `has_permission(auth.uid(), 'bi', 'view') OR is_admin(auth.uid())`. Devolve o JSON completo.
- Index sugeridos: `disparos_contatos(status, data_envio)`, `disparo_manual_envios(created_at, lead_id)`, `email_interacoes(created_at, direcao, lead_id)`.

**Frontend** (`AbaProspec.tsx`):
- Substituir as 9 queries `useQuery` por **uma só** chamando `supabase.rpc('get_bi_prospec_dashboard', { p_inicio, p_fim })`.
- Remover `fetchAllChunks` para essas tabelas (deixar só para drill-down sob demanda).
- Adicionar separação clara nos KPIs: "Disparos em massa: 2.920 enviados / 2.753 fila / 440 sem WhatsApp / 127 bloqueadora".
- Mostrar mensagem "Sem dados no período" para canais zerados em vez de gráfico vazio.
- Tratar 403 com `toast` e KPI marcado com cadeado.

**Validação**:
- Após implementar, criar query de validação: `SELECT * FROM get_bi_prospec_dashboard(...)` e comparar com SQL bruto. Documentar valores esperados em `docs/bi-prospec-validacao.md`.

---

## 4. Ordem de execução proposta

1. (Migration) Views agregadas + RPC `get_bi_prospec_dashboard`.
2. (Frontend) Refatorar `AbaProspec.tsx` para usar só a RPC.
3. (Frontend) Tratar 403 e mensagens "sem dados".
4. (QA) Comparar números com SQL direto e ajustar.

