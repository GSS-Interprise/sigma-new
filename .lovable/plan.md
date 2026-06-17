Adicionar a especialidade **DIAGNÓSTICO POR IMAGEM** na tabela `especialidades` do Supabase.

## O que será feito

- Inserir um novo registro na tabela `especialidades`:
  - `nome`: `DIAGNÓSTICO POR IMAGEM`
  - `ativo`: `true`

## Observações

- Já existem especialidades parecidas (`RADIOLOGIA E DIAGNÓSTICO POR IMAGEM`, `RADIOLOE DIAGNÓSTICO POR IMAGEM`), mas nenhuma exatamente como `DIAGNÓSTICO POR IMAGEM`. Será criada como entrada nova, sem mexer nas existentes.
- Nenhuma alteração de código/frontend — a nova especialidade aparece automaticamente nos selects que consomem a tabela.