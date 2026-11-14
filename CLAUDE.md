# Sigma GSS — regras do repositório para agentes

## Agente do Sigma (MCP dos sócios)

Protocolo: `docs/arquitetura/protocolo-agente-sigma.md`. Código: `supabase/functions/sigma-mcp/` e
`supabase/functions/_shared/agente/`.

- **Depois de todo deploy do `sigma-mcp`** (e antes de liberar um domínio novo), rode a bateria de consistência e só
  dê o deploy por encerrado com todos os casos ok:

  ```bash
  SUPABASE_ACCESS_TOKEN=<token da Management API> deno run -A scripts/agente-consistencia.ts
  ```

  Ela chama o MCP publicado 3 vezes por caso (mesmo hash = mesmo fato para qualquer sócio) e confere cada total com
  um SQL independente sobre a view da tela. Casos em `supabase/functions/_shared/agente/casos/<dominio>.json`.
- Domínio novo: módulo em `_shared/agente/dominios/<id>.ts` pelo molde da §3i do protocolo, arquivo de casos com
  paridade, `PROTOCOLO_VERSAO` sobe, e o domínio nasce sem papel nenhum (o admin libera em Configurações › Agente do
  Sigma).
- Toda consulta de domínio termina com desempate fixo (`.order("id")`): sem isso, o mesmo dado sai em outra ordem e
  muda o hash.
