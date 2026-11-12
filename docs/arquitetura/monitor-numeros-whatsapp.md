# Monitor dos números oficiais (WhatsApp via Chakra)

> Escrito em 12/11/2026, depois de um dia de diagnóstico dos 10 números da GSS.
> Código: edge `whatsapp-monitor`, migração `20261112130000_whatsapp_monitor.sql`,
> regra de disponibilidade em `whatsapp_numeros_recalcular_disponibilidade()`.

## Por que existe

O estado que a Meta devolve para cada número (`healthStatus`) **mente com frequência**:

- O aviso de pagamento **141006** ("WABA BLOCKED") ficou preso em 7 contas por dias. Nesse tempo os
  mesmos números entregaram centenas de modelos pagos. Quando o pagamento falha de verdade, o envio
  volta com **131042**.
- "Conectado" no painel não garante nada: o 93618-3444 aparecia conectado e tinha perdido a permissão
  na Meta em 11/11 às 10h09. Todo envio voltava com erro 100 ("Object does not exist… missing
  permissions"), e o webhook dele parou de receber mensagens.
- Erros do **destinatário** parecem problema do número: 131049 (limite de marketing por pessoa, 24 h),
  130472 (pessoa num experimento da Meta). Eles não dizem nada sobre o nosso número.

Regra do monitor: **só envio real e tráfego real provam o estado de um número.** O aviso da Meta é
só uma pista.

## As três camadas

| Camada | Quando | O que faz | Custo |
|---|---|---|---|
| **Tráfego** | De hora em hora | Lê o que já aconteceu nas últimas 48 h: modelo entregue, falhas por código, eventos recebidos no webhook | Nenhum |
| **Sonda de permissão** | A cada 6 h | Manda um texto para um número que não existe no WhatsApp. Se a Meta aceitar o pedido, a permissão está ok. Se recusar na hora com erro 100, 190, 131005 ou 133010, o número perdeu o acesso | Nenhum: mensagem não entregue não é cobrada |
| **Teste real** | Dias úteis, 9h | Só nos números sem nenhum modelo entregue em 48 h, manda um modelo aprovado para um destinatário da lista `whatsapp_monitor_destinos` (no máximo 1 por destinatário por dia, por causa do 131049) | 1 modelo de marketing por número parado |

Cada verificação vira uma linha em `whatsapp_monitor_checagens`. A disponibilidade do número
(`whatsapp_chakra_connections.disponibilidade`, que o assistente de campanha e a tela de números
usam) passa a vir dessas linhas:

1. Sonda com erro de permissão → **Não usar**: "A Meta recusou o acesso ao número. Reconectar pelo Sigma."
2. Falha 131042 em envio real nas últimas 48 h → **Atenção**: pagamento recusado de verdade.
3. Qualidade vermelha → **Não usar** (continua).
4. Webhook mudo por mais de 12 h num número que recebe todo dia → **Atenção**: "Nada chega deste número há X h."
5. Aviso 141006 da Meta sem falha real → ignorado (fica só no detalhe).

## Alerta

Quando um número muda de "ok" para "falha" numa categoria, sai um WhatsApp para o Raul pelo mesmo
caminho do `bridge-healthcheck-v2` (chip Evolution de disparos). O alerta só sai uma vez por mudança,
não a cada hora.

## O que aprendemos em 12/11 (para não repetir)

- **Duas contas Chakra.** Desde 27/10 a conta é a da GSS (`CHAKRA_API_KEY_GSS`). A lista
  `CHAKRA_IDS_CONTA_PULSE` em `supabase/functions/_shared/chakra.ts` diz quais números ainda passam
  pela conta da Pulse. Número que a Pulse não enxerga mais (o 6429-1713 até 12/11) aceita o pedido de
  modelo com "pendente" e **nunca manda para a Meta**. Para conferir: `chakra-diagnostico` mostra os
  modelos que cada conta enxerga.
- **Plugins antigos.** Cada conexão grava um `plugin_id`. Na conta GSS só dois plugins têm as contas
  de WhatsApp listadas: `d9a6180c` (BM da GSS) e `10b967db` (BM do João Villela). Os outros são de
  conexões antigas e funcionam por enquanto. Se um número começar a falhar, apontar para o plugin vivo
  é o primeiro teste.
- **Janela de 24 h.** Quando a pessoa escreve para o número, por 24 h dá para mandar texto livre, e o
  marketing não sofre 131049 nem 130472. É o jeito mais barato de testar um número na mão.
- **Histórico do celular (coexistência).** Ao reconectar um número que também usa o app, a Meta só
  libera os 6 meses de histórico nas primeiras 24 h e uma vez só. O `chakra-webhook` importa sozinho
  (evento `history` → `importar_historico_chakra`).
- **Reconectar** um número quebrado é com a GSS: Configurações › WhatsApp › Conectar número, no modo
  coexistência, com um admin da BM aceitando todas as permissões.

## Ferramentas

- `chakra-diagnostico` (edge, só service_role): estado de cada número nas duas contas.
- `whatsapp-monitor` (edge, cron): as três camadas acima. `{"acao":"tudo"}` roda tudo na hora.
- `whatsapp_monitor_checagens`: histórico das verificações. Consultar a última por número:
  `select distinct on (phone_e164, tipo) * from whatsapp_monitor_checagens order by phone_e164, tipo, em desc;`
