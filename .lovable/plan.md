

# Mudar `column` e `limit` de body para query parameters

## Mudança

Trocar a leitura de `column` e `limit` do body JSON para **query parameters da URL**, para facilitar o uso no n8n via HTTP Request node.

## Alteração no arquivo

**`supabase/functions/query-leads-by-enrich/index.ts`**:
- Extrair `column` e `limit` da URL: `new URL(req.url).searchParams`
- Remover `await req.json()` — não precisa mais de body
- Aceitar também GET (além de POST), já que não tem body

## Uso no n8n

```
POST https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/query-leads-by-enrich?column=enrich_five&limit=500
Authorization: Bearer <token>
```

Sem body necessário.

