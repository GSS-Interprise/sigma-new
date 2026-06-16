# Campanhas colaborativas + BI de cobertura — plano

**Origem:** reunião Raul × Ramone (16/06/2026). A campanha passa a ser tocada por **mais de uma pessoa**; a gestão precisa enxergar **cobertura** ("já chamamos todos os médicos daquela região?") e a operação precisa de **filtros, tags e divisão de trabalho** dentro da campanha.

## Princípio
A **campanha = estratégia**. Várias operadoras dividem o trabalho por estado/especialidade dentro da mesma campanha. O BI mostra o **funil de cobertura** por campanha e por região, comparando o que foi chamado com o universo disponível na base (CFM).

## Status (implementado 16/06)
1. BI funil de cobertura ✅ · 2. Esforço sem lista infinita ✅ · 3. Filtros UF/especialidade/nome ✅ · 4. Wizard multi-especialidade (já existia) + multi-estado ✅ · 5. Tags no card + quick-select ✅ · 6. Indicador de quem assumiu ✅ · 7. UX colaborativa (indicador + base) ✅ · 8. Central de tarefas ✅

## Itens (ordem de implementação)

### 1. BI — Funil de cobertura no Esforço da Equipe  ✅ PRIORIDADE
- Seletor por campanha.
- **Funil da campanha**: na campanha → contatado → em conversa → aquecido → quente → convertido.
- **Cobertura por UF**: gráfico comparando *médicos disponíveis na base* (por `especialidade_id` da campanha) × *na campanha* × *chamados*, por estado. Responde "já chamamos todos da região?".
- Destaque: "% da região alvo coberta".
- Fonte: nova RPC `get_bi_funil_campanha(p_campanha_id)`. Universo = `leads` com `especialidade_id = ANY(campanha.especialidade_ids)` agrupado por `uf`. (UF preenchido em ~803k leads; `especialidade_id` em 43k — comparativo confiável para campanhas com especialidade definida; campanhas importadas sem alvo mostram "alvo não definido".)

### 2. BI — Esforço da Equipe mais visual
- Remover a **lista infinita de tarefas atrasadas/pendentes** (top 50). Trocar por gráficos.
- Manter: KPIs, tarefas por campanha (barras), esforço por canal (rosca), ranking por pessoa (curto).

### 3. Filtros dentro da campanha (operação)
- No kanban da campanha: filtro por **estado (UF)**, por **especialidade** (1+), e **busca por nome do médico**.
- Permite as operadoras se dividirem ("tu cuida de Minas, tu do Rio").

### 4. Wizard de criação — multi-seleção
- Selecionar **mais de uma especialidade** (`especialidade_ids[]` já existe) e **mais de um estado** (hoje só `regiao_estado` text → adicionar `regiao_estados text[]`).

### 5. Tags nos cards de lead + seleção rápida
- Exibir `leads.tags[]` no card; quick-select de tags existentes + adicionar nova.

### 6. Indicador de quem mandou a última mensagem / quem está no lead
- No card: avatar/nome de quem **assumiu** (`assumido_por`) e/ou mandou a última mensagem, visível **antes de abrir** a conversa. Evita duas pessoas no mesmo médico. Base da UX colaborativa (item 7).

### 7. UX colaborativa (campanha multi-pessoa)
- Deixar claro no card e na conversa quem está atuando; lock visual leve. `campanhas.responsaveis[]` já existe.

### 8. Central de "Minhas tarefas pendentes"
- Tela/aba com as tarefas (`campanha_lead_tasks`) do usuário logado, filtrável por **dia**, agregando todas as campanhas. Não depende de notificação (ninguém usa).

## Dados (já existentes)
- `leads`: `uf`, `cidade`, `especialidade`, `especialidade_id`, `tags[]`, `nome`, `phone_e164`.
- `campanhas`: `especialidade_ids[]`, `regiao_estado`, `regiao_cidades[]`, `responsaveis[]`, `sem_especialidade`.
- `campanha_leads`: `status`, `assumido_por`, `assumido_em`, `humano_assumiu`, `data_primeiro_contato`, `data_ultimo_contato`.
- `campanha_lead_tasks`: `feita_por`, `feita_em`, `status`, `prazo_at`, `tipo`.

## Enabler (débito de dados)
- `especialidade_id` preenchido em só 5% dos leads → o comparativo por especialidade é forte onde há, fraco onde não. Melhorar o backfill de `especialidade_id` aumenta a precisão da cobertura (tarefa futura).
