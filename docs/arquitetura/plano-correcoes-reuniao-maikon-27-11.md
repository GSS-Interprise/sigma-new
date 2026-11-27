# Plano de correções e melhorias — reunião com o Maikon (27/11/2026)

Origem: reunião "Automação de recrutamento e prospecção de profissionais de saúde" (Raul e Maikon, 27/11). Este plano
junta os bugs e as melhorias do que já existe no Sigma (BI Raio-X, IA dos contratos, IA da campanha). Os projetos
novos (vagas internas, documentos de médico, ConLicitação, grupos de plantão, ambulatório) ficam no Pulse OS, cada um
na sua tarefa. Status fino: as tarefas do quadro GSS no Pulse OS (ids entre parênteses).

## Já entregue em 27/11

| O quê | Como ficou | Commit |
|---|---|---|
| BI com a Zenvia não batia com a campanha (1.017 contra 1.603) | Com a Zenvia no filtro, conta por telefone tudo o que a campanha da especialidade alcançou: GO = 1.395 alcançados e 443 respostas, como na tela da campanha (edc9a833) | 614fbeed |
| Respostas da Zenvia nunca eram lidas pela IA (0 de 627 médicos) | A conversas-classificar lê a fila da Zenvia junto com a do Sigma, 40 a cada 10 min | 614fbeed |
| Hospital da vaga não aparecia no BI | Topo do Raio-X com o hospital em destaque; Sigma usa o briefing da campanha, Zenvia guarda por especialidade (62473646) | 97127f4e |
| MCP dos sócios lendo as conversas | Domínio conversas no ar, liberado para admin; bateria 34 de 34 ok (6289e48a) | d5ac30f9, 0202ef01 |
| IA dos contratos não lia as cláusulas | Texto dos PDFs em `contrato_texto_trechos`, ferramenta `contratos_clausulas` (chat do Sigma e MCP); escaneados por OCR do Gemini e contrato novo lido sozinho pela edge `contratos-ler-anexos` (cron 10 min) (acd89c80, da3d4fcc) | 0339867d |

## Correções (bugs) — ordem

