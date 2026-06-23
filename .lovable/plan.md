## Problema

Antonia (e outros) está enxergando tarefas de `worklist_tarefas` em que não está envolvida. A causa é a policy de SELECT atual, que ainda permite:

- `escopo = 'geral'` → qualquer usuário autenticado vê (50 tarefas hoje)
- `setor_destino_id = user_setor_id(auth.uid())` → todo mundo do mesmo setor vê (1.372 tarefas hoje)

O mesmo vale para a policy de UPDATE.

## Regra desejada

Uma tarefa só é visível para:
1. Quem criou (`created_by = auth.uid()`)
2. Quem é responsável (`responsavel_id = auth.uid()`)
3. Quem foi mencionado (`worklist_tarefa_mencionados`)
4. Administradores (`is_admin(auth.uid())`)

Sem exceções por escopo "geral" ou por setor.

## Mudanças

### 1. Migration — recriar policies de `worklist_tarefas`

`SELECT`:
```sql
USING (
  created_by = auth.uid()
  OR responsavel_id = auth.uid()
  OR EXISTS (SELECT 1 FROM worklist_tarefa_mencionados m
             WHERE m.tarefa_id = worklist_tarefas.id AND m.user_id = auth.uid())
  OR is_admin(auth.uid())
)
```

`UPDATE`: mesma expressão acima (remove o ramo de setor). DELETE permanece como está (criador ou admin).

### 2. View `vw_worklist_pendencias_setor`

É uma materialized view usada na home/worklist por setor. Como agora a visibilidade é estritamente "envolvido + admin", essa agregação por setor deixa de fazer sentido para usuários comuns. Plano:

- Manter a MV (não dropar agora para não quebrar consultas existentes), mas **revogar `SELECT` de `anon` e `authenticated`**, deixando só `service_role`.
- Em build mode eu busco quem consome essa view no frontend (`rg "vw_worklist_pendencias_setor"`) e ajusto para usar `worklist_tarefas` direto (RLS aplica). Se houver tela "pendências do setor" que dependia disso, mostro só as tarefas em que o usuário está envolvido.

### 3. Frontend

Buscar usos de `escopo` / `setor_destino_id` em listagens de tarefas e remover qualquer filtro que ainda assuma "tarefa do setor aparece para todos". RLS passa a ser a fonte da verdade.

## O que **não** muda

- Coluna `escopo` e `setor_destino_id` permanecem na tabela (não derruba dados nem n8n / edge functions que ainda gravam). Só param de influenciar visibilidade.
- Edge function `api-licitacoes` que cria tarefas continua igual; quem precisar ver precisa virar `responsavel_id` ou ser mencionado.

## Pergunta antes de aplicar

As 1.422 tarefas existentes hoje (1.372 setor + 50 geral) vão sumir da tela de quem não é criador/responsável/mencionado. Isso é o esperado, certo? Se quiser, posso, como passo extra, **migrar `setor_destino_id` → menção automática para todos os usuários daquele setor** nas tarefas já criadas, para não "perder" tarefas legadas. Me diz se quer esse passo de migração de dados também.
