# Diagnóstico dos números oficiais (Chakra) — 08/11/2026

> Fase 0.1 do plano `docs/arquitetura/plano-goal-gss-dono-no-comando.md`.
> Fontes: `chakra-connect refresh_status` rodado em 08/11 (saúde que a Meta devolve por número, conta e app) + mensagens dos últimos 7 a 14 dias em `sigzap_messages`.
> **Falta a prova final:** envio de teste real em cada número (botão "Enviar teste" em Configurações › WhatsApp), com o "ok" do Raul.

## Resposta curta

- **"Nome não existe" (`NON_EXISTS`) não bloqueia nada.** A própria Meta explica no retorno: *"Your display name has not been approved yet. Your message limit will increase after the display name is approved."* O número envia, só com limite menor (`can_send_message: LIMITED`). Em coexistência o nome vem do app WhatsApp Business; pela API nunca foi pedido um nome — por isso "não existe". Dá para pedir no WhatsApp Manager (Meta Business › WhatsApp Manager › Números de telefone › Nome de exibição).
- **"Nome recusado" (`DECLINED`)** só no 6429-1713: a Meta recusou o nome pedido. Também fica `LIMITED`.
- **O bloqueio real é pagamento.** 7 dos 10 números estão com a **conta de WhatsApp (WABA) bloqueada pelo erro 141006** — *"There is an error with the payment method. This will block business initiated conversations."* Isso trava **campanha e primeiro contato** (modelos). Responder um médico que escreveu nas últimas 24 h continua funcionando, e mensagens mandadas pelo celular (coexistência) também.
- Cada número está numa **conta (WABA) própria**, mas todas pertencem ao **mesmo portfólio** do Meta Business (id `1379464343869288`). O cartão precisa estar válido e vinculado **em cada uma das 7 contas** — dá para cadastrar uma forma de pagamento no portfólio e atribuir a todas.
- O aviso de **SIP/chamadas** (138024, 138025) que aparece em todos é sobre ligação por WhatsApp. Não afeta mensagem — ignorar.

## Número a número

| Número | Nome | Uso | Meta (pode enviar) | Conta (WABA) | 7 dias | Situação no Sigma | O que fazer |
|---|---|---|---|---|---|---|---|
| (47) 93618-3416 | Dr Maikon Madeira | Prospecção | Bloqueado | 141006 pagamento | 110 enviadas, 1 falha | Atenção | Cartão na WABA `1504151361034707` |
| (47) 93618-3444 | Gestão Serviço Saúde | Prospecção | Bloqueado | 141006 pagamento | 65 / 1 | Atenção | Cartão na WABA `4478933395718271` |
| (47) 93618-3761 | Maicon Madeira | Prospecção | Bloqueado | 141006 pagamento | 10 / 3 (131042 em 05/11) | Atenção | Cartão na WABA `1727196735137185` |
| (47) 9713-2474 | GSS - Gestao Servico saude | Prospecção | Bloqueado | 141006 pagamento | 15 / 3 (131042) | Atenção | Cartão na WABA `2114175025899667` |
| (47) 9233-5309 | Ester - GSS | Prospecção | Bloqueado | 141006 pagamento | 61 / 1 | Atenção | Cartão na WABA `1674650770944329`; modelo padrão foi **reprovado** nesta conta — reenviar |
| (47) 9292-0538 | Gestão de Serviços de Saúde | Prospecção | Limitado | Disponível | 640 / 462 (72%) | Atenção | Conta ok. Falhas são do destinatário: 131049 (Meta segura marketing para quem recebe muito), 131026 (não entregável), 130472 (experimento da Meta no destinatário). Reduzir volume diário e limpar a lista |
| (47) 6429-1713 | Maikon Madeira | Prospecção | Limitado | Disponível | 0 / 0 | Atenção | Nome de exibição recusado; não envia nada desde 24/09. Pedir nome novo; código de verificação expirado — reverificar o número |
| (47) 9264-7508 | Maikon Madeira | Prospecção | Bloqueado | 141006 pagamento | 0 / 0 | **Não usar** | Qualidade **vermelha**; último entregue 16/10. Cartão + deixar descansar |
| (47) 9722-2007 | Dr. Maikon Madeira | Prospecção | Bloqueado | 141006 pagamento | — | **Não usar** | Conectado em 28/10, **nenhum evento** chegou ao Sigma (nem mensagem, nem eco do celular). Ver se o celular está em uso e mandar uma mensagem de teste para ele |
| (47) 99018-860 | Amni Julia - GSS | **Financeiro** | Limitado | Disponível | 15 / 0 | Pronto | Só automações financeiras (conta Chakra da Pulse). Fora da prospecção |

**Prontos para campanha hoje: 0 de 9.** Todos os de prospecção estão em "atenção" ou "não usar".

## Lista para o Vinícius

1. Meta Business (portfólio da GSS) › Configurações › Pagamentos: conferir o cartão e **atribuir a forma de pagamento a cada conta de WhatsApp** listada acima (7 contas com 141006).
2. Esperar até 24 h e apertar **"Conferir com a Meta"** em Configurações › WhatsApp; os números devem sair de "Atenção".
3. Em cada número, **"Enviar teste"** para o próprio celular. Só "Entregue" prova que a campanha vai sair.
4. 6429-1713: pedir nome de exibição novo e reverificar o número.
5. 9722-2007: confirmar se o celular é usado; mandar uma mensagem para ele e ver se aparece em Conversas.
6. 9233-5309 (Ester): reenviar o modelo de prospecção para aprovação.

## O que mudou no Sigma (08/11)

- `whatsapp_chakra_connections` ganhou `uso` (`prospeccao` / `financeiro` / `pessoal`) e `disponibilidade` + `disponibilidade_motivo` + `disponibilidade_em`.
- `whatsapp_numeros_recalcular_disponibilidade()` junta saúde da Meta, qualidade, nome e entregas reais de 7 dias. Cron `whatsapp-disponibilidade` de hora em hora; cron `chakra-refresh-status` às 7h, 12h e 17h (BRT) sincroniza com a Chakra e recalcula.
- `chakra-connect` ação `send_test` (manda um modelo aprovado do próprio número) + RPC `whatsapp_envio_teste_status` (lê o status final no webhook).
- Tela **Configurações › WhatsApp** (`NumerosOficiaisTab`) e item **"Números WhatsApp"** no menu.
