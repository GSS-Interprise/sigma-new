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

## Fora deste plano (projetos próprios no Pulse OS)

Vagas internas e LinkedIn (8a8370a9, prazo 15/12), contratos centralizados com acesso restrito (20eb6535), documentos
de médico com cobrança e diretoria (694d30c7), ConLicitação e reunião com o João (202705a9), grupos de plantão
(09bae1aa), ambulatório por município (e019a2aa).
