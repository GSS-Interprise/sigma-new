# Plano: Limpeza e consolidação de especialidades

**Data:** 16/04/2026
**Status:** Aguardando execução

---

## Contexto

Hoje temos 3 campos redundantes na tabela `leads` + 1 junction table. O objetivo é consolidar tudo na junction (`lead_especialidades`) e deprecar os campos legados.

### Estado atual

| Campo | Onde | Registros | Uso |
|---|---|---|---|
| `especialidade` (text) | `leads` | ~43k preenchidos | Filtros de disparo (legado) |
| `especialidades` (array) | `leads` | 642 leads (33 com múltiplas) | Prontuário médico (multiselect) |
| `especialidade_id` (uuid FK) | `leads` | 29.401 | FK direta (cache, redundante) |
| `lead_especialidades` (junction) | tabela própria | 43.128 | Fonte da verdade N:N |

- **107 leads** têm o array `especialidades` populado mas NÃO estão na junction table
- **6 valores** do array não existem na tabela `especialidades`

---

## Passo 1 — Criar 6 especialidades faltantes (Raul)

Criar na tabela `especialidades`:

```sql
INSERT INTO especialidades (nome, area, aliases) VALUES
  ('MEDICINA INTENSIVA PEDIÁTRICA', 'clinica', ARRAY['medicina intensiva pediátrica', 'intensivista pediátrico', 'uti pediátrica']),
  ('ONCOLOGIA PEDIÁTRICA', 'clinica', ARRAY['oncologia pediátrica', 'oncopediatria']),
  ('RESIDENTE DE CLÍNICA MÉDICA', 'residencia', ARRAY['residente de clínica médica', 'r1 clínica médica', 'r2 clínica médica']),
  ('RESIDENTE DE MASTOLOGIA', 'residencia', ARRAY['residente de mastologia']),
  ('RESIDENTE DE PSIQUIATRIA', 'residencia', ARRAY['residente de psiquiatria']),
  ('RESIDENTE DE RADIOTERAPIA', 'residencia', ARRAY['residente de radioterapia'])
ON CONFLICT DO NOTHING;
```

## Passo 2 — Migrar 107 leads do array pra junction (Raul)

```sql
INSERT INTO lead_especialidades (lead_id, especialidade_id, fonte)
SELECT l.id, e.id, 'migration_array'
FROM leads l,
     LATERAL unnest(l.especialidades) AS esp_texto
JOIN especialidades e ON UPPER(TRIM(esp_texto)) = e.nome
   OR LOWER(TRIM(esp_texto)) = ANY(e.aliases)
WHERE l.especialidades IS NOT NULL
  AND array_length(l.especialidades, 1) > 0
  AND l.merged_into_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM lead_especialidades le
    WHERE le.lead_id = l.id AND le.especialidade_id = e.id
  )
ON CONFLICT (lead_id, especialidade_id) DO NOTHING;
```

## Passo 3 — Ewerton ajusta frontend

Componentes que precisam mudar pra ler da junction:

- **Prontuário médico** (multiselect de especialidades) — ler de `lead_especialidades` JOIN `especialidades`
- **Filtros de disparo** — já usa `especialidade_id`, migrar pra JOIN na junction
- **Card do lead** — mostrar especialidades da junction

Query padrão pra buscar especialidades de um lead:
```sql
SELECT e.id, e.nome, le.rqe
FROM lead_especialidades le
JOIN especialidades e ON e.id = le.especialidade_id
WHERE le.lead_id = :lead_id;
```

Query pra salvar especialidades (multiselect):
```sql
-- Inserir nova
SELECT lookup_especialidade('Cardiologia', :lead_id);

-- Ou direto por ID
INSERT INTO lead_especialidades (lead_id, especialidade_id, fonte)
VALUES (:lead_id, :esp_id, 'manual')
ON CONFLICT (lead_id, especialidade_id) DO NOTHING;

-- Remover
DELETE FROM lead_especialidades
WHERE lead_id = :lead_id AND especialidade_id = :esp_id;
```

## Passo 4 — Deprecar campos legados

Depois que o frontend estiver 100% na junction:

```sql
-- NÃO deletar ainda — só documentar como deprecated
COMMENT ON COLUMN leads.especialidade IS 'DEPRECATED: usar lead_especialidades';
COMMENT ON COLUMN leads.especialidades IS 'DEPRECATED: usar lead_especialidades';
COMMENT ON COLUMN leads.especialidade_id IS 'DEPRECATED: usar lead_especialidades';
```

Deletar só quando confirmado que nenhum código lê deles (grep no repo + confirmar com Ewerton).

## Passo 5 — Imports futuros

- **LifeHub / Thiago (RPA):** se não tem especialidade, entra como `Medicina Generalista` (ID já existe)
- **Texto livre ou RQE:** passa pelo `lookup_especialidade(texto, lead_id)` que faz lookup + insert na junction
- **N8N do Ewerton:** usar `POST /rest/v1/rpc/lookup_especialidade` com `{"p_texto": "...", "p_lead_id": "..."}`

---

## Validação pós-execução

```sql
-- Deve retornar 0 (todos os leads com array estão na junction)
SELECT COUNT(DISTINCT l.id)
FROM leads l
WHERE l.especialidades IS NOT NULL
  AND array_length(l.especialidades, 1) > 0
  AND l.merged_into_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM lead_especialidades le WHERE le.lead_id = l.id);

-- Total na junction deve ser ~43.200+
SELECT COUNT(*) FROM lead_especialidades;
```
