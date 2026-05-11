## Diagnóstico

O problema está confirmado no fluxo de arrematação/pré-contrato:

- A tela de licitação mostra anexos de duas origens:
  - tabela/bucket `licitacoes_anexos` + `licitacoes-anexos` para uploads posteriores;
  - bucket `editais-pdfs` para anexos criados automaticamente junto com a licitação.
- O fluxo que cria/sincroniza o rascunho e o pré-contrato hoje copia só `licitacoes-anexos`.
- Além disso, quando o pré-contrato já tem algum anexo, o código pula a cópia inteira; isso deixa anexos novos sem entrar depois.

Exemplos encontrados no banco:

- Pré-contrato `#98`, licitação `7425614`: origem tem 7 anexos, pré-contrato tem 4. Os 3 faltantes estão em `editais-pdfs`.
- Pré-contrato `#100`, licitação `7484234`: origem tem 3 anexos, pré-contrato tem 0.
- Pré-contrato `#96`, licitação `7370538`: origem tem 5 anexos, pré-contrato tem 0.

## Plano de correção

1. Centralizar a leitura de anexos de licitação no frontend
   - Criar/ajustar helper para montar uma lista única com:
     - registros da tabela `licitacoes_anexos`;
     - arquivos do bucket `licitacoes-anexos`;
     - arquivos do bucket `editais-pdfs`.
   - Deduplicar por caminho/nome para evitar anexos repetidos.

2. Corrigir a criação/sincronização do rascunho
   - Atualizar `useContratoRascunho.ts` e o botão “sincronizar” do `ContratoRascunhoDialog` para copiar anexos das duas origens.
   - Guardar `arquivo_path` com o bucket completo, por exemplo:
     - `licitacoes-anexos/<licitacaoId>/<arquivo>`
     - `editais-pdfs/<licitacaoId>/<arquivo>`

3. Corrigir o fluxo de arrematação no Kanban
   - Em `LicitacoesKanban.tsx`, ao mover para `arrematados`, inserir no rascunho e no pré-contrato apenas os anexos que ainda não existem.
   - Remover a regra atual que só copia se o pré-contrato não tiver nenhum anexo, pois ela impede sincronizações parciais.

4. Corrigir abertura/visualização dos anexos do pré-contrato
   - Ajustar `ContratoList.tsx`, `ContratoFileViewerDialog.tsx` e `ContratoRascunhoDialog.tsx` para reconhecer também `editais-pdfs`.
   - Assim os anexos copiados do bucket automático abrem corretamente.

5. Corrigir os dados já existentes
   - Criar migração SQL para:
     - inserir em `contrato_rascunho_anexos` os anexos ausentes vindos de `licitacoes_anexos`, `licitacoes-anexos` e `editais-pdfs`;
     - inserir em `contrato_anexos` os anexos ausentes dos pré-contratos existentes;
     - evitar duplicatas por `contrato_id + arquivo_url` / `rascunho_id + arquivo_path`.

## Validação

Depois da implementação, vou consultar novamente o banco para conferir que os pré-contratos com origem em licitação passaram a ter a mesma quantidade de anexos disponíveis na origem, incluindo os arquivos de `editais-pdfs`.