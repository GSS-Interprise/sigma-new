---
tags: [arquitetura, sigma-gss, licitacoes, contratos]
projeto: SigmaGSS
autor: Raul
data: 2026-10-14
status: pronto-pra-executar   # proposta aprovada pela GSS em 13/10/2026; aguardando os itens da seção 10
operador: Raul
repo: GSS-Interprise/sigma-new
---

# Arquitetura de Solução — Licitações, Contratos e Contratos do médico

> **Origem:** reunião de 07/10/2026 com Bianca Santos (contratos), Denise Krauspenhaar (licitações) e Ramone (gestão).
> Transcrição: `C:\Users\rauls\Downloads\Reuni-o-com-equipe-de-licita-es-Bianca-Santos-e-Denise-Krauspenhaar-0356ce8b-906c.md`.
> Proposta aprovada (3 blocos, R$ 4.000, 5 dias úteis cada): `pulse-propostas/gss/licitacoes/Proposta_GSS_Licitacoes_Contratos.pdf`.
> **Regra deste doc:** todo pedido da reunião está no **Anexo A** com o minuto em que foi dito e a tarefa que o atende. Item novo que surgir entra lá antes de virar código.

## 1. O que precisa funcionar (a capacidade)

O Sigma volta a fazer pela equipe de licitações o que hoje é feito à mão e passa a entregar o que o Trello entregava: editais da GSS entrando sozinhos e sem duplicar, quadro leve com memória de cada edital (nada se perde, tudo se acha), prazos com alerta, análise de edital confiável e inteligência sobre concorrentes. A licitação arrematada vira contrato levando todo o histórico e avisando financeiro e operacional sozinha. No contrato do médico, quem converteu fica sabendo na hora que o médico assinou, e a gestão vê conversão × assinatura por pessoa.

## 2. Estado atual (o que já existe) — levantado em 08/10 e 14/10

**Licitações**
- Tabela `licitacoes` (quadro `board='effecti'`: 1.793 cards; `board='robo'`: 19.730 cards da triagem PNCP). Colunas relevantes: `numero_edital`, `orgao`, `cnpj_orgao`, `municipio_uf`, `data_disputa`, `data_limite`, `status`, `etiquetas`, `fonte`, `effect_id`, `titulo`, `decorrencia_analise`, `card_gemeo_id`.
- Distribuição no quadro effecti: descarte 1.383, não ganhamos 117, suspenso/revogado 105, demais colunas < 40 cada. **Nada é arquivado** e a tela carrega tudo de uma vez (causa provável da lentidão).
- Colunas do quadro já vêm do banco: `licitacoes_colunas` (13 colunas com `nome`, `status_vinculado`, `ordem`, `cor`). Falta a tela para a equipe editar.
- Histórico/comentários: `licitacoes_atividades` (15.722 registros). Anexos: `licitacoes_anexos`. Travas de edição: `licitacoes_edit_locks` (suspeita para o "fecha e reabre some tudo").
- Descarte com motivo: `licitacao_descartes` + `licitacao_motivos_descarte`. Resultado: `licitacao_resultados` (105), `licitacao_item_concorrentes`, `empresas_concorrentes` (213).
- Prazos: `licitacoes_notificacoes_prazo` existe e está **vazia**.
- Perfis de captura: `licitacao_captura_perfis` (perfil `gss-saude` com termos de busca, usado pelo robô PNCP).
- **Captação do Effecti parada para a GSS:** o Effecti entrega ~50 editais/dia no perfil GSS, mas o último card `fonte='n8n'` com etiqueta GSS entrou na semana de 10/08. Em 30 dias: 47 cards da AGES, 0 da GSS, 30 manuais. Causa provável (não confirmada): o usuário `licitacaogss@` do captador não existe mais no Effecti; o token da API é por usuário.
- **API oficial do Effecti:** spec em `https://mdw.minha.effecti.com.br/api-integracao/v1/openapi.json`. `POST /aviso/licitacao?page=N` com `{begin, end}` e header `Authorization` (token em Minha Effecti → apps → Integração → API); 100 por página; traz `perfil`/`perfilNome`, órgão, CNPJ, processo, cidade/UF, portal, datas, valor, itens e anexos. A API não filtra por perfil: separar do nosso lado. Bloqueia chamada direta do navegador (CORS) → chamar de edge function.
- GSS e AGES são **dois perfis de busca na mesma conta** do Effecti.

**Contratos**
- `contratos` (`codigo_interno` com lacunas: faltam 92, 94, 95, 96, 99, 102, 103, 110). `contrato_rascunho` (71 registros; `licitacao_id`, `contrato_id`, `status`, `status_kanban`, `overlay_json`). O "rascunho" nunca funcionou para a Bianca e cria número novo ao virar contrato (sequência quebrada).
- Arquivos da licitação que vão para o contrato não abrem (erro) e a tela mostra "Contrato atualizado com sucesso" só por tentar abrir o arquivo.
- Não existe cadastro de certidões/documentos da empresa.

