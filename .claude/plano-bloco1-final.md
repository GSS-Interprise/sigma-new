# Plano de Finalização — Bloco 1: Máquina de Disparo

## Contexto

CRM SigmaGSS de prospecção médica. O objetivo é ter todos os médicos do CFM (~580k) no sistema, com especialidades enriquecidas, e segmentação precisa para campanhas de disparo (WhatsApp/Email).

**Bloco 1** precisa ser finalizado para emissão da primeira NF. Restam 3 entregas.

**Banco**: Supabase PostgreSQL 17 (plano LARGE, 8GB RAM). Atualmente ~107k leads ativos, 848 MB total.

**Stack frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn-ui

**Supabase URL**: `https://zupsbgtoeoixfokzkjro.supabase.co`

---

## Entrega 1: Reestruturação de Especialidades

### Problema atual

- Campo `leads.especialidade` (texto livre) tem 73 variações para ~57 especialidades reais
- Duplicatas: "Pediatria" / "PEDIATRIA" / "Pediatra" / "Residente de Pediatria"
- Apenas 27% dos leads (29.417) têm `especialidade_id` normalizado
- 40% (43.127) têm texto livre sem FK
- **60% (63.977) não têm especialidade nenhuma**
- O módulo de disparos (`DisparosImportDialog.tsx`) filtra por texto livre, não pelo ID normalizado
- Um médico pode ter 2-4 RQEs (especialidades), mas o sistema guarda apenas 1

### Solução: Junction Table + Limpeza

#### Passo 1: Limpar tabela `especialidades`

A tabela atual tem ~57 registros com lixo e duplicatas.

**Ações no banco (SQL)**:
1. Remover registros lixo (ex: "WEFGSDFGSDFGSDFG")
2. Consolidar duplicatas com UPDATE nos leads que referenciam IDs antigos:
   - "PEDIATRIA" + "Pediatra" + "Pediatria" → 1 registro "Pediatria"
   - "Radiologia e Diagnóstico por Imagem" + "RADIOLOGIA" + "Radiologista" + "radiologia" → 1 registro
   - "Clínica Médica" + "CLÍNICO GERAL" + "Clínica médica" → 1 registro
   - "Anestesiologista" + "Anestesiologia" → 1 registro
   - E assim por diante
3. Adicionar colunas à tabela `especialidades`:
   - `codigo_cfm` (TEXT) — código oficial CFM quando disponível
   - `area` (TEXT) — 'cirurgica', 'clinica', 'diagnostica', 'apoio'
   - `aliases` (TEXT[]) — nomes alternativos para matching automático

**Resultado esperado**: ~55 especialidades limpas, cada uma com aliases para normalização automática.

#### Passo 2: Criar tabela `lead_especialidades` (junction)

```sql
CREATE TABLE lead_especialidades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  especialidade_id UUID NOT NULL REFERENCES especialidades(id),
  rqe TEXT,                    -- Registro de Qualificação de Especialista
  fonte TEXT DEFAULT 'import', -- 'cfm', 'lifehub', 'import', 'manual', 'enrich'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, especialidade_id)
);

CREATE INDEX idx_lead_esp_lead ON lead_especialidades(lead_id);
CREATE INDEX idx_lead_esp_esp ON lead_especialidades(especialidade_id);
```

Habilitar RLS com as mesmas policies da tabela leads.

#### Passo 3: Migrar dados existentes para junction

Script SQL que:
1. Para leads com `especialidade_id` preenchido → INSERT em `lead_especialidades`
2. Para leads com `especialidade` (texto) mas sem ID → fazer lookup fuzzy na tabela `especialidades` (usando aliases) → INSERT em `lead_especialidades`
3. Manter campos antigos (`especialidade`, `especialidade_id`) intactos por retrocompatibilidade (deprecar gradualmente)

#### Passo 4: Função de normalização automática

```sql
CREATE OR REPLACE FUNCTION normalizar_especialidade(p_texto TEXT)
RETURNS UUID AS $$
  -- Busca por nome exato, depois por alias (case-insensitive, sem acentos)
  -- Retorna especialidade_id ou NULL se não encontrar
$$;
```

Trigger `BEFORE INSERT OR UPDATE` em `lead_especialidades` que normaliza o texto.

#### Passo 5: Atualizar frontend

**Arquivos a modificar:**

1. **`src/hooks/useLeadsPaginated.ts`** (linhas 60, 102-104)
   - Alterar SELECT para fazer JOIN com `lead_especialidades` em vez de FK direta
   - Filtro: `lead_especialidades.especialidade_id IN (...)`

