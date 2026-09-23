# Plano: Cadência coordenada para WhatsApp oficial

**Objetivo:** aumentar a capacidade diária de campanhas oficiais com cadência configurável e compartilhada por remetente, respeitando `Retry-After` do Chakra e sem contar contenção como falha de destinatário.

**Contexto confirmado:** múltiplas campanhas compartilham o mesmo remetente oficial; a cadência recorrente atual é de 2 a 20 minutos efetivos, com configuração observada de 3–4 minutos para ANESTESIO; o disparo controlado tinha pausa fixa de 1,2 s; e respostas 429 passam pela reconciliação de falha. O serviço de taxa será exclusivo dos remetentes oficiais. O novo número que Vinicius reservou para Financeiro/NF fica fora deste escopo.

**Restrições:** não enviar lote de teste ou em massa durante a implementação; não aumentar produção só por mudança de código; preservar alterações preexistentes do usuário; adotar opt-in exigido pela política do WhatsApp para mensagens iniciadas pela empresa.

## Tarefas

1. **Cobrir cadência e classificação de contenção com testes antes da implementação.** Criar testes Deno para intervalos oficiais, backoff com `Retry-After`, e distinção entre contenção interna e falha real; executar para comprovar falha inicial.
2. **Coordenar envios por remetente oficial no banco.** Adicionar tabela e RPCs atômicos de reserva/liberação/cooldown com lease, intervalo global conservador e cooldown atualizável por `Retry-After`; limitar execução ao mesmo `official_sender_id` e nunca ao número financeiro.
3. **Integrar o limitador ao endpoint oficial e às duas filas de campanha.** Reservar antes do request ao provedor; registrar cooldown no 429; liberar no sucesso/erro; devolver contenção como erro retryable sem gastar tentativa nem aumentar falhas permanentes; reagendar com jitter/backoff.
4. **Ajustar velocidade configurada sem rajada.** Manter o piso de 120 segundos, expor a faixa ajustável de 2–20 minutos na criação/edição das campanhas oficiais com padrão de 2–3 minutos; manter limites diários existentes; controlar execução one-shot no mesmo limitador. Não alterar em produção as cadências das campanhas em execução sem validação do público elegível.
5. **Documentar e verificar.** Registrar o runbook específico, executar testes Deno, lint/build e revisão de diff; aplicar apenas a migração nova e publicar seletivamente em `main`, sem incluir alterações preexistentes. Confirmar deployments sem iniciar disparos.

Cada tarefa deve terminar com testes relevantes; a última encerra com revisão de diff e publicação seletiva.