**Contratos do médico**
- `medico_documentos` tem `data_validade` (766 documentos, **nenhum com validade preenchida**).
- Conversão por pessoa: `lead_historico.tipo_evento='convertido_em_medico'` (base do PDF de médicos enviados a contratos, 08/10).
- Assinatura eletrônica no sistema **Ideia**: avisos chegam por e-mail na caixa da Maine. Integração ainda não analisada (falta endereço e acesso).

**Escala:** `escalas_integradas` (Dr. Escala) tem profissional e local, mas `unidade_id`/`cliente_id` estão vazios — ligar escala a contrato exige o mapeamento local → contrato.

### Achados de 14/10 dentro das ferramentas (só leitura, nada alterado)

**Effecti** (conta "GSS - GESTAO SERVICO SAUDE", olhada com o usuário `contratos@`)
- Dois perfis de busca na mesma conta, ambos atualizados em 28/09: **GSS** (id 12638) e **AGES** (id 12631). Captura de segunda a sexta, 2 dos 4 horários.
- **Causa da sobreposição GSS × AGES:** o perfil da AGES inclui o catálogo "Teste", cujo único produto é "Serviço Médico", que é o ramo da GSS. Por isso o mesmo edital de serviço médico chega nos dois perfis.
- **O aviso por e-mail do perfil GSS ia só para `licitacaogss@`**, o usuário que não existe mais no Effecti. Em 14/10, com ok do Raul, `licitacao@` (Denise) foi incluído nos avisos do perfil GSS; o antigo ficou. Nada mais foi alterado. O perfil AGES avisa `contato@agesaude.org.br`.
- Catálogo da GSS: 21 produtos (especialidades com "que tipo" e "o que não vendo"). Há repetições ("anestesiologia" duas vezes, "plantões" e "plantão") e um nome com erro ("NEUROCIRURGIAO").
- Perfil GSS: todos os estados, os 12 tipos de disputa, só serviços, sem filtro de ME/EPP.
- **API:** em Integrações → API existe um token do usuário logado e o link da documentação. O token é por usuário; o botão de gerar outro invalida o atual.
- Acessos aos portais: 12 cadastrados no nome da GSS; o do **Licitanet está inativo** (é o alerta que aparece na tela inicial). Não faz parte do plano: serve para enviar lances naquele portal.

**Ideia Signer** (`app.ideiasigner.com.br`, usuário `cadastro@`)
- 5 organizações. A da GSS ("18670594000103 - GSS GESTÃO SERVICOS A SAUDE LTDA") tem 2.067 documentos, 16 pastas (ex.: "Contratos Médicos - PJ", "Aditivos Contratuais") e três usuários: Bianca (admin), GSS/`cadastro@` (admin) e RH GSS.
- **Webhook por organização:** em Organizações → Integração → Webhooks se cadastra uma URL chamada a cada evento de documento, com autenticação Sem/Basic/Bearer/X-Api-Key. Não há escolha de evento na tela (recebe todos). **Nenhum webhook configurado hoje.**
- Lista de documentos separada em Pendentes, Concluídos, **Recusados** e Cancelados/Expirados (o "Recusados" alimenta o indicador de não assinados).
- Nome dos documentos segue o padrão `<código> - Contrato PJ - Dr. <nome>`.
- Configurações da organização: lembrete automático aos signatários a cada N dias, **tags** (dá para exigir tag na criação do documento) e pasta obrigatória.
- A documentação da API não é pública (o site só oferece contato). O formato do aviso do webhook só se descobre recebendo um.

## 3. A solução desenhada (a forma)

### Bloco 1 · Licitações
1. **Captação pela API oficial do Effecti** (edge `effecti-captacao` + cron a cada 30 min, janela dos últimos 2 dias), **só para o perfil GSS**.
   - **Decisão do Raul (14/10): a AGES é cliente e não pode perder nenhuma licitação.** O perfil da AGES no Effecti não muda (o catálogo "Teste" continua nele) e o captador da AGES que já funciona (n8n "captador ages" → `api-licitacoes`, etiqueta `AGES`, `effect_id` com sufixo `33`) não é tocado.
   - O mesmo edital que bate nos dois perfis vira **um card por empresa**, por desenho (ver `handoff-crm-ages.md`).
   - O **painel da GSS mostra só os cards da GSS** (sem a etiqueta `AGES`); os cards da AGES continuam no lugar onde a AGES os acompanha.
   - Chave de duplicidade: `numero_edital` normalizado (sem zeros à esquerda, "/" e "-" equivalentes) + município/UF + CNPJ do órgão. Mesmo edital vindo de outro portal **atualiza** o card existente, inclusive arquivado (e desarquiva se houver data nova).
   - Mesmo número e cidade com órgão diferente (Estado × Município, Saúde × Esportes) **não** funde: cria card novo e marca "possível duplicado" para a equipe decidir.
   - Título padrão do card: `<número do edital> · <cidade>/<UF>` (pedido da Bianca para a busca funcionar).
   - Alarme de frescor: se nenhum aviso GSS entrar em 24h úteis, notifica o Raul (lição do incidente de agosto: "sucesso silencioso com zero trabalho").
