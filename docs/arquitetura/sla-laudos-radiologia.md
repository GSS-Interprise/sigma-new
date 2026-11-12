# SLA de laudos — área de Radiologia no Sigma

Projeto da GSS (patrocínio: Ramone; dono do processo: Wagner Oliveira). O robô lê a fila de exames não laudados no PACS
e avisa o radiologista de plantão antes do prazo vencer; se vencer, liga e sobe a escala. Contexto completo no Vault:
`Projetos/GSS-SLA-Laudos-Radiologia.md`. Este doc é o plano de construção.

## A tela responde

**Quem usa:** a pessoa da GSS que acompanha o plantão (e a coordenação de manhã).
**Pergunta:** "Algum exame vai estourar o prazo, e o médico já sabe?"
**Decisão principal:** cobrar o médico (ou subir para o coordenador) quando o robô não resolveu sozinho.

## O que já está no ar (12/11)

| Peça | Onde |
|---|---|
| Túnel SSH até a estação da GSS (VPN + Vue PACS) | Vault, seção "Acesso ao PC da GSS" |
| Coletor v3: OCR da fila "Não lido", atualiza e rola a lista, a cada 3 min | `estacao-gss/sla/` |
| Fila no banco, sem nome de paciente: `sla_exames`, `sla_leituras`, `sla_prazos`, view `sla_exames_saida` | migrations `20261112140000`, `…150000` |
| Edge `sla-coletor` (chave da estação) | `supabase/functions/sla-coletor` |
| Aviso por e-mail quando o coletor para (`sla-alertas`, cron 5 min) | migration `…160000` |

## O que falta

### 1. Escala de plantão (banco + tela)
- `sla_plantao`: unidade, início, fim, `medico_id` (tabela `medicos`, usa `telefone`) **ou** nome + telefone livre, papel
  (`plantonista` | `coordenador` | `diretoria`), ordem na escada.
- Tela: semana em grade (noturno 19h–7h primeiro), copiar a semana anterior, trocar um plantão.
- Regra: o robô só aciona quem está escalado no horário. Sem escala no horário = alerta para o coordenador e e-mail.

### 2. Fila ao vivo (tela)
- Aba nova **"SLA ao vivo"** em `/radiologia` (módulo já existe, permissão `radiologia`).
- Topo: saúde do coletor (última leitura, "parado há X min" em vermelho quando cai) + contadores por origem
  (no prazo / passou de 80% / vencido).
- Lista: origem (cor do PACS), hora do exame, quanto falta (barra), situação do alerta (avisado, assumido por, ligado).
  Sem nome de paciente: quem acompanha acha o exame no PACS pela hora e pela origem.
- **Anotações por exame** (pedido do Raul, 12/11): campo livre + ações rápidas "Avisei o médico por telefone",
  "Exame não precisa de laudo", "Problema no PACS". Fica no histórico do exame e para os próximos alertas
  quando a ação resolve.

### 3. Motor de alertas (edge `sla-alertas`, ação `exames`, cron 2 min)
- **80% do prazo:** WhatsApp oficial (Chakra) para o plantonista, modelo aprovado com botão de resposta
  **"Assumir laudo"**. Payload `sla_assumir:<alerta_id>`; o `chakra-webhook` repassa como já faz com
  `fin_aprovar:` (padrão `financeiro-aprovacao-whatsapp`). Clique registra quem assumiu e para os alertas do exame.
- **100% sem assumir:** ligação Twilio Voice com TTS (`<Say language="pt-BR">`); não atendeu 2 vezes → próximo da
  escada (coordenador, depois diretoria). **Até existir o número com voz:** 2º WhatsApp ao plantonista + WhatsApp
  e e-mail ao coordenador.
- Tudo grava em `sla_alertas` (exame, pessoa, canal, enviado, entregue, respondido, resultado). Essa tabela é o
  "grupo SLA": a API oficial não manda mensagem em grupo, então o histórico mora na tela.
- Não alerta: saída não confiável, coletor parado (já existe o aviso próprio), exame assumido.

### 4. Indicadores do dia seguinte (tela simples)
- % no prazo por origem (só `saida_confiavel`), tempo médio do aviso até assumir, exames sem interação,
  horas com mais atraso. Pode ir na mesma aba, abaixo da fila, ou num e-mail às 7h para coordenação.

## Ordem para esta semana

| Quando | Entrega |
|---|---|
| Qui 12/11 | Coletor v3 + aviso de coletor parado (feito). Modelo de alerta enviado à Meta (aprovação pode levar horas). Banco: `sla_plantao`, `sla_alertas`, `sla_exame_notas` |
| Sex 13/11 | Tela "SLA ao vivo" + escala + anotações; motor de 80% por WhatsApp + "Assumir"; teste com um número interno |
| Sáb 14/11 | Ajustes e demonstração (junto com a do Maikon) |
| Depois | Ligação Twilio (quando o número com voz existir), indicadores, Tijucas (Animati) |

## Decisões (Raul, 12/11)

1. ~~Mensagem ao médico sem nome do paciente~~ → **mudou em 12/11 (Raul): a mensagem leva o nome do paciente e o
   estudo** (pedido do Wagner no grupo). O coletor passa a ler Nome e Descrição; o nome fica no banco só enquanto o
   exame está na fila (apagado quando o exame sai) e os modelos ganham uma versão nova com esses campos.
2. **Remetente**: ~~número da Amni~~ → **não usar a Amni** (Raul, 12/11); config `sla_whatsapp_sender_id` vazia até escolher outro número da GSS. Modelos
   `gss_sla_laudo_prazo_v1` (80%) e `gss_sla_laudo_vencido_v1` (100%), UTILITY, botão "Assumir laudo",
   enviados à Meta em 12/11 pela conta Chakra GSS (a da Pulse responde "WABA is not part of plugin configuration").
3. **100% sem número de voz**: 2º WhatsApp ao plantonista + WhatsApp e e-mail ao coordenador.
4. **Quem opera**: Wagner e Brenda, pelo módulo de Radiologia do Sigma (escala e acompanhamento). Precisam de
   usuário no Sigma com o módulo `radiologia`.

## Em aberto

- AVC (30 min): como aparece na tela do PACS (pergunta ao Wagner).
- Número Twilio com voz (Raul).
- Coordenador da escada: definido na própria escala (papel `coordenador`).
