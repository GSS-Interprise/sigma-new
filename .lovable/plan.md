## Objetivo

Eliminar a necessidade de cada usuário conectar a própria conta Google. Usar **uma única Service Account** com **Domain-Wide Delegation (DWD)** que se passa pelo e-mail do usuário do SIGMA. Quem tiver e-mail fora do domínio Workspace continua usando o OAuth individual atual.

## Estratégia: 2 modos coexistindo

Para cada chamada (criar evento / listar eventos), o backend decide:

```text
usuário do SIGMA
   │
   ├─ email termina em domínio configurado (ex: @gestaosaudeservicos.com.br)?
   │     SIM ──► usa Service Account + impersonate(email)   ← padrão, sem setup
   │     NÃO ──► cai no fluxo OAuth atual (user_google_calendar_tokens)
```

Vantagem: zero configuração para a maioria, e mantém suporte a e-mails externos.

## Pré-requisitos (lado Google — feitos pelo admin Workspace, uma única vez)

1. Criar uma **Service Account** no Google Cloud no projeto que já tem a Calendar API habilitada.
2. Gerar uma **chave JSON** dessa service account.
3. No **Google Admin Console → Security → API Controls → Domain-wide delegation**, autorizar o **Client ID** numérico da service account com os escopos:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
4. Me passar o JSON da chave (vai pra secret do Supabase) e o domínio padrão (ex: `gestaosaudeservicos.com.br`).

## Mudanças no projeto

### Secrets (Supabase)
- `GOOGLE_SERVICE_ACCOUNT_JSON` — JSON completo da chave (string).
- `GOOGLE_WORKSPACE_DOMAIN` — domínio padrão para decidir DWD vs OAuth (ex: `gestaosaudeservicos.com.br`). Pode ser lista separada por vírgula se houver mais de um.

### Edge functions

**Novo helper `_shared/google-sa.ts`**
- Lê `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Função `getImpersonatedAccessToken(userEmail)`:
  - Monta JWT com `iss = client_email da SA`, `sub = userEmail`, `scope = calendar`, assinado com RS256 usando a `private_key` da SA.
  - Troca por access token em `https://oauth2.googleapis.com/token` (grant `urn:ietf:params:oauth:grant-type:jwt-bearer`).
  - Cacheia em memória por ~50min por email.
- Função `shouldUseDWD(email)`: compara com `GOOGLE_WORKSPACE_DOMAIN`.

**Atualizar `_shared/google-token.ts`**
- Nova função `getAccessTokenForUser(userId)`:
  1. Busca `profiles.email` do usuário.
  2. Se `shouldUseDWD(email)` → retorna `getImpersonatedAccessToken(email)`.
  3. Senão → mantém o caminho atual (`getValidGoogleAccessToken` com refresh token do `user_google_calendar_tokens`).

**`google-calendar-create` e `google-calendar-events`**
- Trocar a chamada atual de token pelo novo `getAccessTokenForUser(userId)`.
- Resto da lógica continua igual (mesmo endpoint, mesmo body do Calendar API).
- Ao operar via DWD, o evento já cai na agenda do usuário porque o token foi emitido em nome dele.

**`google-oauth-start` / `google-oauth-callback` / `user_google_oauth_config` / `user_google_calendar_tokens`**
- Sem mudanças. Continuam ativos para o fallback.

### Frontend

**`useGoogleConnection`** (`src/hooks/useGoogleCalendar.ts`)
- Passa a também consultar uma nova edge function leve `google-connection-status` (ou query no `profiles.email` + check do domínio no client via `import.meta.env`) para responder:
  - `mode: "dwd" | "oauth"`
  - `connected: true` automaticamente quando `mode === "dwd"`
  - `email`: o próprio e-mail corporativo do usuário

**Tela de configurações Google do usuário**
- Quando `mode === "dwd"`: mostra "Conectado automaticamente como `usuario@dominio.com` via conta corporativa" — sem botões de conectar/desconectar.
- Quando `mode === "oauth"`: mantém os botões atuais (conectar / desconectar / configurar client id).

**`GoogleEventDialog` e listagem de eventos**: nenhuma mudança visual.

### Banco
Sem migração necessária. Tabelas `user_google_oauth_config` e `user_google_calendar_tokens` ficam intactas para o fallback.

## Riscos e observações

- **Erro `unauthorized_client`** ao trocar JWT: indica que o admin ainda não autorizou o Client ID da SA no Admin Console com os escopos certos. Mensagem clara no toast.
- **E-mail do `profiles` diferente do e-mail Google Workspace**: impersonate falha. Vamos logar e exibir mensagem específica pedindo para corrigir `profiles.email`.
- **Salas/agendas compartilhadas**: continua funcionando normalmente porque o token é do próprio usuário.
- **Auditoria**: como o token é por usuário, eventos aparecem como criados pela pessoa certa, não por "bi@".

## Ordem de execução

1. Você me confirma o **domínio** e gera o **JSON da Service Account**.
2. Eu peço os 2 secrets (`GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_WORKSPACE_DOMAIN`).
3. Crio o helper `google-sa.ts`, atualizo `google-token.ts`, `google-calendar-create`, `google-calendar-events` e adiciono `google-connection-status`.
4. Ajusto o hook e a tela de configurações Google.
5. Testamos criando um evento com sua conta (deve funcionar sem você ter conectado nada) e com uma conta externa (deve cair no OAuth antigo).