2. **Quadro leve com memória**
   - Novas colunas em `licitacoes`: `arquivado_em`, `arquivado_motivo` (`prazo` | `descarte` | `nao_ganhamos` | `manual`), `ultima_data` (a data mais recente entre disputa, tarefas e movimentações).
   - Cron diário arquiva quando `ultima_data + 30 dias < hoje`. Descarte e "não ganhamos" arquivam **na hora**. Suspenso e revogado entram na regra dos 30 dias. **Nada é excluído.**
   - A tela carrega só o que não está arquivado, com filtro e paginação. Aba **Arquivados** com busca por número, cidade e órgão, e botão **Desarquivar**.
   - Abas "Licitações robô" e "Triagem PNCP" saem da visão da equipe (ficam só para admin).
3. **Colunas da equipe:** tela para renomear, reordenar e unir colunas em `licitacoes_colunas` (unir = dois `status_vinculado` na mesma coluna). Uniões já pedidas: Proposta final + Adjudicação; Fracassado + Não ganhamos.
4. **Anexos e travamentos:** visualizador interno de anexos com setas (PDF e imagem), **o mesmo componente usado depois no contrato**; anexar arquivo e colar print já na criação do card; corrigir o estado que some ao fechar e reabrir o card e a trava ao excluir imagem; comentários editáveis por quem comentou, sem limite de tempo (histórico da edição guardado em `licitacoes_atividades`).
5. **Tarefas e prazos:** tabela `licitacao_tarefas` (`licitacao_id`, `tipo`, `data_hora`, `responsavel_id`, `concluida_em`, `observacao`).
   - Tipos: esclarecimento, impugnação, recurso, contrarrazão, mandado de segurança, envio de documentos, deliberação, personalizada (lista final da Bianca).
   - Ao definir a data da disputa, o Sigma sugere "esclarecimento/impugnação" 3 dias úteis antes. Marcar **fase invertida** obriga a data de envio dos documentos.
   - Filtro por tipo e período (hoje, 7 dias, 15 dias, personalizado), abrindo por padrão na semana, com o padrão salvo por pessoa.
   - Alerta por e-mail e no Sigma com antecedência configurável (ex.: 1 dia e 1 hora antes), usando `licitacoes_notificacoes_prazo` como fila.
6. **Análise de edital:** a análise automática atual é substituída pelo modelo da Bianca (o Gem do Gemini dela vira o prompt). Cada informação cita o item do edital de onde saiu; os quadros e imagens do edital ficam no card. Disparo manual pelo card (e opcional na captação). A IA apoia; a decisão é da equipe.
7. **Resultado e concorrentes**
   - "Não ganhamos" exige motivo escrito (livre) e colocação.
   - Anexar a ata: a IA extrai o arrematante e só as empresas **à frente da GSS**, com valores, gravando em `licitacao_resultados`/`licitacao_item_concorrentes`/`empresas_concorrentes`. Inabilitação é registrada à mão, com motivo.
   - Relatório semanal e mensal (surgiram, disputamos, ganhamos, por que não entramos, por que não ganhamos, quem ganhou), com exportação Excel/PDF. Painel de concorrentes por região no BI.

### Bloco 2 · Contratos
8. **Licitações arrematadas no lugar do rascunho:** coluna/aba "Licitações arrematadas" acompanhando adjudicação, homologação, aguardando assinatura e assinado; arrematada que não vira contrato (revogação, desistência após reanálise) encerra com motivo. O **número do contrato só nasce quando vira contrato** (sequência própria, sem lacunas novas). O card leva edital, anexos, esclarecimentos, análise e comentários, e tudo abre pelo visualizador do item 4.
9. **Avisos automáticos:** contrato marcado como assinado avisa o financeiro (Maria Vitória) e o operacional (destinatários definidos pela Ramone), por e-mail e no Sigma. A **primeira escala** do contrato gera o segundo aviso (início do serviço, hora de faturar). A ligação escala → contrato depende do mapeamento local do Dr. Escala → contrato.
10. **Certidões e documentos da empresa:** tabela `empresa_documentos` (`tipo`, `emissor`, `emissao`, `validade`, `arquivo_path`, `observacao`) e aba em Contratos; alerta por e-mail antes do vencimento e visão "vence nos próximos dias".

