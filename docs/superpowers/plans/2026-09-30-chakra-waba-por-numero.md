# Corrigir vínculo Chakra por número — plano de implementação

**Objetivo:** permitir um envio de teste pelo novo número +55 47 9292-0538 sem associá-lo à conta WhatsApp do número antigo.

**Diagnóstico:** o payload salvo para o número `1179260535268840` contém `phone.waba = 987580980748042`, mas `chakra-connect` gravou `1701305377585648`, pois usa `wabas[0]` para todos os telefones. O template registrado para o novo plugin também foi sincronizado da conta incorreta. O teste via `twilio-whatsapp-send` recebeu HTTP 502, com Chakra HTTP 400 `request_failed`.

**Arquitetura:** resolver a conta por telefone no cadastro; recusar payload ambíguo. Corrigir apenas o vínculo persistido desse número, sincronizar os templates da conta correta e testar uma única mensagem para o contato de teste do Raul. Preservar os demais remetentes e o financeiro.

**Stack:** Supabase Edge Functions (Deno), Postgres e Chakra API.

## Tarefa 1 — Cadastro correto de números

**Arquivos:** `supabase/functions/_shared/chakra.ts`, `supabase/functions/_shared/chakra_test.ts`, `supabase/functions/chakra-connect/index.ts`.

- [x] Escrever teste que entrega dois WABAs, com `phone.waba` apontando para o segundo, e exige `987580980748042`.
- [x] Escrever teste que rejeita WABA ambíguo quando o telefone não informa vínculo e existem duas contas.
- [x] Executar `deno test supabase/functions/_shared/chakra_test.ts` e confirmar falha esperada.
- [x] Implementar a resolução por número e usá-la em `save_connection`.
- [x] Reexecutar teste e `deno check supabase/functions/chakra-connect/index.ts`.

## Tarefa 2 — Recuperação e teste controlado

**Arquivos:** uma migração SQL específica para o vínculo inconsistente; nenhum lead de campanha alterado.

- [x] Consultar o vínculo atual e aplicar atualização condicional somente ao número `1179260535268840`, com WABA anterior `1701305377585648`.
- [x] Publicar `chakra-connect` e sincronizar templates com o WABA correto.
- [x] Cadastrar o template de teste somente para o novo número, aguardar aprovação e verificar plugin/WABA.
- [x] Impedir em `twilio-whatsapp-send` o uso de template aprovado em outro WABA e publicar a função.
- [x] Enviar uma única mensagem ao lead de teste `8ce8af6a-724c-41cc-abbe-e24b4b4ddc4f`; conferir resposta da API e status posterior no webhook.
- [x] Registrar resultado e eventuais bloqueios do provedor sem reenvios cegos.

**Resultado em 30/09/2026:** o primeiro teste retornou Chakra HTTP 400 porque o template era do WABA antigo. Após corrigir a associação, sincronizar a conta correta e obter aprovação do template, o teste pelo `+55 47 9292-0538` retornou `queued` e o webhook atualizou a mensagem `1135de04-f105-4479-b0b3-96d4c33fbb4a` para `delivered`. O contato pertence a uma conversa de teste e não consumiu a fila da campanha. `deno test supabase/functions/_shared`: 12 passaram, 0 falharam.

## Tarefa 3 — Resposta SAIR no canal oficial

**Arquivos:** `supabase/functions/_shared/chakra.ts`, `supabase/functions/_shared/chakra_test.ts`, `supabase/functions/chakra-webhook/index.ts`.

- [x] Escrever teste para reconhecer `SAIR` isolado e rejeitar uma frase comum que contenha "sair".
- [x] Confirmar falha; implementar classificação do texto inbound.
- [x] Encaminhar pedido explícito ao handler existente de opt-out após persistir o inbound e antes de acionar a IA.
- [x] Verificar `deno check`, testes e publicar `chakra-webhook`.
- [x] Verificar no código que nenhuma confirmação por chip Evolution será tentada para o remetente oficial (`instance_name` vazio).

**Verificação complementar:** o segundo número de prospecção `+55 47 6429-1713` também estava vinculado ao WABA da Amni. A mesma migração condicional corrigiu seu vínculo para `1108596901697420`. Em 30/09/2026, os quatro números Chakra têm o WABA persistido igual ao `phone.waba` informado pelo provedor. `deno test supabase/functions/_shared`: 13 passaram, 0 falharam. A resposta SAIR ainda não foi exercitada com um descadastro real, para não bloquear o contato de teste do Raul.

## Tarefa 4 — Template de campanha com saída clara

**Arquivos:** `supabase/functions/_shared/chakra.ts`, `supabase/functions/_shared/chakra_test.ts`, `supabase/functions/chakra-connect/index.ts`.

- [x] Testar a definição do template de oportunidade com a frase autorizada pelo Raul: "Caso nao deseje receber mensagens como esta, responda SAIR".
- [x] Adicionar a definição como variante exclusiva do número selecionado no envio para aprovação.
- [x] Publicar `chakra-connect`, submeter somente ao WABA do novo número e sincronizar o status de aprovação.
- [x] Preservar a configuração da campanha enquanto faltam a aprovação do template e a reconciliação dos registros de aceite.

**Estado externo:** `gss_oportunidade_sair_20260930` está `pending` na Meta após a submissão ao WABA `987580980748042`. O template de diagnóstico foi aprovado e sua mensagem de teste foi entregue ao Raul. A campanha principal ainda aponta para o remetente antigo; a liberação para a fila depende de um template de campanha aprovado e do vínculo dos aceites aos leads.

## Foco de revisão

- Número de outro WABA no mesmo plugin não deve herdar o primeiro WABA.
- Payload com duas contas e telefone sem vínculo deve retornar erro, sem gravar associação presumida.
- Template do primeiro WABA não deve ser escolhido para o novo número.
- Teste não deve consumir um lead da campanha nem mudar a cadência.
- Resposta HTTP aceita pelo Chakra não deve ser relatada como entregue antes do webhook.