2. **`src/components/disparos/DisparosImportDialog.tsx`** (linhas 195-214, 293-295)
   - Trocar query de `leads.especialidade` (texto) para `lead_especialidades` (junction)
   - O dropdown de especialidades deve vir da tabela `especialidades` (não de DISTINCT do campo texto)

3. **`src/components/medicos/LeadsTab.tsx`** (linhas 515-528, 602)
   - Exibir todas as especialidades do lead (pode ter mais de 1)
   - Filtro já usa `especialidade_id` — adaptar para junction

4. **`src/components/medicos/EspecialidadeMultiSelect.tsx`**
   - Substituir array hardcoded `ESPECIALIDADES_MEDICAS[]` por query da tabela `especialidades`
   - Permitir seleção múltipla (já é multi-select)

5. **`src/hooks/useLeadsFilterCounts.ts`** / RPC `get_leads_filter_counts()`
   - Atualizar para contar via junction table

6. **`src/components/medicos/LeadDialog.tsx`**
   - Exibir especialidades do lead como chips/tags
   - Permitir adicionar/remover especialidades

**Arquivos de edge functions a atualizar:**

7. **`supabase/functions/import-leads/index.ts`** (linhas 83, 101, 267-295)
   - Ao importar lead com `especialidades_crua`, fazer lookup + INSERT em `lead_especialidades`
   - Se não encontrar match, logar para revisão (não perder o dado)

8. **`supabase/functions/enrich-lead/index.ts`** (linhas 18, 111)
   - Ao enriquecer, popular `lead_especialidades` (não apenas `especialidade_id`)

9. **`supabase/functions/import-leads-excel/index.ts`** (linha 196)
   - Mesma lógica do import-leads

### Critério de aceite
- [ ] Tabela `especialidades` limpa, sem duplicatas, com aliases
- [ ] Junction table `lead_especialidades` criada e populada
- [ ] Disparos filtram por junction table (multi-especialidade)
- [ ] Leads podem ter múltiplas especialidades
- [ ] Import de leads popula junction automaticamente
- [ ] Tela de leads exibe todas as especialidades do lead

---

## Entrega 2: Blacklist Inteligente + Banco de Desinteresse

### Problema atual

- Blacklist permanente (`blacklist`) existe por telefone — OK para corpo clínico
- Bloqueio temporário (`leads_bloqueio_temporario`) existe mas:
  - **Bug**: `AbaDisparos.tsx` NÃO filtra por bloqueio temporário (só `DisparosImportDialog.tsx` filtra)
  - Não tem categorização (motivo genérico)
  - Não distingue "desinteresse" de "bloqueio técnico"
- Não existe "banco de desinteresse" formal
- Status do lead é inconsistente: `descartados` vs `Descartado`, `em_conversa` vs padrão CamelCase
- Leads com status `Descartado` continuam aparecendo nas listas (só `Convertido` é excluído dos disparos)

### Solução

#### Passo 1: Corrigir bug do bloqueio no disparo simples

**Arquivo**: `src/components/disparos/AbaDisparos.tsx` (linhas 80-163)

Adicionar filtro que exclui leads com bloqueio temporário ativo (`removed_at IS NULL`). Atualmente esse filtro só existe em `DisparosImportDialog.tsx` (linhas 160-167).

```typescript
// Buscar IDs bloqueados
const { data: bloqueados } = await supabase
  .from("leads_bloqueio_temporario")
  .select("lead_id")
  .is("removed_at", null);

// Excluir do disparo
query = query.not("id", "in", `(${bloqueados.map(b => b.lead_id).join(",")})`);
```

#### Passo 2: Categorizar bloqueios

Adicionar coluna `categoria` na tabela `leads_bloqueio_temporario`:

```sql
ALTER TABLE leads_bloqueio_temporario
  ADD COLUMN categoria TEXT DEFAULT 'outro'
  CHECK (categoria IN ('desinteresse', 'corpo_clinico', 'concorrente', 'opt_out', 'temporario', 'outro'));
```

Categorias:
- `desinteresse` — médico disse que não tem interesse
- `corpo_clinico` — já faz parte do corpo clínico (não deve ser prospectado)
- `concorrente` — trabalha para concorrente
- `opt_out` — pediu explicitamente para não ser contatado (LGPD)
- `temporario` — bloqueio técnico/temporário (ex: número errado)
- `outro` — outros motivos

#### Passo 3: UI de gestão de bloqueios

**Arquivo**: `src/components/disparos/AbaBloqueioTemporario.tsx`

