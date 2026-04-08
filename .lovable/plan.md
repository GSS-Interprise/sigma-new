

# Por que o Ewerton Rubi (+5547999758708) não aparece nos disparos

## Diagnóstico

O lead "Ewerton rubi" (id: `a01942e2`, status: "Acompanhamento", telefone: `+5547999758708`) **não está em nenhuma blacklist, bloqueio temporário ou campanha**. 

Porém, existe um registro na tabela `medicos` (id: `7ed461d9`) com o mesmo telefone `+5547999758708`. O `DisparosImportDialog` (linha 329) exclui automaticamente qualquer lead cujo telefone já pertence a um médico:

```
if (exclusionSets.phonesMedicos.has(key)) return false;
```

Essa regra existe para evitar que médicos já no corpo clínico recebam disparos de captação. Mas neste caso, o Ewerton deveria poder receber.

## Opções de Solução

**Opção A — Remover a exclusão por telefone de médico (menos restritiva)**
- Remover as linhas 329-330 do `DisparosImportDialog` que excluem leads por telefone de médico
- Deixar apenas a exclusão por `lead_id` vinculado ao médico (lead_id `a18f749d` ≠ `a01942e2`)
- Risco: médicos que são também leads com mesmo telefone passariam a aparecer

**Opção B — Remover apenas para este caso (pontual)**
- Atualizar o telefone do registro na tabela `medicos` ou desvincular para que não conflite
- Requer migração SQL

**Opção C (Recomendada) — Manter a exclusão mas filtrar apenas pelo lead_id do médico, não pelo telefone**
- Na busca de exclusão, usar apenas `leadIdsMedicos` (lead_id vinculado ao médico) em vez de `phonesMedicos` (telefone)
- Isso permite que leads com mesmo telefone mas IDs diferentes ainda apareçam
- Aplicar a mesma lógica no `EmailImportDialog` e no `AbaDisparos`

## Alterações Técnicas (Opção C)

### 1. `src/components/disparos/DisparosImportDialog.tsx`
- Remover a criação do set `phonesMedicos` (linhas 147-151)
- Remover o filtro `exclusionSets.phonesMedicos.has(key)` (linha 329)
- Manter apenas `exclusionSets.leadIdsMedicos.has(lead.id)` (linha 330)

### 2. `src/components/disparos/EmailImportDialog.tsx`
- Aplicar a mesma remoção da exclusão por telefone de médico, se existir

### 3. `src/components/disparos/AbaDisparos.tsx`
- Verificar se a query de contatos exclui por telefone de médico e ajustar igualmente

Isso resolve o caso do Ewerton sem abrir brecha para médicos receberem disparos indevidamente — porque um médico com lead_id vinculado continuará excluído.

