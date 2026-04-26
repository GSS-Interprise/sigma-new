## Resposta direta à sua pergunta

Hoje **não há nenhum indicador visual** no SIG Zap dizendo de onde a conversa veio. A informação existe no banco, mas espalhada em 3 tabelas diferentes:

| Origem | Onde fica registrada |
|---|---|
| **Disparo Manual** (botão "Disparo Manual" no SIG Zap) | `disparo_manual_envios` (lead_id + conversation_id + campanha_proposta_id) |
| **Disparo em Massa** (campanhas via cron/n8n) | `disparos_contatos` (lead_id + campanha_proposta_id, status `4-ENVIADO`/`5-RESPONDEU`) |
| **Tráfego Pago** (webhook automático) | `trafego_pago_envios` (lead_id + campanha_proposta_id) |

A tabela `sigzap_conversations` em si **não guarda a origem** — então hoje, olhando para a lista de conversas, é impossível distinguir.

Atualmente: 0 manuais, 0 tráfego pago, 2.970 disparos em massa registrados. Ou seja, praticamente tudo que aparece hoje no SIG Zap é de disparo em massa, mas isso vai mudar conforme manual/tráfego ganharem volume.

## Plano proposto

Adicionar um **badge de origem** em cada card de conversa (nas colunas "Conversas" e "Minhas Conversas") + um filtro por origem.

### 1. Backend — view de origem por lead/telefone

Criar uma view `vw_sigzap_conversation_origem` que, para cada `(lead_id, phone_e164)`, retorna a origem mais provável da conversa, com prioridade:

1. `disparo_manual_envios` → origem = **manual**
2. `trafego_pago_envios` → origem = **trafego_pago**
3. `disparos_contatos` (status `4-ENVIADO` ou `5-RESPONDEU`) → origem = **massa**
4. Nenhum match → origem = **inbound** (lead chegou sozinho, sem disparo nosso)

Quando houver múltiplas origens para o mesmo lead, retornar a mais recente (por `created_at`/`enviado_em`/`data_envio`) e também a campanha/proposta associada.

### 2. Hook — useSigzapConversationOrigem

Em `src/hooks/`, criar hook que faz JOIN da `sigzap_conversations` com a view acima, devolvendo `{ conversation_id, origem, campanha_nome, proposta_id, ultimo_envio_at }` para cada conversa visível.

### 3. UI — Badge de origem

Adicionar nos cards de:
- `src/components/sigzap/SigZapMinhasConversasColumn.tsx`
- coluna "Conversas" (componente irmão — confirmar nome ao implementar)

Badge pequeno, ao lado dos badges existentes ("Livre", contador de não lidas), com cores:

| Origem | Label | Cor |
|---|---|---|
| manual | "Manual" | roxo |
| massa | "Campanha" | azul |
| trafego_pago | "Anúncio" | laranja |
| inbound | "Inbound" | cinza |

Tooltip no badge mostrando o nome da campanha e a data do envio quando aplicável.

### 4. Filtro por origem

Adicionar um seletor "Origem" na barra de filtros (junto de "Todos / Não lido / Tag") permitindo filtrar conversas por origem.

### 5. Detalhe na coluna de Chat

No header do chat (quando uma conversa está aberta), exibir uma linha sutil:
> "Origem: Campanha X · Proposta #123 · enviado em 24/04 10:04"

Assim, ao abrir a conversa, fica claro de qual ação ela veio.

## Fora de escopo

- Não vamos migrar dados antigos para uma coluna nova em `sigzap_conversations` — a view derivada cobre 100% dos casos sem risco.
- Não vamos alterar fluxos de envio existentes.