### Bloco 3 · Contratos do médico
11. **Assinatura do Ideia chega ao Sigma pelo webhook da organização GSS** (achado de 14/10): edge `ideia-webhook` com `X-Api-Key`, que registra todo evento recebido, casa o signatário com o médico/lead e avisa quem converteu (`lead_historico` → usuário) no Sigma. O primeiro passo é cadastrar o webhook apontando para a edge e mandar um documento de teste para conhecer o formato do aviso. O e-mail dedicado fica só como plano B. **O gatilho é o médico assinar** (a GSS assina depois e pode cancelar). Se possível, baixa o PDF assinado e anexa em `medico_documentos`.
12. **Indicadores e consulta:** por pessoa, convertidos × assinados × não assinados, com motivo do não assinado (campo novo). Resumo das condições combinadas com cada médico (fixo, variável, regras) visível no cadastro. Médico vinculado a contrato avisa o financeiro.
13. **Documentos do médico com vencimento:** tela para preencher `medico_documentos.data_validade` e alerta antes de vencer.

## 4. Fora de escopo (anti-alucinação)

- Mensalidades de ferramentas de terceiros: Effecti, Ideia e consumo de IA.
- Cadastro de proposta e envio de lances nos portais.
- Substituir o Effecti por captação própria (robô PNCP). A triagem PNCP só sai da visão da equipe.
- Contas a receber e faturamento: ficam no módulo financeiro.
- Migração do histórico do Trello.
- Cadastro de hospitais feito pela Maine (Bianca, 01:25:37: "essa parte do cadastro não entra").
- Remover a AGES do Effecti ou do Sigma. A AGES só se separa do quadro da GSS (decisão do Raul em 08/10, corrigindo o pedido da Bianca na reunião).
- Palavras-chave de busca do Effecti: configuradas pela equipe dentro do Effecti.
- Cálculo automático dos prazos de recurso e contrarrazão (Bianca explicou a regra, ninguém pediu automação). A equipe lança como tarefa.

## 5. Riscos / pegadinhas / dependências

- **Token do Effecti é por usuário.** Precisa de um usuário ativo da GSS gerando o token; se a pessoa sair, a captação para de novo. Preferir um usuário de serviço.
- **Senhas do Effecti e do Ideia circularam por WhatsApp e print.** A Bianca precisa trocá-las antes de o token ser gerado.
- **Duplicidade com falso positivo:** mesmo número e cidade podem ser editais diferentes (órgãos diferentes). Por isso a chave inclui o CNPJ do órgão e o caso ambíguo vira aviso, não fusão.
- **Volume:** quadro robô com 19.730 cards e a equipe já passou de 4-5 mil editais em 6 meses. Nenhuma tela pode carregar tudo; anexos são pesados (editais com 100+ páginas) e só carregam quando abertos.
- **AGES usa as mesmas tabelas** e tem CRM próprio (ver `docs/arquitetura/handoff-crm-ages.md`). Mudança de esquema em `licitacoes` precisa ser conferida com o lado da AGES antes.
- **IA erra e mistura editais** (Bianca já viu resposta de edital anterior). A citação do item do edital é obrigatória e a decisão é sempre humana.
- **Escala → contrato:** `escalas_integradas` não traz unidade nem cliente; sem o mapeamento local → contrato, o aviso de início de serviço não dispara.
- **Ideia sem API:** o plano B depende de um e-mail dedicado e de os avisos do Ideia trazerem o nome do médico de forma legível.
- **Prazos da proposta** contam em dias úteis a partir do aceite e do recebimento dos itens da seção 10. Sem eles, o bloco correspondente não começa.
- **Edge functions:** toda edição em `supabase/functions/*` termina com deploy confirmado; toda tabela nova recebe `GRANT` para `authenticated` e `service_role`.

## 6. Plano de Execução — as tarefas (cada item ≈ 1 entrega)

