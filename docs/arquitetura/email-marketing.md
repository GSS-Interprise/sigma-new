# E-mail marketing (27/09/2026)

Duas formas de usar, mesmo motor:

| Onde | Público | Como abre |
|---|---|---|
| Dentro de uma campanha de WhatsApp | médicos da campanha — todos ou só quem não respondeu (`email_publico`) | botão **E-mail** no detalhe da campanha |
| Campanha só de e-mail (`canal='email'`, `tipo_campanha='email_marketing'`) | filtros da campanha: especialidades, UFs, cidades, listas de disparo | Máquina de Prospecção → aba **E-mail** |

## Fluxo

1. Equipe escreve assunto/título/mensagem/botão (sem HTML). Prévia = HTML real (`src/lib/emailMarketing.ts`, cópia de `supabase/functions/_shared/email-marketing.ts` — mudou um, muda o outro).
2. **Testar** → `email-campanha {acao:"teste"}` manda até 5 cópias com "[TESTE]".
3. **Disparar** → `acao:"iniciar"` → `email_enfileirar_campanha()` (SQL) põe o público em `email_envios` (único por campanha+e-mail; reenviar só pega quem entrou depois).
4. Cron `email-marketing-processar-2min` (jobid 54) → `acao:"processar"`: respeita `email_limite_diario` (dia BRT), lotes de 100 no Resend, cabeçalhos List-Unsubscribe (one-click do Gmail/Yahoo), histórico `email_enviado` no lead.
5. Resend → webhook assinado (Svix) → `email-eventos`: entregue/aberto/clicado; rejeição permanente e spam → `email_optout`.
6. Descadastro: link do rodapé → `/descadastro/:token` (confirma com 1 clique) ou POST one-click direto na edge `email-descadastro`.

## Regras que não podem quebrar

- Sempre fora: e-mail inválido, `leads.opt_out`, `email_optout`.
- Contagem e fila **no SQL** (`email_publico_total`, `email_enfileirar_campanha`): pela API o RPC de lista volta no máximo 1000 linhas.
- `iniciar` recusa sem `config_lista_items.email_marketing_from` — o marketing sai de **subdomínio próprio** para não queimar a reputação do domínio principal (NF, contratos).
- Painel avisa rejeição > 4% ou spam > 0,3% (limite do Gmail).

## Pendências para ligar (dependem do Raul)

- Subdomínio de marketing verificado no Resend (SPF/DKIM + DMARC) e `email_marketing_from` configurado.
- Open/click tracking ligado no domínio do Resend.
- Plano do Resend compatível com o volume (~303 mil leads com e-mail).
- O módulo antigo `DisparosEmail` nunca foi usado — pode ser aposentado.
