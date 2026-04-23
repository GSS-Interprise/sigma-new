

## Verificação: bloqueio do botão "Disparar" persiste após refresh

### Resposta direta

**Sim, o botão fica bloqueado mesmo após atualizar a tela** — desde que ainda existam contatos com status `1-ENVIAR`, `2-AGENDADO` ou `3-TRATANDO` na tabela `disparos_contatos` para a proposta atual.

### Como funciona hoje (`src/components/disparos/ZapTab.tsx`)

O bloqueio **não depende de estado local** (React state) que se perderia no refresh. Ele depende de uma query ao banco:

```text
useQuery(["disparo-em-andamento", campanhaPropostaId])
  ↓
SELECT count(*) FROM disparos_contatos
WHERE campanha_proposta_id = ?
  AND status IN ('1-ENVIAR', '2-AGENDADO', '3-TRATANDO')
  ↓
disabled = (count > 0)
```

Fluxo após clicar em "Disparar":
1. RPC `gerar_disparo_zap` cria N registros em `disparos_contatos` com status `1-ENVIAR`.
2. Próxima execução da query retorna `count > 0` → botão desabilitado.
3. Polling de 5s mantém o estado atualizado automaticamente.
4. **Refresh (F5)**: a query roda de novo no mount → mesmo resultado → botão continua bloqueado.
5. Só desbloqueia quando n8n callback move TODOS os contatos para `4-ENVIADO`, `5-NOZAP` ou `6-BLOQUEADORA`.

### Conclusão

Comportamento já está correto e à prova de refresh. **Nenhuma mudança necessária.**

Se quiser uma camada extra de segurança (ex.: bloqueio também sobreviver a falhas de RLS ou erros de rede que façam a query retornar 0 indevidamente), posso adicionar:

- Fallback local em `localStorage` com timestamp do último disparo (libera após X minutos OU quando o servidor confirmar 0 pendentes — o que vier primeiro).
- Indicador visual de "última sincronização há Xs" para o usuário saber se o estado está fresco.

Me avise se quer alguma dessas camadas adicionais; caso contrário, o sistema já atende ao requisito.