**Bloco 1 · Licitações (5 dias úteis)**
- [x] T1 — Captação Effecti → Sigma pela API oficial, separada por perfil, com dedupe (número + cidade + órgão), título padrão e alarme de frescor. **Feito em 14/10** (commit fd9fd50): edge `effecti-captacao` (cron 58, a cada 30 min, 06:00–20:30), só perfil GSS, liga ao card manual pelo número + UF + cidade/CNPJ, anexos em `effecti_anexos_fila`, `api-licitacoes` com um card por empresa (AGES conferida intocada). Alarme de frescor feito junto com a T2 (`licitacoes_alarme_captacao`).
- [x] T2 — Quadro leve: arquivamento automático (30 dias após a última data; descarte, não ganhamos e fracassado na hora), aba Arquivados com busca e Reabrir, busca do quadro acha arquivados, abas Robô e Triagem PNCP só para admin. **Feito em 14/10:** coluna `empresa`, `arquivado_em`/`arquivado_motivo`/`desarquivado_em`, gatilho `trg_licitacao_arquivamento`, cron diário `licitacoes-arquivar-prazo` (04:00) e `licitacoes-alarme-captacao` (11:00 e 17:00, dias úteis — fecha o alarme da T1). Primeira rodada: 1.281 cards da GSS arquivados, 105 no quadro, AGES fora da regra.
- [ ] T3 — Aviso de duplicado na criação manual (inclui arquivados) e colunas editáveis (renomear, reordenar, unir).
- [ ] T4 — Visualizador de anexos com setas, anexar e colar print na criação, correção dos travamentos ao reabrir e ao excluir imagem, comentários editáveis pelo autor.
- [ ] T5 — Tarefas com data e hora, sugestão de 3 dias úteis antes da disputa, fase invertida, filtro por tipo e período, alertas por e-mail e no Sigma.
- [ ] T6 — Análise de edital pelo modelo da Bianca, com citação do item e imagens do edital no card.
- [ ] T7 — Resultado: "não ganhamos" com motivo e colocação, leitura da ata, inabilitação manual, relatório semanal/mensal com exportação, painel de concorrentes por região.

**Bloco 2 · Contratos (5 dias úteis)**
- [ ] T8 — Licitações arrematadas no lugar do rascunho; número só ao virar contrato; arquivos e análise seguem e abrem; correção do aviso falso "Contrato atualizado com sucesso".
- [ ] T9 — Avisos de contrato assinado (financeiro e operacional) e de início de serviço pela primeira escala.
- [ ] T10 — Certidões e documentos da empresa com vencimento e alerta.

**Bloco 3 · Contratos do médico (5 dias úteis)**
- [ ] T11 — Assinatura do Ideia chega ao Sigma (API ou e-mail dedicado) e avisa quem converteu; PDF assinado anexado ao médico.
- [ ] T12 — Indicador por pessoa (convertidos × assinados × não assinados com motivo), resumo das condições do médico e aviso ao financeiro quando o médico é vinculado a um contrato.
- [ ] T13 — Documentos do médico com data de validade e alerta.

## 7. Critério de pronto (verificável)

- [ ] **T1:** em 2 dias úteis de captação, todo edital do perfil GSS visto no Effecti aparece no quadro da GSS, nenhum da AGES aparece nele, e o mesmo edital vindo de dois portais gera um card só.
- [ ] **T2:** a tela do quadro abre com menos de 300 cards e em menos de 3 s; um edital arquivado é achado pela busca por número e reaberto pelo botão.
- [ ] **T4:** a Denise cria um card manual com PDF e print anexados sem fechar a janela, e navega entre os anexos pelas setas.
- [ ] **T5:** uma tarefa com antecedência de 1 hora gera e-mail e notificação no Sigma no horário certo; o filtro "7 dias" mostra disputas e tarefas da semana.
- [ ] **T6:** em 5 editais escolhidos pela Bianca, cada ponto da análise cita o item do edital e a Bianca aprova o formato.
- [ ] **T7:** ao anexar uma ata real, o card mostra o arrematante e as empresas à frente da GSS com valores; o relatório semanal exporta em Excel e PDF.
- [ ] **T8:** uma licitação arrematada vira contrato com o próximo número da sequência, e os anexos da licitação abrem dentro do contrato.
- [ ] **T9:** marcar um contrato como assinado gera aviso para os destinatários definidos pela Ramone.
- [ ] **T11:** uma assinatura real no Ideia aparece no Sigma e avisa quem converteu sem ninguém da GSS mexer.
- [ ] **Cada bloco:** validado pela equipe (Bianca e Denise no 1; Bianca e Maria Vitória no 2; Bianca, Maine e Ramone no 3) com dados reais. Pagamento por bloco na entrega e validação.

## 8. Autonomia e direitos de decisão

- **Quem executa:** Raul (com o Claude), tarefa por tarefa, publicando no Lovable ao fim de cada uma.
- **Decide sozinho:** implementação dentro deste desenho e a ordem fina dentro do bloco.
- **Volta para a GSS:** os itens da seção 10 e qualquer mudança de escopo (que entra primeiro no Anexo A).

## 9. Checklist de revisão

