---
capacidade: Solicitação e acompanhamento de notas fiscais (contas a pagar médicos)
projeto: Sigma GSS
status: mapeado — reunião com a Mavi em 22/09/2026
depende_de: fechamento multi-fonte (financeiro-fechamento-fases-multifonte.md)
---

# Notas fiscais — solicitação, recebimento e cobrança

> Etapa mais trabalhosa do financeiro da GSS: a cada competência, dezenas de médicos
> precisam receber o pedido de NF, mandar a nota e ser cobrados quando esquecem. Hoje
> isso roda no WhatsApp, mensagem por mensagem, e o controle de "quem mandou" é a
> conversa arquivada. A meta desta capacidade é o volume rodar sozinho: o sistema
> pede, cobra e registra; a pessoa só revisa e resolve exceção.

## 1. Onde entra no fluxo (corrigido na reunião de 22/09)

```
[1] FECHAMENTO          importa, ajusta, confere e LIBERA            (Mavi)
[2] NOTAS FISCAIS       pede, recebe, cobra e confere as NFs         (assistente do financeiro)
[3] APROVAÇÃO           diretoria aprova o PAGAMENTO, no canal       (João / sócios)
[4] PAGAMENTO           paga, comprovante, contabilidade             (Thais)
```

Correções que a reunião trouxe e que já estão no código:

- A **conferência da Mavi é a liberação** — ela não clica médico a médico. `FinanceiroLiberarDialog`
  marca a competência inteira como conferida, grava o fechamento em `status = 'em_nf'` e avisa no
  canal Financeiro (interno). Nada disso vai para a diretoria.
- A **diretoria só aparece na fase 3**, depois que as notas voltarem (`FinanceiroFecharDialog`,
  status `aguardando_aprovacao`, mensagem com ação no canal).
- **Comprovante continua no sistema.** O que estava errado era ele aparecer no canal na hora do
  fechamento.

## 2. O que já existe (não refazer)

| Peça | Estado |
|---|---|
| `financeiro-solicitar-nf` (edge) | pronta: monta o e-mail com competência, unidade, plantões e valor, envia pelo Resend, `reply-to` tokenizado `nf+<pagamento_id>@nf.…`, grava `nf_status='solicitada'` e `nf_solicitada_em` |
| `financeiro-nf-lembrete` (edge + cron diário) | pronta: até 3 lembretes a cada 48h para quem não enviou, mais notificação in-app para a equipe |
| `financeiro-nf-inbound` (edge) | pronta no código, **esperando o MX** do subdomínio `nf.` no DNS da GSS |
| Campos em `financeiro_pagamentos` | `nf_status`, `nf_solicitada_em`, `nf_lembretes`, `nf_ultimo_lembrete_em` |
| Anexos | bucket privado `financeiro-anexos` + `financeiro_anexos` |
| Contato do médico | `medicos.email` e `medicos.telefone` preenchidos em 806 cadastros (785 com e-mail plausível) |

O que falta é o **posto de trabalho**: hoje só dá para pedir a NF de um médico por vez, abrindo o
detalhe dele. Não existe lista, lote, indicador nem controle de pendência.

## 3. A tela

Um item de menu próprio (**Notas fiscais**), ao lado de Contas a pagar, com a competência no topo.

**Faixa de indicadores:** a pedir · pedidas · recebidas · conferidas · sem contato. Clicar filtra.

**Filtros:** competência, fechamento (mesmo seletor com busca da tela de fechamento), status da NF,
busca por médico.

**Lista (uma linha por médico do fechamento liberado):** médico, fechamento de origem, valor,
canal de contato, status da NF, quando foi pedida, quantos lembretes, a nota (abrir/baixar).

**Ações em lote, com seleção por checkbox e "selecionar todos os filtrados":**

1. **Pedir a NF** — dispara para os selecionados, com prévia do texto antes de enviar.
2. **Cobrar agora** — lembrete fora do cron, para quem já foi pedido.
3. **Marcar como recebida** / anexar a nota — para a NF que chegou por WhatsApp.
4. **Conferir** — valor da nota confere com o valor a pagar; divergência vira pendência com motivo.

**Regras que a tela precisa respeitar:**

- Só lista médicos de fechamento **liberado** (`em_nf` para frente).
- Médico **sem e-mail ou sem telefone** aparece separado, com o cadastro a um clique — nunca entra
  num envio silencioso que falha.
- Cada envio grava log por médico (canal, destino, quando, quem disparou, resultado).

## 4. Envio

O texto é o mesmo padrão de hoje; muda nome, competência, unidade e valor. A pessoa revisa e
confirma — é o que a Mavi pediu: "mudar três palavras, não escrever a mensagem".

- **Modelo editável** em `config_lista_items` (assunto + corpo com variáveis), para não precisar de
  deploy quando o texto mudar.
- **Fila com ritmo**: o lote enfileira e envia em blocos, para não queimar reputação de domínio nem
  estourar rate limit.
- **Teste sem risco**: `email_override` já existe na edge — o botão "enviar teste para mim" usa isso.

## 5. Recebimento — três caminhos, e o principal não depende do DNS