Melhorias:
- Filtro por categoria (tabs ou dropdown)
- Indicador visual por tipo (cores diferentes)
- Contadores por categoria
- Busca por nome/telefone
- Botão de "mover para desinteresse" direto da lista de leads

**Arquivo novo**: `src/components/leads/BotaoBloquear.tsx`
- Componente reutilizável para bloquear lead de qualquer tela
- Modal com seleção de categoria + campo de motivo
- Usado em: LeadsTab, LeadDialog, DisparosImportDialog

#### Passo 4: Integrar com fluxo de disparos

Garantir que TODOS os fluxos respeitam bloqueios:

| Fluxo | Arquivo | Atualmente filtra? | Ação |
|-------|---------|-------------------|------|
| Disparo simples | `AbaDisparos.tsx` | ❌ **NÃO** | Corrigir |
| Campanha | `DisparosImportDialog.tsx` | ✅ Sim | Manter |
| Webhook backend | `disparos-webhook/index.ts` | ❌ Verificar | Verificar e corrigir se necessário |
| Import leads | `import-leads/index.ts` | N/A | N/A |

#### Passo 5: Normalizar status de leads

```sql
-- Normalizar inconsistências
UPDATE leads SET status = 'Descartado' WHERE status = 'descartados';
UPDATE leads SET status = 'Qualificado' WHERE status = 'qualificados';
UPDATE leads SET status = 'Em Conversa' WHERE status = 'em_conversa';
UPDATE leads SET status = 'Devolução Contratos' WHERE status = 'Devolucao_Contratos';

-- Atualizar trigger para aceitar novos status
-- Arquivo: validate_lead_status() function
-- Adicionar: 'Em Conversa', 'Desinteresse', 'Bloqueado' à lista de status válidos
```

### Critério de aceite
- [ ] Disparo simples respeita bloqueio temporário
- [ ] Bloqueios têm categoria (desinteresse, opt_out, etc.)
- [ ] UI mostra bloqueios por categoria com contadores
- [ ] Status de leads normalizado (sem variantes inconsistentes)
- [ ] Botão de "bloquear" acessível nas telas de lead

---

## Entrega 3: Tratamento de Especialidades nos Disparos

### Problema atual

O módulo de disparos usa o campo `especialidade` (texto livre) para segmentar campanhas. Com a junction table (Entrega 1), precisamos garantir que a experiência de criar um disparo por especialidade seja simples e funcione para múltiplas especialidades por lead.

### Solução

#### Passo 1: Multi-select de especialidades no disparo

**Arquivo**: `src/components/disparos/DisparosImportDialog.tsx`

Substituir dropdown de especialidade por multi-select:
- Dropdown atual: seleciona UMA especialidade como texto livre
- Novo: multi-select de especialidades da tabela normalizada
- Lógica: "trazer leads que tenham QUALQUER uma das especialidades selecionadas"

```typescript
// Query com junction table
const query = supabase
  .from("leads")
  .select("*, lead_especialidades!inner(especialidade_id)")
  .in("lead_especialidades.especialidade_id", selectedEspecialidades)
  .is("merged_into_id", null);
```

#### Passo 2: Exibir especialidades nos cards de disparo

Na lista de leads do disparo, mostrar as especialidades como tags:
- `[Cardiologia] [Medicina Intensiva]` — duas tags coloridas
- Se muitas, mostrar `[Cardiologia] +2` com tooltip

#### Passo 3: BI de disparos por especialidade

**Arquivo**: `src/hooks/useDisparosBI.ts`

Atualizar métricas para:
- Top especialidades por taxa de resposta
- Especialidades com mais conversões
- Cruzamento: especialidade × UF × taxa de abertura

### Critério de aceite
- [ ] Disparo permite filtrar por múltiplas especialidades (multi-select)
- [ ] Leads com qualquer das especialidades selecionadas aparecem
- [ ] Especialidades exibidas como tags nos cards de lead
- [ ] BI atualizado com métricas por especialidade

---

## Arquitetura Futura (Bloco 2+)

### Enriquecimento via CFM (Bloco 2)

**Edge function**: `enrich-especialidades-cfm`
- Input: CRM do lead
- Processo: consulta portal CFM (`portal.cfm.org.br/busca-medicos`)
- Output: nome, especialidades + RQEs, situação do registro
- Rate limit: ~1 req/seg (scraping gentil)
- Armazena em: `lead_especialidades` com `fonte = 'cfm'`

**Batch enrichment**: rodar nos ~107k leads com CRM preenchido
- Estimativa: ~30h se 1 req/seg (pode rodar em background durante 2-3 dias)
- Priorizar leads sem especialidade (63.977 leads)

