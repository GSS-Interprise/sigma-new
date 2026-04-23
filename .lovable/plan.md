

## Rastreabilidade de autoria em disparos e raias

### Problema

Hoje só conseguimos saber **quem disparou** em parte das tabelas:

| Tabela | Campo de autor | Situação |
|---|---|---|
| `disparos_campanhas` (massa) | `responsavel_id`, `responsavel_nome` | ✅ 108/108 preenchidos |
| `disparos_log` (histórico massa/email) | `usuario_id`, `usuario_nome` | ✅ preenchido |
| `disparo_manual_envios` | `enviado_por` | ⚠️ existe, mas 0 registros — edge function grava `user.id`, ok daqui pra frente |
| `campanha_proposta_lead_canais` (raias / cascata) | `criado_por` | ❌ 172 registros, **0 com autor** — RPCs de transferência/avanço de raia não passam o `auth.uid()` |
| `disparos_contatos` (linha-a-linha do disparo em massa) | — | ❌ não existe campo de autor; herda da campanha |
| `lead_historico` | `usuario_id` (em metadados) | ⚠️ inconsistente entre fontes |

Sem essa autoria não conseguimos responder: **"quem disparou mais essa semana?", "quem converte mais médicos?", "quem mantém prazos por raia?"**.

### Plano

**1. Schema — preencher lacunas de autoria**

Migration única adicionando colunas onde faltam e índices p/ ranking:

```sql
-- Raia: já existe criado_por, adicionar quem MOVEU/FECHOU
ALTER TABLE campanha_proposta_lead_canais
  ADD COLUMN movido_por uuid,           -- quem tirou da raia
  ADD COLUMN motivo_movimentacao text;  -- transferencia|avanco_fase|fechamento

-- Disparo em massa: autor do envio individual (para casos de reprocesso por outro user)
ALTER TABLE disparos_contatos
  ADD COLUMN disparado_por uuid;        -- preenchido pelo processor/callback

-- Índices para os rankings
CREATE INDEX ON disparo_manual_envios (enviado_por, created_at DESC);
CREATE INDEX ON disparos_campanhas (responsavel_id, created_at DESC);
CREATE INDEX ON campanha_proposta_lead_canais (criado_por, entrou_em DESC);
CREATE INDEX ON campanha_proposta_lead_canais (movido_por, saiu_em DESC) WHERE saiu_em IS NOT NULL;
```

**2. Backend — passar `auth.uid()` em todas as RPCs/edge functions de raia**

- RPCs `transferir_leads_canal`, `fechar_leads_canal`, `enviar_proxima_fase` (chamadas em `useLeadCanais.ts`): receber `_movido_por uuid default auth.uid()` e gravar em `movido_por` ao fechar a raia atual + `criado_por = auth.uid()` ao abrir a próxima.
- `campanha-disparo-processor`: ao escrever em `disparos_contatos`, copiar `responsavel_id` da campanha em `disparado_por`.
- `send-disparo-manual`: já grava `enviado_por` — ok.

**3. View consolidada de produtividade por usuário**

```sql
CREATE OR REPLACE VIEW vw_produtividade_disparos AS
SELECT
  p.id as user_id, p.nome_completo,
  -- volumes
  count(DISTINCT dc.id) FILTER (WHERE dc.responsavel_id = p.id) as campanhas_criadas,
  coalesce(sum(dc.enviados) FILTER (WHERE dc.responsavel_id = p.id), 0) as massa_enviados,
  count(dme.id) FILTER (WHERE dme.enviado_por = p.id AND dme.status='enviado') as manuais_enviados,
  -- raias
  count(cplc.id) FILTER (WHERE cplc.criado_por = p.id) as raias_abertas,
  count(cplc.id) FILTER (WHERE cplc.movido_por = p.id) as raias_movidas,
  -- conversão (lead que virou médico ativo após disparo do user)
  count(DISTINCT l.id) FILTER (WHERE l.status='convertido' 
        AND (dme.enviado_por = p.id OR dc.responsavel_id = p.id)) as conversoes
FROM profiles p
LEFT JOIN disparos_campanhas dc ON dc.responsavel_id = p.id
LEFT JOIN disparo_manual_envios dme ON dme.enviado_por = p.id
LEFT JOIN campanha_proposta_lead_canais cplc ON cplc.criado_por = p.id OR cplc.movido_por = p.id
LEFT JOIN leads l ON l.id IN (dme.lead_id, cplc.lead_id)
GROUP BY p.id, p.nome_completo;
```

E uma RPC `get_ranking_disparos(periodo, metric)` para o BI consumir com filtro `semana|mes|total` e ordenação por `enviados | conversao | sla_raia`.

**4. UI — Ranking expandido em `DisparosZapRanking` + nova aba no BI Prospec**

- Estender `DisparosZapRanking.tsx` para incluir colunas: **manuais enviados**, **raias movidas**, **conversões**, **SLA médio por raia** (usando `vw_lead_tempo_por_canal`).
- Adicionar widget em `AbaProspec` (BI) com top 5 por: volume, conversão, SLA cumprido. Drill-down por usuário mostra raias estouradas (`saiu_em - entrou_em > sla_max`).

**5. SLA por raia (prazo a ser configurado depois)**

Já preparar a tabela:

```sql
CREATE TABLE raia_sla_config (
  canal text PRIMARY KEY,                    -- whatsapp, email, ligacao...
  prazo_horas int NOT NULL,
  acao_estouro text DEFAULT 'notificar'      -- notificar|auto_avancar
);
```

A view de ranking calcula `sla_cumprido = (duracao_segundos/3600) <= prazo_horas`. Configuração de prazos vem em PR seguinte (UI admin).

### Arquivos afetados

- **Migration nova** (schema + view + tabela `raia_sla_config`)
- `supabase/functions/campanha-disparo-processor/index.ts` — gravar `disparado_por`
- RPCs `transferir_leads_canal`, `fechar_leads_canal`, `enviar_proxima_fase` — gravar `movido_por`/`criado_por`
- `src/hooks/useLeadCanais.ts` — passar `_movido_por: (await supabase.auth.getUser()).data.user?.id`
- `src/components/disparos/DisparosZapRanking.tsx` — novas colunas
- `src/components/bi/AbaProspec.tsx` — widget de produtividade

### Histórico retroativo

Os 172 registros sem `criado_por` em `campanha_proposta_lead_canais` ficarão como **"Sistema/Histórico"**. Não há fonte confiável para inferir o autor passado — backfill só onde `lead_historico` referencia o evento (best-effort, opcional).

### Não está incluso

- Definir os valores de prazo por raia (aguardando seu input em PR seguinte).
- Dashboard externo / export — pode ser adicionado consumindo a mesma view.