1. **Feito em 27/11.** **IA dos contratos não lê o texto dos contratos** (acd89c80, urgente). A pergunta do Maikon ("Braço do Norte: o
   particular no PS é nosso ou do hospital?") caiu no manual porque o domínio contratos só tem números, itens,
   vigência e reajuste. Os 109 contratos têm anexo (453 PDFs). Fazer: extrair o texto dos PDFs, guardar por trecho,
   ferramenta de busca no domínio contratos (a mesma para o chat do Sigma e para o MCP dos sócios), caso na bateria
   de consistência com essa pergunta. Prazo real: a Bianca sai em 2 semanas.
2. **"Por que dizem não" vazio** (86729f53 + 88b1300c). Parte 1 feita (Zenvia lida). Parte 2: no Sigma, 141 de 247
   conversas de GO terminam em "não" sem motivo. A IA da campanha pergunta o motivo antes de encerrar.
3. **Aviso de saúde do SLA barrado pela Meta.** `gss_sla_saude_v2` foi reclassificado como marketing (131049 no
   Wagner). `gss_estacao_sla_v2` ficou como utilidade e já está em uso. Refazer o texto da saúde no molde do da
   estação.

## Melhorias do BI Raio-X — ordem

1. **Slides para a TV do hospital** (f4eaa107): tela cheia, um slide por assunto, clique para avançar; PDF continua.
   Primeiros usos: São Miguel do Oeste (Anestesiologia, janeiro) e Braço do Norte (GO).
2. **Mais gráficos** (14505cbc): alcance no tempo, funil, motivos em barras, valor pedido contra oferecido.
3. **Alcance por canal** (5bbbc373): WhatsApp e e-mail já existem; LinkedIn e Instagram dependem de fonte de dados.
4. **Lead quente** (34682f9b): painel de quem a equipe deixou de responder e há quanto tempo.

## Frente: trabalho de IA do Sigma pelo motor Hermes (aberta em 27/11)

**Por quê.** A classificação das conversas (Sigma + Zenvia) e o OCR dos contratos rodam no Gemini gratuito, e a cota
diária por modelo esgota com a fila da Zenvia (27/11: classificação parada das 14h até a troca de modelo). Em vez de
pagar API, o trabalho vai para o Hermes da VPS, que já usa o Claude da assinatura para tarefas automáticas. É o mesmo
desenho do SDR no CloserPulse (`linkbound/docs/hermes-linkbound-mcp.md`): o banco guarda a fila, o Hermes busca o
trabalho por MCP, faz a parte de IA e devolve o resultado, que o servidor valida antes de gravar.

**Desenho (molde do Linkbound).**
- **Fila no banco:** tabela `ia_trabalho` (tipo `classificar_conversa` | `ocr_contrato`, chave única por item, `payload`
  com o prompt e o esquema de resposta montados pelo Sigma, `status` pending/claimed/done/failed/canceled, `claims`,
  `lease_ate`, `resultado`). Teto de 5 reservas: depois vira `failed` e aparece no alerta. GRANT para `service_role`.
- **Quem enfileira:** os crons de hoje (`conversas-classificar`, `contratos-ler-anexos`) param de chamar o Gemini quando o
  motor do tipo for `hermes` e só gravam o item na fila. Chave de motor por tipo (`api` = Gemini como hoje, `hermes`).
  O motor `hermes` não cai para o Gemini sozinho; volta para `api` é troca explícita.
- **MCP:** ferramentas novas no `sigma-mcp`, num papel próprio do robô (token `sgm_` de origem `hermes`, sem acesso a
  domínio nenhum dos sócios): `ia_trabalho_listar` (reserva com lease, devolve prompt + esquema; a conversa do médico vem
  marcada como dado não confiável), `ia_trabalho_entregar` (revalida o JSON com as mesmas listas de hoje e grava em
  `conversa_classificacao` ou `contrato_texto_trechos`), `ia_trabalho_saude` (contagem por tipo, sem reservar).
- **Hermes na VPS:** entrada `sigma` em `~/.hermes/config.yaml` (usuário `pulse`) com o token, e um cron do Hermes a cada
  10 min que lista, faz o trabalho e entrega. OCR: o item leva a URL assinada do PDF no Storage (validade curta).
- **Alerta:** item `failed` ou fila parada há mais de 1 h avisa o Raul pelo canal de alertas que já existe.

**Fora de escopo:** IA do chat do Sigma e o agente dos sócios (continuam como estão); envio de mensagem a médico pelo
Hermes; qualquer acesso do Hermes ao banco ou a segredo fora do MCP.

**Riscos:** Hermes ou VPS fora do ar para a fila (o alerta cobre; volta para `api` é uma troca de chave); limite de uso
da assinatura dividido com o conselho e o SDR; dado de médico saindo do Supabase para a VPS (mesmo nível do que o SDR
já faz com lead do LinkedIn, mas confirmar com o Raul antes de ligar para a Zenvia).

**Agente dentro do CRM (pedido do Raul, 27/11).** O chat do Sigma também deve rodar pelo Hermes. Diferença: o chat
espera resposta em segundos, e o cron de 10 min não serve. Precisa de um tipo `chat_agente` com o Hermes escutando a
fila em tempo quase real (laço curto ou aviso por webhook), e a tela mostrando "pensando" até a entrega. Desenho a
fechar depois das tarefas 1 a 3.

**Tarefas (≈ 1 PR cada):** 1) migration da fila + RPCs de reserva/entrega com teste (feito em 27/11: `ia_motor`,
`ia_trabalho`, `ia_trabalho_enfileirar/reservar/conferir/fechar/saude`, 15 testes ok, motores em `api`); 2) feito em 27/11: com o tipo em `hermes` os crons só enfileiram (classificação até 150 por rodada; OCR deixa a leitura `na_fila`), prompt/esquema/limpeza em `_shared/classificacao.ts` e `_shared/contratos_texto.ts`, testado ligando o Hermes e voltando para `api` (127 conversas + 1 escaneado na fila); 3) feito em 27/11: token de origem `hermes` vê só `ia_trabalho_listar/entregar/cancelar/saude` (`_shared/agente/robo.ts`), PDF por link assinado de 10 min, entrega revalidada e gravada no domínio; `scripts/robo-hermes-e2e.mjs` 12 de 12, bateria 35 de 35; 2) chave de motor por tipo e os
dois crons enfileirando; 3) ferramentas MCP + papel do robô + casos na bateria; 4) token e cron no Hermes da VPS;
5) alerta de fila; 6) ligar `classificar_conversa` em `hermes`, acompanhar 2 dias, depois `ocr_contrato`.

## Fora deste plano (projetos próprios no Pulse OS)

Vagas internas e LinkedIn (8a8370a9, prazo 15/12), contratos centralizados com acesso restrito (20eb6535), documentos
de médico com cobrança e diretoria (694d30c7), ConLicitação e reunião com o João (202705a9), grupos de plantão
(09bae1aa), ambulatório por município (e019a2aa).
