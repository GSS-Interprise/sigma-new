# Piloto uazapi — provider alternativo de WhatsApp (11/06/2026)

Objetivo: rodar **meio-a-meio** — alguns chips no **uazapi** (`https://pulseid.uazapi.com`,
gerenciado, proxy nativo) e o resto na **Evolution** — pra medir se a instabilidade de
instância (flapping, LOGOUT/428, healthcheck stale) some no uazapi. **Aditivo e reversível:**
`chips.provedor` decide o transporte; Evolution segue 100% intacto.

## Como liga/desliga por chip
`chips.provedor`:
- `'evolution'` (default) → caminho atual, sem mudança.
- `'uazapi'` → usa o servidor uazapi. Token isolado da instância em `chip_provider_secrets`
  (RLS sem policy = só `service_role`/edges leem; nunca vai pro client).

## Peças (todas comentadas no código)

| Camada | Arquivo | O que faz |
|---|---|---|
| Secrets | Supabase Secrets `UAZAPI_SERVER_URL` / `UAZAPI_ADMIN_TOKEN` | admintoken NUNCA no repo/Vault/client |
| DB | `migrations/20260611190000_uazapi_provider.sql` | `chips.provedor` default + tabela `chip_provider_secrets` |
| Provisão | `functions/uazapi-instance-manager` | actions create/connect/status/delete. Cria instância (`/instance/init`), grava token, seta webhook, devolve QR |
| Webhook | `functions/uazapi-webhook` (público) | recebe messages+connection do uazapi. **Defensivo**: loga o payload cru (formato exato se confirma no 1º evento real), sincroniza connection_state, grava inbound, e na campanha manual move Aguardando→Aquecido |
| Transporte | `functions/_shared/evo-sender.ts` → `resolveTransporte()` | **mesma orquestração anti-ban** (pre_send_check/cap/janela/delay/retry/log); só o POST roteia por `provedor`. uazapi: `POST /send/text` header `token`. Evolution: `/message/sendText` header `apikey` |
| Sync conexão | `functions/chip-auto-reconnect` | chip uazapi: só **sincroniza** `connection_state` via `GET /instance/status` (reconexão é do provider, sem restart). Mapeia `connected→open` pro resto do sistema enxergar |
| Front criação | `EvolutionInstanceDialog.tsx` | toggle **Evolution / uazapi** no form. uazapi não exige telefone; cria via edge e mostra o QR |
| Front conexão | `QRCodeDialog.tsx` + `InstanciaConfigTab.tsx` | botão Conectar roteia pro uazapi quando `chip.provedor='uazapi'` |

## Vocabulário de status (transparência pro resto do sistema)
O resto do Sigma (disparo-processor, kanban) fala `open`/`close`/`connecting`. O uazapi fala
`connected`/`disconnected`/`connecting`. As edges uazapi **traduzem** (`connected→open`) ao gravar
`chips.connection_state`, então nada além das edges uazapi precisa saber que o provider mudou.

## Fluxo pra Bruna conectar um chip caído no uazapi
1. Disparos & Chips → **Nova Instância** → escolhe **uazapi** → nomeia → Criar.
2. Escaneia o QR no celular do número (Business recomendado).
3. Status vira Conectado (`/instance/status` poll). O chip já nasce `pode_disparar=true`.
4. Coloca o chip na campanha — o disparo sai pelo uazapi automaticamente (evo-sender roteia).

## Medir estabilidade (preto no branco)
Comparar por provedor ao longo de 1-2 semanas:
- `chip_auto_reconnect_log` (needs_qr / restarted) — deve cair no uazapi.
- `chip_send_log` (status sent/failed, error_code) — taxa de sucesso por chip.
- `chip_health_event` (disconnect_401, http_428…) — eventos de queda por chip.

## Pendências / refinar com dado real
- **Webhook inbound**: o parse é defensivo + loga o cru. Confirmar o formato exato do payload
  uazapi no 1º evento real e ajustar `pick()` em `uazapi-webhook` se preciso.
- **Rotacionar o admintoken** (vazou no chat 11/06 — é a chave-mestra do servidor).
- **Limite de instâncias do plano** (uazapi `429`) — confirmar teto antes de escalar além do piloto.
- Se o piloto validar: migrar os demais chips trocando `provedor` (sem reescrever nada).

Blueprint original: `cofre-obsidian/Recursos/uazapi-Blueprint-CRMs.md`.
