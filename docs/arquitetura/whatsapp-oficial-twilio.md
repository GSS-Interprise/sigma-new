# WhatsApp oficial via Twilio

## Objetivo

Manter dois transportes explícitos por campanha:

- `evolution`: API não oficial, usa chips do Sigma;
- `twilio`: API oficial, usa sender registrado e template aprovado pela Meta.

## Fase 1 — fundação

- Credenciais Twilio somente nas secrets `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN`;
  subcontas usam o sufixo do alias, por exemplo `TWILIO_ACCOUNT_SID_SUBCONTA_2` e
  `TWILIO_AUTH_TOKEN_SUBCONTA_2`.
- Espelho local `whatsapp_official_templates`.
- Edge `twilio-content-templates` para sincronizar, criar rascunho e enviar à aprovação.
- Tela `/prospeccao/templates-whatsapp`.
- Campanha guarda `whatsapp_provider`, `official_template_id` e `official_sender_id`.
  Sender e template também guardam `twilio_account_key`; a UI só permite combinar
  itens da mesma conta.

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
- O webhook valida a assinatura com o token da conta correspondente ao número
  remetente; a conversa mantém o alias da subconta na instância Twilio.

## Pendente para liberar novos remetentes oficiais

1. Registrar e aprovar um WhatsApp Sender na conta Twilio.
2. Criar/aprovar pelo menos um template nessa mesma conta.
3. Configurar o webhook do sender e sincronizá-lo no Sigma.
4. Validar opt-in, janela de 24 horas, opt-out, idempotência e timeline unificada.
5. Rodar piloto controlado antes de habilitar campanhas reais.

Uma campanha só pode enviar quando o sender estiver ativo, o template aprovado e
ambos pertencerem à mesma conta Twilio. A nova subconta fica disponível na UI, mas
permanece sem disparos até a aprovação do seu template.