### Escala para 580k+ leads (Bloco 2)

A estrutura atual (PostgreSQL 17, LARGE plan) comporta até ~2-5M leads.
Quando atingir 500k+:
- Avaliar upgrade para XL se query performance degradar
- Considerar pg_partman para particionar `lead_especialidades` por `especialidade_id`
- Partial indexes já aplicados resolvem a maioria dos problemas de performance

### Hierarquia de especialidades (Bloco 3-4)

Futura expansão da tabela `especialidades`:
- `parent_id` → auto-referência para hierarquia (Cirurgia → Cirurgia Geral, Cirurgia Cardíaca)
- Tags de área (cirúrgica, clínica, diagnóstica)
- Filtros de alto nível: "todas as especialidades cirúrgicas"

---

## Ordem de execução recomendada

| # | Entrega | Est. | Dependência |
|---|---------|------|-------------|
| 1 | Limpeza da tabela `especialidades` | 0.5d | Nenhuma |
| 2 | Criar junction `lead_especialidades` + migrar dados | 0.5d | #1 |
| 3 | Normalizar status de leads | 0.5d | Nenhuma |
| 4 | Corrigir bug blacklist no disparo simples | 0.5d | Nenhuma |
| 5 | Categorizar bloqueios + UI | 1d | #4 |
| 6 | Atualizar frontend (LeadsTab, disparos) para junction | 1d | #2 |
| 7 | Atualizar edge functions (import, enrich) | 0.5d | #2 |
| 8 | Multi-select especialidades no disparo | 0.5d | #6 |

**Total estimado**: ~5 dias úteis

---

## Mapa de arquivos impactados

### Backend (SQL/Edge Functions)

| Arquivo | Alteração |
|---------|-----------|
| `especialidades` (tabela) | Limpar duplicatas, adicionar colunas (aliases, area, codigo_cfm) |
| `lead_especialidades` (nova tabela) | Criar junction table |
| `leads_bloqueio_temporario` (tabela) | Adicionar coluna `categoria` |
| `leads` (tabela) | Normalizar status |
| `validate_lead_status()` (função) | Atualizar lista de status válidos |
| `get_leads_filter_counts()` (RPC) | Atualizar para usar junction |
| `supabase/functions/import-leads/index.ts` | Popular junction no import |
| `supabase/functions/import-leads-excel/index.ts` | Popular junction no import Excel |
| `supabase/functions/enrich-lead/index.ts` | Popular junction no enriquecimento |

### Frontend (React)

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useLeadsPaginated.ts` | Query via junction |
| `src/hooks/useEspecialidades.ts` | Manter (já funciona) |
| `src/hooks/useLeadsFilterCounts.ts` | Atualizar contagem via junction |
| `src/components/disparos/DisparosImportDialog.tsx` | Multi-select + query via junction |
| `src/components/disparos/AbaDisparos.tsx` | Adicionar filtro bloqueio_temporario |
| `src/components/disparos/AbaBloqueioTemporario.tsx` | Filtros por categoria |
| `src/components/medicos/LeadsTab.tsx` | Exibir múltiplas especialidades |
| `src/components/medicos/LeadDialog.tsx` | Editar especialidades (multi) |
| `src/components/medicos/EspecialidadeMultiSelect.tsx` | Trocar hardcoded por query DB |
| Novo: `src/components/leads/BotaoBloquear.tsx` | Componente de bloqueio reutilizável |

---

## Trabalho já concluído nesta sprint (referência)

### Deduplicação de leads (Tarefas 10 e 11 parcial)
- 5.092 leads duplicados identificados e merged (soft-delete)
- 1.219 FKs re-apontadas para leads canônicos
- Stored procedure `merge_lead_cluster()` criada para uso futuro
- RLS restrictive policy `hide_merged_leads` aplicada
- Partial indexes criados para performance
- Phone normalization trigger aplicado (previne duplicatas futuras)
- Funções helper: `nome_palavras()`, `nome_is_subset()`, `norm_phone()`, `norm_crm()`
- Backup completo em `leads_backup_predup` (112.196 registros)
- Log de auditoria em `lead_merge_log` (1.219 movimentações)

### Tabelas de suporte criadas
- `leads_backup_predup` — backup pré-dedup
- `lead_merge_log` — log de movimentações de FK
- `merge_plan` — plano de dedup com 5.071 clusters processados
- `vw_leads_duplicados` — view de diagnóstico (pode ser dropada após validação)