1. **Link de envio no próprio e-mail** (recomendado, nasce funcionando): rota pública tokenizada
   `/nf/<token>`, o médico anexa o PDF/XML, o arquivo cai no bucket e o pagamento vira `recebida`.
   Não depende do MX nem de o médico responder o e-mail certo.
2. **Resposta por e-mail** (`financeiro-nf-inbound`): liga sozinho quando o MX entrar no DNS.
3. **Anexo manual** pela equipe: para quem mandar por WhatsApp de qualquer jeito.

Nos três, o resultado é o mesmo: nota no cofre, status atualizado, data registrada.

## 6. Cobrança

O cron de lembrete já roda. O que falta é torná-lo visível e configurável:

- Intervalo e teto de lembretes por competência (hoje fixos em 48h e 3).
- Painel "faltam N notas", com botão de cobrar em lote.
- Resumo por e-mail ou canal para a equipe às segundas: quem está pendente há mais tempo.

## 7. WhatsApp (decisão do Raul, fora desta entrega)

A Mavi prefere WhatsApp, porque médico não abre e-mail. Requisitos: número separado do que faz
prospecção, no mesmo portfólio da Meta, e template aprovado. Custo por mensagem (~R$ 0,36) contra
o e-mail, que é fração disso. O envio em lote e o controle de status são os mesmos — o canal é um
parâmetro. Construir primeiro por e-mail com link de upload, e ligar o WhatsApp quando o número
estiver aprovado.

## 8. Entregas

| # | Escopo | Estado |
|---|---|---|
| N1 | Tela Notas fiscais: lista, filtros por status, indicadores, busca | ✅ 23/09 — `/financeiro/notas-fiscais` |
| N2 | Envio em lote com prévia, envio de teste e log por médico | ✅ 23/09 — edge `financeiro-nf-enviar` + `financeiro_nf_solicitacoes` |
| N3 | Link tokenizado de upload (rota pública `/nf/<token>`) + recebimento | ✅ 23/09 — edge `financeiro-nf-upload` (`--no-verify-jwt`), testada ponta a ponta |
| N4 | Cobrar em lote (botão "Cobrar") | ✅ 23/09 — reaproveita `tipo='lembrete'`; parâmetros do cron continuam fixos (48h, teto 3) |
| N5 | Conferência da nota (valor × a pagar) e pendência com motivo | pendente — 1 dia |
| N6 | Canal WhatsApp pelo número do financeiro | código pronto, **bloqueado**: ver §10 |

### Configuração (config_lista_items)

| Chave | Para quê |
|---|---|
| `financeiro_nf_link_base` | base do link do médico (fallback: `APP_URL` → `https://sigma-gss.lovable.app`) |
| `financeiro_whatsapp_sender_id` | id em `whatsapp_official_senders` do número do FINANCEIRO (nunca o de prospecção) |
| `financeiro_nf_whatsapp_template_id` | id do template aprovado, com 4 variáveis: nome, competência, valor, link |
| `financeiro_nf_reply_domain` | domínio do reply-to tokenizado (inbound) |
| `financeiro_canal_id` | canal que recebe o aviso "NF recebida" |

## 10. WhatsApp — o que falta para ligar

O envio por WhatsApp já está implementado na edge (template via Chakra, remetente escolhido por
configuração no servidor, sem número no front, registro de `provider_message_id` e do erro do
provedor; só marca como solicitada quando o provedor aceita). Falta o que não depende de código:

1. **Número do financeiro conectado.** Em `whatsapp_official_senders` só existe um remetente Chakra
   `connected` (+55 47 92647508, o da prospecção) e um `pending` criado em 23/09 (+55 47 64291713).
   Nenhum bate com o "47 99018860" informado. Confirmar o número em E.164 e conectar.
2. **Template utility aprovado** para NF (o texto atual da base é de prospecção). Sugestão de corpo:
   `Dr(a). {{1}}, a GSS precisa da nota fiscal referente a {{2}}, no valor de {{3}}. Envie por aqui: {{4}}`.
3. Depois de aprovado, gravar os dois ids em `config_lista_items` e testar com um número interno.

Recebimento **pelo** WhatsApp (o médico responde com o PDF) é um passo a mais: tratar o evento de
documento no `chakra-webhook`/`receive-whatsapp-messages`, casar com o pagamento e gravar no cofre.
Enquanto isso, o link do e-mail já resolve o recebimento, inclusive quando o pedido vai por WhatsApp.

## 9. Riscos e pontos abertos

- **MX no DNS da GSS** continua pendente; por isso o link tokenizado é o caminho principal.
- **Médico que ignora e-mail**: mitigado pelo lembrete e pela cobrança em lote; resolvido de vez
  com o WhatsApp (item 7).
- **Nota com valor diferente do fechamento**: precisa de decisão — recusa automática ou pendência
  para a equipe tratar. Sugestão: pendência, nunca recusa automática.
- **Retenção de imposto e médico pessoa física**: não mapeado; confirmar com a Mavi antes do N5.
- **Fora de escopo:** emissão de NFS-e pela GSS, integração com o Conta Azul e substituição do
  WhatsApp como canal de relacionamento.
