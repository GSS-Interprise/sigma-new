# Corrigir agrupamento por Especialidade no BI Prospec

## De onde vêm os dados hoje (e por que tem variação)

A coluna **Especialidade** do "Detalhamento por Especialidade" vem de `leads.especialidade` — um campo de **texto livre** preenchido em diferentes momentos por diferentes fontes (importações antigas, formulários, planilhas). Isso causa:

| Problema | Exemplo na tela |
|---|---|
| Mesma especialidade em variações de caixa | `PSIQUIATRIA`, `Psiquiatria`, `psiquiatria` |
| Mesma especialidade abreviada/com erro | `Pediatria`, `PEDIATRIA`, `Pediatra`, `pediatria` |
| Texto vazio/nulo | `Sem especialidade` |
| Nomes longos vs curtos | `Radiologia e Diagnóstico por Imagem` vs `radiologia` |

No print que você mandou:
- `PSIQUIATRIA` (59) e qualquer `Psiquiatria` minúscula seriam linhas separadas
- `Pediatria` (30) + `PEDIATRIA` (17) + `Pediatra` (2) + `pediatria` (1) = **50 disparos**, mas aparecem como 4 linhas

## A solução já existe no banco — só não está sendo usada

O sistema **já tem** a estrutura correta:

| Tabela | Conteúdo | Uso atual no BI |
|---|---|---|
| `especialidades` (135 ativas) | Nome canônico + `aliases[]` + `area` | ❌ não usado |
| `lead_especialidades` (junction, 125.050 leads) | `lead_id` ↔ `especialidade_id` | ❌ não usado |
| `leads.especialidade` (texto livre) | 51.903 leads, sujo | ✅ usado (errado) |

A tabela `especialidades.aliases` já contém os mapeamentos (ex.: `PEDIATRIA` tem aliases `[pediatria, pediatra, ped, pediatria/intensiva, pediatrica]`).

## O que vou mudar

Reescrever a CTE `lead_esp` no RPC `get_bi_prospec_dashboard` para resolver a especialidade canônica de cada lead nesta ordem de prioridade:

1. **Junction `lead_especialidades`** (verdade): pega o nome canônico via `especialidade_id → especialidades.nome`. Se um lead tem múltiplas, escolher a primeira (ou a "principal" se houver flag — verificar).
2. **Fallback por alias**: se o lead **não** está na junction mas tem `leads.especialidade` preenchida, normalizar (lowercase, trim) e procurar em `especialidades.aliases` ou `especialidades.nome`.
3. **Último fallback**: usar o texto livre `leads.especialidade` como veio (para não perder dado).
4. **Sem nada**: `'Sem especialidade'`.

Resultado: `PEDIATRIA`, `Pediatria`, `Pediatra`, `pediatria` viram **uma linha só: `PEDIATRIA`** (50 disparos no exemplo).

## Validação prevista após o fix

| Antes (linhas separadas) | Depois (consolidado) |
|---|---|
| Pediatria 30, PEDIATRIA 17, Pediatra 2, pediatria 1 | **PEDIATRIA: 50** |
| PSIQUIATRIA 59 + qualquer Psiquiatria | **PSIQUIATRIA: 59+** |
| Radiologia e Diagnóstico por Imagem 1 | **RADIOLOGIA E DIAGNÓSTICO POR IMAGEM: 1** |

## Pergunta antes de aplicar

Antes da migration preciso confirmar 1 ponto:

**Quando um lead tem mais de uma especialidade na junction (ex.: pediatra que também é intensivista), como deve aparecer no BI?**
- (a) Conta **uma vez na principal** (a primeira/única registrada) — recomendado
- (b) Conta **em todas** que tem (lead aparece em múltiplas linhas, infla o total)
- (c) Cria categoria combinada `Pediatria + Medicina Intensiva`

Default que vou usar se não responder: **(a) — primeira especialidade da junction por `created_at` ASC**.

## Arquivos afetados

- **Migration**: nova versão do RPC `get_bi_prospec_dashboard` com a CTE `lead_esp` corrigida.
- Nenhum arquivo de frontend muda.

## Aguardando aprovação para aplicar a migration.
