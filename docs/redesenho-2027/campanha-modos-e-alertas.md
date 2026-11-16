# Nova campanha: modo de conversa e alertas por WhatsApp (13/11/2026)

Protótipo: `prototipos/x-nova-campanha.html`. No Figma, página "Depois · nova campanha, quentes e
configurações (13/11)".

## Dois modos de campanha (confirmado pelo Raul em 13/11)
| Modo | 1º disparo | Depois da resposta | No banco hoje |
|---|---|---|---|
| IA conversa sozinha | API oficial (Chakra) | a IA responde, qualifica e marca quente; a equipe assume o quente | `campanhas.tipo_envio = 'ia'` |
| Equipe conversa pelo CRM | API oficial (Chakra) | quem responde cai em Conversas e no Kanban; a equipe conduz até o contrato | `campanhas.tipo_envio = 'manual'` |

O cartão da campanha mostra o modo na primeira linha ("IA conversa" ou "Equipe pelo CRM"). Os leads que ainda não
receberam o 1º disparo saem do Kanban e viram uma faixa acima dele: "Aguardando o 1º disparo · 3.599 · Saem 35 por
dia pela API oficial · Ver a lista" (pedido do Raul em 14/11: a coluna "Novo" ao lado tomava largura do Kanban). Vale
para os dois modos.

## Alertas por campanha
- **Hoje:** os avisos à equipe são globais. Ficam na edge `alertas-equipe` (médico quente na hora e resumo das 18h),
  com os destinatários em `config_lista_items.alertas_equipe_destinos` no formato "Nome:55DDDNUMERO; ...". O envio sai pelo
  número oficial de avisos (`alertas_equipe_sender_id`), e começa em 16/11.
- **Proposta:** destinatários e eventos escolhidos na criação de cada campanha.
  - Tabela `campanha_alertas`: campanha_id, nome, telefone_e164 e eventos (text[]: `quente`, `quente_sem_dono_2h`,
    `campanha_parou`, `resumo_18h`).
  - A edge `alertas-equipe` passa a ler os destinatários da campanha do lead. Sem destinatário na campanha, ela usa a
    lista global.
  - Os eventos "quente sem dono há 2 h" e "campanha parou" são novos. O primeiro pode reaproveitar
    `vw_leads_quentes_esperando`; o segundo, o `whatsapp-monitor` e o ritmo do dia de `chip_send_log`.
  - O envio continua pelo número oficial de avisos, nunca pelo número da campanha, para não gastar o ritmo nem a
    qualidade do número de prospecção.

## Disparos de hoje no topo de Campanhas e da Home (16/11/2026)
Pedido do Raul para os sócios verem de longe se a máquina está rodando. Protótipos: `campanhas-A2.html`,
`x-campanhas-parado.html` e `t-home.html`; no Figma, a linha "Escolhida" da página Depois e a Home em "Depois · as 7
telas".

- É a mesma faixa que a sessão principal está construindo no código (`src/components/campanhas/DisparosHojeFaixa.tsx` e
  a RPC `campanhas_disparos_painel`, ainda sem commit em 16/11). Os números vêm de `agente_campanhas_disparos_dia`, os
  mesmos do Claude dos sócios.
- Quatro blocos: médicos abordados hoje contra o possível (soma do limite diário das campanhas ativas pelo número
  oficial), os últimos 7 dias, as 3 campanhas que mais enviaram hoje e o aviso âmbar "Nada saiu há N min", que só
  aparece em dia útil, das 8h às 17h, depois de 20 min sem envio.
- **A mais no protótipo:** a linha "No ritmo de agora, o dia fecha perto de N". É uma projeção pela janela 7h–17h:
  enviados até agora ÷ horas decorridas × 10. A faixa da sessão principal ainda não tem essa linha.
