

## Plano: Renomear "Região de Interesse" para "Banco de Interesse"

### Arquivos a alterar

| Arquivo | O que muda |
|---|---|
| `src/pages/Disparos.tsx` | Nome do módulo e descrição no card |
| `src/pages/DisparosRegiaoInteresse.tsx` | Título e subtítulo da página |
| `src/components/disparos/RegiaoInteresseModule.tsx` | Textos de toast e mensagens vazias |
| `src/components/disparos/RegiaoInteresseDialog.tsx` | Título do dialog e toast de sucesso |
| `src/components/disparos/ManutencaoAdminModal.tsx` | Label do módulo na lista de manutenção |
| `src/components/sigzap/SigZapConversaContextMenu.tsx` | Texto do item no menu de contexto |
| `src/components/medicos/LeadProntuarioDialog.tsx` | Texto do botão na aba de conversão |

### O que NÃO muda
- **Rotas** (`/disparos/regiao-interesse`) — manter para não quebrar links/bookmarks
- **Nomes de arquivo** — manter os mesmos componentes
- **Query keys** (`regiao-interesse-leads`) — sem impacto para o usuário
- **Tabela do banco** (`regiao_interesse_leads`) — sem alteração
- **Chave de manutenção** (`regiao_interesse`) — sem alteração

### Resumo
Apenas substituição de textos visíveis ao usuário: títulos, labels, toasts e descrições. Nenhuma mudança estrutural, de rota ou de banco.