- [ ] Permissões: quem edita colunas (só `lider_licitacao`/admin ou toda a equipe?), quem vê Arquivados, quem recebe os avisos.
- [ ] Casos de erro: Effecti fora do ar, token vencido, ata ilegível, e-mail do Ideia sem nome do médico.
- [ ] Decisões de negócio da seção 10 respondidas pela GSS.
- [ ] Critérios da seção 7 conferidos com a Bianca antes de começar cada bloco.

## 10. O que falta receber ou decidir (bloqueia o bloco indicado)

| De quem | O quê | Bloco |
|---|---|---|
| Bianca | Modelo de análise (Gem do Gemini) e 5 a 10 análises boas | 1 (T6) |
| Bianca | Nomes, ordem e uniões das colunas; lista final de tipos de tarefa; motivos de "não ganhamos" | 1 (T3, T5, T7) |
| Bianca | Trocar as senhas do Effecti e do Ideia e gerar o token da API com um usuário ativo da GSS | 1 (T1) |
| Denise | Antecedência padrão dos alertas e o filtro com que o quadro deve abrir (Bianca sugeriu "semana") | 1 (T5) |
| GSS | Duplicado na criação manual: **aviso** (proposta) ou **bloqueio** (Bianca pediu bloqueio, 20:27) | 1 (T3) |
| GSS | Quem pode editar as colunas do quadro | 1 (T3) |
| Ramone | Quem recebe os avisos de contrato novo e de início de serviço | 2 (T9) |
| Bianca | Sequência dos contratos: renumerar as lacunas atuais ou só impedir lacunas novas | 2 (T8) |
| Ramone/Bianca | Operacional pode vincular médico a uma licitação arrematada antes do contrato estar formalizado? (Ramone, 01:20:10: hoje é preciso "burlar o sistema") | 2 (T8) |
| Bianca | Lista inicial de certidões e documentos da empresa, com vencimentos | 2 (T10) |
| Bianca e Maine | Ok para cadastrar o webhook na organização GSS do Ideia e um documento de teste (o acesso já foi visto em 14/10) | 3 (T11) |

---

## Anexo A — Rastreabilidade da reunião de 07/10 (item por item)

Situação: **P** = na proposta aprovada · **+** = estava na reunião e não estava explícito na proposta, acrescentado agora · **D** = depende de decisão (seção 10) · **F** = fora de escopo, com o motivo.

