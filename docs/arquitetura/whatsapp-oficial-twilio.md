# WhatsApp oficial via Twilio

## Objetivo

Manter dois transportes explícitos por campanha:

- `evolution`: API não oficial, usa chips do Sigma;
- `twilio`: API oficial, usa sender registrado e template aprovado pela Meta.

## Fase 1 — fundação

- Credenciais Twilio somente nas secrets `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN`.
- Espelho local `whatsapp_official_templates`.
- Edge `twilio-content-templates` para sincronizar, criar rascunho e enviar à aprovação.
- Tela `/prospeccao/templates-whatsapp`.
- Campanha guarda `whatsapp_provider` e `official_template_id`.

### Visão operacional dos templates

A tela do Sigma separa os estados que exigem decisões diferentes:

- **Aprovado:** pode ser selecionado em campanha oficial;
- **Em análise:** recebido pela Meta, sem ação operacional até a decisão;
- **Rascunho:** pode ser revisado e enviado para aprovação;
- **Rejeitado:** exibe o motivo e exige correção;
- **Todos:** visão administrativa completa.

Cada template possui prévia em mockup de celular com os valores de exemplo aplicados às
variáveis. Campanhas oficiais nunca devem listar rascunhos, templates em análise ou rejeitados
como opções de envio.

## Regras de produto

- Prospecção fria e apresentação de oportunidade são categoria `MARKETING`.
- `UTILITY` fica restrita a atendimento, solicitação ou relação já existente.
- Variáveis de templates WhatsApp são numéricas e sequenciais (`{{1}}`, `{{2}}`).
- Criar rascunho e enviar para aprovação são ações separadas.
- A tela nunca recebe o Auth Token.

## Pendente para liberar disparos oficiais

1. Registrar e aprovar um WhatsApp Sender na conta Twilio.
2. Salvar `TWILIO_WHATSAPP_FROM` ou `TWILIO_MESSAGING_SERVICE_SID` nas secrets.
3. Implementar o transporte Twilio no processador de campanhas e callbacks de status/inbound.
4. Validar opt-in, janela de 24 horas, opt-out, idempotência e timeline unificada.
5. Rodar piloto controlado antes de habilitar campanhas reais.

Enquanto os itens acima não forem concluídos, selecionar Twilio organiza a configuração,
mas não autoriza o processador a enviar mensagens pela API oficial.
