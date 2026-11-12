# O que as respostas dos médicos dizem e o Sigma não faz (análise de 12/11/2026)

Base: as 85 conversas que ficaram sem resposta da IA entre 09 e 12/11 (OpenAI sem crédito), lidas uma a uma, mais a
classificação automática de 892 conversas (`conversa_classificacao`, Gemini). Campanhas: Pediatria (Nova Prata - RS),
Anestesiologia (São Miguel do Oeste - SC) e GO (Braço do Norte - SC). Sem nomes aqui; o PDF de revisão tem os casos.

## O que os 85 responderam

| O que aconteceu | Quantos | Exemplo (trecho) |
|---|---|---|
| Caiu no WhatsApp do consultório: secretária, menu de robô, "horário de atendimento" | ~28 (33%) | "Sou Vanessa, secretária da Dra…", "Digite a opção desejada" |
| Quer saber da vaga ("pode enviar", "qual a proposta", "quais os valores") | ~30 (35%) | "Pode enviar os detalhes" |
| Número errado | 10 (12%) | "Esse telefone não pertence a Carlos P B Mori. Favor descartar" |
| Respondeu SAIR (quase sempre a secretária) | 9 | "*Elisa Hamaya:* Sair" |
| Recusou sem motivo | 6 | "Não, obrigada" |
| Distância | 5 | "É muito longe para mim", "moro num outro estado" |
| Mandou outro número | 3 | "nosso novo WhatsApp oficial (41) 9…", "Segue celular do Dr Kaique [contato]" |
| Aposentou | 1 | "estou me aposentando… foi meu último dia" |

Na base inteira (892 conversas classificadas): 101 consultório (11%), 50 contato errado (6%), 37 fora do perfil, 10 indicações.

## O que o Sigma deixa de fazer

1. **Número errado não muda nada no lead.** A IA responde "vou tirar esse número da base", mas nada acontece:
   dos 50 leads com contato errado, **0** tiveram o telefone marcado em `telefones_inativos`, **32** continuam em
   campanha aberta e **30 têm outro telefone** (`telefones_adicionais` / `whatsapp_phones`) que nunca foi tentado.
   A próxima campanha manda de novo para o mesmo estranho. O botão "não é o médico" da conversa (`not_the_doctor`,
   15 marcados) também não chega ao lead.
2. **Consultório é tratado como médico.** Um terço das respostas é da secretária ou do robô do consultório. A IA
   responde ao robô ("Vi que caiu no automático aqui…", "Entendi, obrigado por me avisar. Vou atualizar essa
   informação"). Dos 101 leads assim, 94 seguem em campanha e 59 têm outro número. O certo: marcar o número como
   "consultório", tentar o outro número do lead e, se não houver, uma única mensagem à secretária pedindo que repasse
   ou o contato direto do médico.
3. **Número novo enviado na conversa se perde.** "Novo WhatsApp oficial", link wa.me e cartão de contato (vCard)
   chegam e ninguém cadastra. O número certo do médico estava na mão.
4. **Recusa e aposentadoria não fecham o médico de vez.** "Não, obrigada" e "estou me aposentando" deveriam encerrar o
   lead nesta campanha (recusa) ou em todas (aposentado = fora do perfil), sem nova mensagem da IA.
5. **A IA não entrega o que o médico pediu.** Quem diz "pode enviar os detalhes" recebe outra pergunta ("tu tá atuando
   nessa área hoje?"), até quando o cadastro já tem o RQE da especialidade. A equipe humana manda o bloco de detalhes
   da vaga na hora. Valor: a IA empurra para o Vinicius e, num caso, debochou ("250k mês tá fora da realidade… kkk").
6. **Distância vira beco.** Quem diz "muito longe" ou "moro em outro estado" diz também onde está: dá para guardar a
   região no perfil e oferecer vaga perto dele depois (o classificador já extrai `cidade_medico` / `uf_medico`).
7. **Público errado na lista.** Residentes ("Residente de Pediatria") entraram em campanha de plantão de pediatra.

## Proposta: "contato inteligente" (o que o CRM faz sozinho com cada resposta)

| Resposta | Ação automática | Onde |
|---|---|---|
| Número errado | telefone vai para `telefones_inativos` (com motivo e data); sai das campanhas abertas; se houver outro número, a campanha continua por ele; se não, o lead entra numa fila "precisa de telefone" | classificador + RPC no lead |
| Consultório / robô | número marcado como "consultório"; tenta outro número; sem outro, 1 mensagem à secretária pedindo o contato direto; IA não conversa com robô | IA (guarda antes do modelo) + lead |
| Número novo na conversa (texto, wa.me, vCard) | extrai, cadastra em `whatsapp_phones` com origem "informado na conversa", oferece à equipe "falar por este número" | webhook / IA |
| SAIR / recusa | encerra sem resposta (SAIR: nunca mais por esse número; recusa: só esta campanha) | já existe em parte, conferir o caso da secretária |
| Aposentado / não atua | `fora_do_perfil` em todas as campanhas | classificador |
| Distância | guarda cidade/UF no perfil; entra no "banco de interesse" para vagas da região dele | classificador + perfil |
| "Pode enviar" | IA manda os detalhes da vaga (do briefing) e só depois qualifica | prompt |

No lead, uma linha do tempo de telefones: qual número, de onde veio, situação (ativo, errado, consultório,
informado pelo médico) e quem marcou. É isso que permite dizer "esse número não é dele, mas este outro pode ser".

## Prompt da IA (correções que a leitura pede)

- Pediu detalhes: mandar os detalhes do briefing, não outra pergunta.
- Não perguntar especialidade/RQE que o cadastro já tem.
- Nunca ironizar valor; acolher e passar para o responsável.
- Resposta atrasada (mais de 12 h): reconhecer a demora numa frase.
- Não responder a robô de consultório nem agradecer recusa com nova mensagem.
- Variar a abertura ("Tem uma vaga nova de X… tu tá atuando nessa área?" se repete em quase todas).