| # | Min. | Quem | O que foi pedido ou dito | Tarefa | Sit. |
|---|---|---|---|---|---|
| 1 | 07:08 | Bianca | Robô de captação do Effecti só traz AGES; GSS não entra | T1 | P |
| 2 | 07:08 | Bianca | "Tirar totalmente a AGES" | — | F (decisão 08/10: AGES fica, só se separa) |
| 3 | 08:14 | Bianca | Cards manuais dão "puta trabalho"; tudo está sendo feito à mão | T1 | P |
| 4 | 09:09 | Bianca | Análise automática atual é errada e atrapalha; usar o Gem do Gemini dela | T6 | P |
| 5 | 09:48 | Bianca | Arquivo abre em outra aba do Chrome; setas para passar de um arquivo ao outro (vale também para contratos) | T4, T8 | P |
| 6 | 10:51 | Bianca | Denise está praticamente sozinha na licitação | contexto | — |
| 7 | 12:53 | Bianca | Ao fechar e reabrir o card some tudo; precisa recarregar o Sigma | T4 | P |
| 8 | 13:41 | Bianca/Denise | Mover e renomear as colunas sem pedir ao desenvolvedor | T3 | P |
| 9 | 14:15 | Denise | Print só entra fechando e reabrindo; excluir imagem trava; anexar só depois de criar e fechar o card | T4 | P |
| 10 | 15:55 | Bianca | Quadro poluído; Proposta final e Adjudicação são a mesma coisa | T3 | P (unir colunas) |
| 11 | 16:xx–17:02 | Bianca | "Não arrematado" fechar após 30 dias; **nenhum edital pode ser excluído** (pode voltar meses depois) | T2 | P |
| 12 | 18:11 | Bianca | O histórico do que foi deliberado tem que ficar no edital | T2, T4 | P |
| 13 | 19:35 | Bianca | Busca por nome/número acha o edital esteja onde estiver | T2 | P |
| 14 | 19:35 | Bianca | Título padrão do card = número do edital + cidade | T1 | + |
| 15 | 20:16 | Denise | Antes de inserir, verificar se já existe (hoje usa Ctrl+F) | T3 | P |
| 16 | 20:27 | Bianca | "Deveria ter bloqueio" do duplicado | T3 | D |
| 17 | 21:26 | Bianca | Robô pega o mesmo edital duas vezes (SMS × FMS, portais diferentes) | T1 | P |
| 18 | 24:16–25:55 | Bianca | Mesmo número e cidade podem ser órgãos diferentes (Estado × Município, Saúde × Esportes) | T1 | P (chave com órgão; caso ambíguo vira aviso) |
| 19 | 26:51 | Raul | Tela consulta tudo sem filtro nem paginação; editais com +30 dias não devem carregar; aba de arquivados | T2 | P |
| 20 | 27:52 | Bianca | Arquivos pesados (editais com 100+ páginas) | T2, T4 | P (anexo só carrega ao abrir) |
| 21 | 30:13 | Bianca | Descarte arquiva na hora, qualquer data | T2 | P |
| 22 | 30:13 | Bianca | Descarte continua exigindo motivo (já existe) | existente | — |
| 23 | 30:13–31:13 | Bianca | "Não ganhamos": motivo escrito (livre) e colocação visível; arquiva na hora | T2, T7 | P |
| 24 | 31:13 | Bianca | Fracassado e Não ganhamos são a mesma coisa | T3 | P (unir colunas) |
| 25 | 31:49–35:55 | Denise | Datas além da disputa: próximo passo, o que vai acontecer na semana (impugnação, recurso, disputa) | T5 | P |
| 26 | 33:26 | Bianca | Data da disputa muda à mão; o que aconteceu fica escrito nas mensagens do card | T4 | P (comentários mantidos e editáveis) |
| 27 | 36:13 | Ramone | 3 dias antes da disputa para esclarecimento/impugnação | T5 | P |
| 28 | 36:59 | Ramone | Gerar alerta para a pessoa | T5 | P |
| 29 | 37:17 | Bianca | Trello avisava por e-mail 1 hora e 1 dia antes; antecedência escolhida pela pessoa | T5 | P |
| 30 | 37:17–38:15 | Bianca | Envio de documentos antes (presencial: ao representante na véspera); fase invertida obriga data | T5 | P |
| 31 | 38:55–41:10 | Raul/Denise | Tarefa com tipo, data e **hora** atrelada ao edital; tipos específicos + personalizado | T5 | P |
| 32 | 38:55, 40:22 | Raul | Tipo "mandado de segurança" | T5 | + |
| 33 | 40:41 | Bianca | No lugar da etiqueta AGES/GSS, filtrar por recurso, impugnação, disputa | T5 | P |
| 34 | 41:30–42:22 | Ramone | Tarefas para a própria pessoa se organizar: data prevista para deliberar | T5 | P (tipo deliberação) |
| 35 | 42:33–44:00 | Raul/Bianca | Filtro pré-selecionado ao abrir; padrão semana, ajustável (15 dias) | T5 | P |
| 36 | 44:00–45:19 | Bianca | Filtro e arquivamento consideram a **última data** lançada; prazos de recurso (3 dias úteis) e contrarrazão (+3) | T2, T5 | P (última data) · F (cálculo automático de recurso) |
| 37 | 45:26–47:48 | Denise/Bianca | Abas "Licitações robô" e "Triagem PNCP" não fazem sentido para a equipe (PNCP traz coisa de 2011/2017) | T2 | P |
| 38 | 47:55 | Bianca | Nenhum edital da GSS entra; Effecti disse ter resolvido em 06/10; Denise monitorando | T1 | P |
| 39 | 48:04 | Bianca | Card mostra quem criou ("Desenvolvedor Sigma" = robô) | existente | — |
| 40 | 48:30 | Raul | Palavras-chave do Effecti | — | F (configuração no Effecti) |
| 41 | 49:45 | Bianca | Não sabe se o prompt que ela entregou foi usado | T6 | P |
| 42 | 50:27 | Ramone | Preocupação com IA na análise; conhecimento da equipe | T6 | P (IA apoia, decisão é da equipe) |
| 43 | 50:49–51:41 | Bianca | IA tem que mostrar onde está cada informação (já trouxe resposta de edital anterior ou da internet) | T6 | P |
| 44 | 51:41–52:40 | Bianca/Ramone | Anexar imagens e quadros do edital na análise | T6 | P |
| 45 | 52:40–53:51 | Bianca | Informações e arquivos da licitação seguem para o contrato e para a execução | T8 | P |
| 46 | 54:02–54:52 | Denise/Ramone | Relatório para baixar; exportar do BI em Excel/PDF | T7 | P |
| 47 | 54:52–56:41 | Ramone | Concorrentes por região; relatório semanal para o Maikon (quantas, fomos, ganhamos, por que não entramos, por que não ganhamos, quem ganhou) | T7 | P |
| 48 | 55:48 | Ramone | Relatório mensal com **dinheiro que entrou, contrato ganho, horas e receita** | T7 | + |
| 49 | 56:44–57:22 | Raul | Anexar a ata e a IA ler participantes, colocação e valores | T7 | P |
| 50 | 57:44–59:36 | Bianca | Só interessam as empresas acima da GSS e o arrematante; diferença de preço; inabilitação lançada à mão com motivo | T7 | P |
| 51 | 59:53 | Ramone | BI dos principais concorrentes e de onde vêm | T7 | P |
| 52 | 01:00:05–01:04:04 | Denise/Bianca | Arquivado não some, fica oculto e pode ser reaberto | T2 | P + (botão Desarquivar explícito) |
| 53 | 01:04:12–01:05:19 | Ramone/Bianca | Suspensos também arquivam com 30 dias; quando reabre, o Effecti avisa com data nova | T1, T2 | + (captação atualiza e desarquiva o card) |
| 54 | 01:03:48 | Bianca | Volume: 4 a 5 mil editais em 6 meses; Trello exigia arquivar a cada 6 meses | T2 | P |
| 55 | 01:06:31–01:07:24 | Bianca | "Enviar para contrato" vira rascunho, que nunca funcionou | T8 | P |
| 56 | 01:07:24–01:08:29 | Bianca | Sequência de contratos quebrada (92 sumiu, pula para 94, 99...); Everton corrigia e voltava | T8 | P · D (renumerar ou não) |
| 57 | 01:08:29–01:11:03 | Bianca | Termo de referência, esclarecimentos e respostas da licitação precisam estar no contrato | T8 | P |
| 58 | 01:10:09 | Bianca | Arquivo não abre no contrato e aparece "Contrato atualizado com sucesso" sem ter atualizado nada | T8 | + |
| 59 | 01:11:42–01:12:00 | Ramone/Bianca | O card sai da licitação e vem para o contrato com tudo | T8 | P |
| 60 | 01:12:00–01:14:48 | Bianca | Etapa "Licitações arrematadas": adjudicação (a transcrição registrou "justificação"), homologação, aguardando assinatura, assinado | T8 | P |
| 61 | 01:15:00–01:15:57 | Bianca | Arrematada pode não virar contrato (revogação, desistência por erro achado na reanálise) | T8 | + (encerra com motivo) |
| 62 | 01:15:57 | Bianca | Número só quando vira contrato de fato | T8 | P |
| 63 | 01:15:57–01:18:38 | Bianca | Contrato assinado avisa Maria Vitória (financeiro) e operacional; segundo aviso quando o serviço inicia (faturamento) | T9 | P |
| 64 | 01:17:43 | Ramone | Ligar o início do serviço à escala | T9 | P |
| 65 | 01:19:33–01:20:46 | Bianca/Ramone | Operacional só manda médico se o contrato existe no Sigma; com contrato em rascunho é preciso "burlar o sistema" | T8 | D |
| 66 | 01:20:50 | Bianca | Médico vinculado a contrato novo avisa a Maria Vitória (faturamento do médico) | T12 | P |
| 67 | 01:21:12 | Raul | Avisos por e-mail | T5, T9, T10, T13 | P |
| 68 | 01:21:46–01:22:00 | Ramone/Bianca | Nem todos os contratos dos médicos estão no Sigma; resumo das condições de cada médico (fixo, regras) como o da Bianca | T12 | P |
| 69 | 01:22:00–01:22:58 | Ramone | Indicador: quem converteu × médico que não assinou (ex.: por causa da multa), para a alta gestão | T12 | P |
| 70 | 01:23:11–01:25:28 | Bianca | Assinatura no Ideia: aviso chega no e-mail da Maine; disparar para quem converteu, inclusive plantão e fim de semana | T11 | P |
| 71 | 01:25:37 | Bianca | Cadastro de hospitais da Maine "não entra" | — | F |
| 72 | 01:26:13 | Raul | Precisa de login do Ideia e do Effecti | T1, T11 | Effecti analisado em 08/10 · Ideia pendente (seção 10) |
| 73 | 01:28:38–01:29:35 | Bianca | E-mail dedicado para os avisos do Ideia; baixar o contrato assinado e anexar no Sigma | T11 | P |
| 74 | 01:29:35–01:30:29 | Bianca | Contrato vai sem a assinatura da GSS; o principal é avisar que o médico assinou | T11 | P (gatilho = médico assinou) |
| 75 | 01:30:36–01:34:02 | Ramone | Cronograma de execução | proposta 08/10 | P (aprovada) |
| 76 | 01:31:16–01:32:26 | Bianca | Certidões e documentos da empresa com validade e alerta por e-mail (afeta Maria Vitória e licitação) | T10 | P |
| 77 | 01:31:16 | Bianca | Documentos dos médicos com vencimento | T13 | P |
| 78 | 01:32:26–01:33:44 | Raul/Bianca | Fazer do "melhor jeito" (cadastro próprio), sem contorno que gere retrabalho | T10, T13 | P |
