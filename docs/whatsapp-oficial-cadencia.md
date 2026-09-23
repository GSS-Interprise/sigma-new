# WhatsApp oficial: cadência e contenção de rate limit

## Comportamento do Sigma

- Novas campanhas Chakra/Twilio começam com intervalo aleatório de 2–3 minutos por contato. A equipe pode editar a faixa entre 2 e 20 minutos na configuração da campanha.
- Em uma janela de 10 horas, 2–3 minutos equivalem a 200–300 contatos teóricos em uma campanha, antes do teto diário (padrão Sigma: 250), pausas operacionais, retries e outras campanhas usando o remetente. Isso não é garantia de volume nem substitui limites do provedor.
- Todas as chamadas oficiais do mesmo número passam por uma reserva durável no banco: no máximo uma chamada em andamento por remetente e um intervalo mínimo global de 3,5 segundos entre chamadas. Remetentes diferentes têm limites independentes.
- O fluxo de campanha recorrente e o envio controlado one-shot usam o mesmo gate. O número reservado para Financeiro/NF deve permanecer associado somente ao fluxo financeiro e não ser selecionado para campanhas.

## Rate limit e retentativas

- Quando Chakra/Meta retorna `429`, Sigma grava o cooldown pelo `Retry-After` e reagenda o lead/run para depois desse prazo. Sem uma duração fornecida, usa 60 segundos como fallback.
- Contenção do próprio gate e `429` não contam como mensagem enviada, não incrementam o contador de falhas/retries do lead e não removem o lead da fila.
- Respostas finais de entrega continuam vindo pelos webhooks, independentemente da aceitação inicial pelo provedor.
- A reserva de chamada tem lease para recuperar automaticamente quando uma Edge Function é encerrada antes de liberá-la.

## Operação responsável

- A capacidade diária do portfólio, a taxa por minuto do provedor e o volume que a equipe deseja atingir são limites diferentes.
- Utilize campanhas iniciadas pela empresa somente para pessoas que forneceram seu telefone e autorizaram receber mensagens da GSS no WhatsApp. A aprovação de um template não substitui esse consentimento. Respeite opt-outs e reclamações.
- Referência: [Política de Mensagens do WhatsApp Business](https://business.whatsapp.com/policy?lang=pt_BR).

## Verificação operacional

1. Confirmar o remetente oficial selecionado e sua finalidade antes de ativar campanha.
2. Acompanhar `429`, `retry_after_ms`, tempo em cooldown e mensagens efetivamente entregues no webhook.
3. Aumentar o volume por etapas apenas enquanto qualidade, opt-outs, erros e entrega permanecerem saudáveis.
4. Não executar uma rajada manual para tentar contornar o cooldown do provedor.
