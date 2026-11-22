---
area: medicos
titulo: Médicos e leads
modulo: medicos
telas: [/medicos, /leads]
---
# Médicos e leads
Cadastro dos médicos da GSS: leads em captação, conversão em médico, aprovação no corpo clínico, propostas, documentos e bloqueios.

## Onde fica
- Menu "Médicos" (rota /medicos). Abas: "Kanban", "Corpo Clínico", "Leads", "Ausência", "Remuneração" e, só para admin, "Migração".
  - "Kanban": "Kanban de Captação", com os cards dos médicos em processo.
  - "Corpo Clínico": médicos já aprovados, com filtros, "Exportar PDF", "Novo Médico" e "Novo prestador".
  - "Leads": lista de leads para editar, com "Importar Excel" e "Novo Lead".
- "Universo de Leads" (rota /leads): toda a base de médicos do Brasil para explorar e filtrar. Abre a vista rápida "Ver perfil".
- Ficha do lead (prontuário): abre ao clicar em um lead ou médico. Tem dois grupos:
  - "Perfil do médico": abas "Dados", "Propostas", "Perfil IA" e "Na GSS" (só para quem já virou médico).
  - "Atividade & histórico": abas "Histórico", "Atividades", "Conversão" e "OLD" (só para alguns papéis).

## Lead e médico do corpo clínico
- Lead é um contato de médico em prospecção. Ele ainda não trabalha com a GSS.
- Ao converter, o lead ganha um cadastro de médico e um card no "Kanban de Captação". O status do lead vira "Convertido".
- Médico do corpo clínico é o médico convertido que passou nas três aprovações: "Contrato Assinado", "Documentação com Unidade Completa" e "Cadastro Aprovado pela Unidade".
- Só aparece na aba "Corpo Clínico" quem tem as três aprovações. Prestadores cadastrados por "Novo prestador" também aparecem.
- Status possíveis de um lead: Novo, Qualificado, Acompanhamento, Em Resposta, Proposta Enviada, Proposta Aceita, Convertido e Descartado.

## Como fazer: criar um lead
1. Em "Médicos", aba "Leads", clique em "Novo Lead".
2. Na janela "Verificar CPF/CNPJ antes de criar lead", digite o CPF ou CNPJ e clique em "Verificar".
3. Se o documento já existe, o Sigma abre a ficha existente. Se não existe, abre uma ficha nova.
4. Preencha os dados e clique em "Criar". Arquivos escolhidos antes só sobem quando você clica em "Criar".

## Como fazer: converter um lead em médico
1. Abra a ficha do lead e vá em "Atividade & histórico" > aba "Conversão".
2. Confira os "Campos Obrigatórios": Nome, CPF, Telefone, E-mail, Local de atuação (Unidades), Modalidade de contrato e Proposta Vinculada.
3. Campos que faltam ficam em vermelho. Preencha na aba "Dados" e salve.
4. Se o lead recebeu proposta por disparo, aparece "Disparo identificado!". Clique em "Vincular Proposta" para usar essa proposta.
5. Com tudo preenchido, marque "Confirmo que verifiquei todos os dados e documentos estão corretos para conversão".
6. Clique em "Converter em Médico".
7. Escolha o "Canal de Conversão": INDICAÇÃO, WHATSAPP, EMAIL, TRÁFEGO PAGO ou LISTA CAPTADORA.
8. Escreva o "Motivo da conversão".
9. Anexe o print da consulta de processos no JUS (PNG ou JPG, até 10MB). Pode clicar, arrastar ou colar com Ctrl+V.
10. Clique em "Confirmar Conversão". Leia a "Confirmação de Responsabilidade" e confirme. "Voltar e Revisar" cancela.

## Como fazer: aprovar o médico para o corpo clínico
1. Na tela "Médicos", abra a ficha do médico convertido e vá na aba "Conversão".
2. No bloco "Aprovar para Corpo Clínico", escolha o "Status do Médico": Ativo, Inativo ou Suspenso.
3. Marque "Contrato Assinado", "Documentação com Unidade Completa" e "Cadastro Aprovado pela Unidade".
4. Com as três marcadas, escreva o "Motivo da aprovação" (obrigatório).
5. Clique em "Salvar Aprovações". O médico passa para a aba "Corpo Clínico".
6. Pode salvar só parte das aprovações. O médico fica fora do corpo clínico até ter as três.

## Como fazer: cadastrar direto no corpo clínico
1. Em "Médicos", aba "Corpo Clínico", clique em "Novo Médico". Esse cadastro exige CRM.
2. Para quem presta serviço e não é médico (sem CRM nem especialidade), use "Novo prestador".

## Como fazer: fazer uma proposta ao médico
1. Antes, vincule ao menos uma unidade ao lead na aba "Dados". Sem unidade aparece "Nenhuma unidade vinculada".
2. Abra a ficha e vá em "Perfil do médico" > aba "Propostas".
3. Clique em "Nova Proposta".
4. Escolha a "Unidade". O Sigma mostra o contrato ativo dessa unidade. Sem contrato, aparece "Sem contrato ativo" e não dá para criar.
5. Em "Itens do Contrato e Valores do Médico", preencha o valor do médico de cada item.
6. Se precisar, use "Itens Adicionais (Plantão, Hora, etc.)" e "Observações".
7. Clique em "Criar Proposta".
8. Para usar uma proposta que já existe, clique em "Vincular Existente".
- A proposta criada na ficha é personalizada para esse médico. Ela não é proposta de disparo.
- A lixeira de uma proposta vinculada só desvincula ("Desvincular proposta?"). Ela fica livre para outros leads. Nas demais, exclui ("Excluir proposta?") e não tem volta.

## Como fazer: ver o histórico do médico
1. "Atividade & histórico" > "Histórico": anotações e conversas do lead. O número vermelho indica mensagens não lidas.
2. "Atividade & histórico" > "Atividades": as atividades registradas no lead.
3. "Perfil do médico" > "Perfil IA": perfil montado pela IA e o "Histórico Unificado" (IA, conversas manuais e contatos).
4. "Perfil do médico" > "Na GSS": o que o médico já fez com a GSS. Aparece só para quem já virou médico.
   - Números: "Plantões feitos", "Hospitais", "Com a GSS" (desde quando) e "Próximos plantões".
   - Listas: "Onde trabalhou", "Próximos plantões", "Produção paga pelo financeiro" (plantões e horas, sem valores) e "Campanhas de prospecção".
   - As escalas vêm do Dr. Escala e são ligadas ao médico pelo nome, porque o Dr. Escala não manda CRM.
5. Em /leads, "Ver perfil" mostra "Histórico com o médico" e a conversa, para leitura rápida.

## Como fazer: anexar documentos do médico
1. Na aba "Dados", no fim, use "Selecionar Arquivos" ou arraste os arquivos para a área de anexos.
2. Na aba "OLD" (admin, líderes e gestor de contratos) fica "Upload de Documentos".
3. Ali escolha o "Tipo de Documento": Diploma, Certificado, RG, CPF, CRM, RQE, Título de Especialista, Comprovante de Residência, Certidão, Carta de Recomendação, Contrato/Aditivo, Link Externo (Google Drive / OneDrive) ou Outro.
4. Preencha "Emissor", "Data de Emissão", "Data de Validade" e "Observações" se quiser.
5. Clique em "Enviar Documentos" (ou "Salvar Link Externo" para link).

## Como fazer: bloquear disparos para um contato
1. Abra a ficha e vá na aba "Conversão", bloco "Controle de Disparos".
2. Blacklist (permanente): clique em "Adicionar à Blacklist", escreva o "Motivo do bloqueio" e confirme. O contato não recebe mais disparos automáticos de WhatsApp ou e-mail.
3. Para desfazer: "Remover da Blacklist" > "Confirmar Remoção".
4. Bloqueio temporário: clique em "Bloquear Disparos" e escreva o motivo. O lead some da seleção de disparos. O status dele não muda.
5. Para desfazer: "Remover Bloqueio" > "Confirmar Remoção".
6. Também dá para usar o ícone "Adicionar à blacklist" na tabela do "Corpo Clínico" e o menu "Ações" da aba "Leads".
7. Em /leads, a vista "Ver perfil" tem "Classificação" (Normal, VIP, Protegido, Proibido) e a chave "Opt-out (não contactar)".

## Como fazer: desfazer uma conversão ou descartar
1. Médico convertido e ainda não aprovado: aba "Conversão" > "Voltar a ser Lead" > "Desconverter para Lead". Informe o motivo. O card do Kanban é excluído e o histórico fica.
2. Médico já no corpo clínico: aba "Conversão" > "Desconverter para Lead" > "Confirmar Desconversão", com motivo.
3. Médico do corpo clínico com novo processo (ex.: novo hospital): "Reprocessar no Kanban" > "Confirmar Reprocessamento". Ele continua no corpo clínico e ganha um card novo no Kanban.
4. Descartar: "Descartar Lead" > escreva o "Motivo do descarte" com no mínimo 60 caracteres > "Confirmar Descarte". O lead fica com status "Descartado".

## Regras e situações
- Contrato assinado no Ideia Signer chega sozinho ao Sigma:
  - Quando o médico assina, quem converteu o médico recebe a notificação "<nome> assinou no Ideia". Sem conversor conhecido, a notificação vai para a gestão de contratos.
  - Quando o documento é concluído (todos assinaram), o Sigma marca "Contrato Assinado" no médico.
  - O card do Kanban avança para "Pronto para Cadastro" se ainda estiver nas primeiras etapas. Card mais adiantado fica onde está.
  - O PDF assinado é anexado nos documentos do médico (tipo Contrato/Aditivo, emissor Ideia Signer) e nos anexos do card, como "Contrato assinado - ...".
  - O médico é encontrado pelo CPF ou pelo e-mail. Sem cadastro igual, ninguém é avisado.
- Descadastro: quando o médico pede para parar no WhatsApp da campanha, o Sigma coloca o número na blacklist sozinho (origem opt-out) e as campanhas param de chamá-lo.
- Na aba "Na GSS", se houver dois médicos com o mesmo nome, as escalas do Dr. Escala não aparecem, para não misturar.

## Quem pode
- /medicos: quem tem o módulo "medicos" liberado. A aba "Migração" e o botão "Importar Excel" do "Corpo Clínico" são só para admin.
- /leads: quem tem o módulo "disparos" liberado.
- Aba "OLD" da ficha: admin, líderes e gestor de contratos.
- Aba "Na GSS": quem pode visualizar o módulo "medicos".
- Blacklist pelo menu "Ações" da aba "Leads": admin, líder e gestor de captação, ou quem tem a permissão de blacklist da captação.
- Os módulos de cada papel são liberados pelo admin em Configurações.

## Perguntas frequentes
**P:** Qual a diferença entre lead e médico?
**R:** Lead é contato em prospecção. Médico é o lead convertido. Ele só entra no "Corpo Clínico" depois das três aprovações.

**P:** Converti o lead, mas ele não aparece no Corpo Clínico. Por quê?
**R:** Falta aprovar. Na aba "Conversão", marque as três aprovações, escreva o motivo e clique em "Salvar Aprovações".

**P:** O botão "Confirmar Conversão" está cinza.
**R:** Faltam o "Canal de Conversão", o "Motivo da conversão" ou o print do JUS.

**P:** Não consigo criar proposta.
**R:** O lead precisa de uma unidade vinculada na aba "Dados", e essa unidade precisa de contrato ativo.

**P:** Onde vejo os plantões que o médico já fez?
**R:** Na ficha, "Perfil do médico" > aba "Na GSS".

**P:** Onde fica o contrato assinado no Ideia?
**R:** Nos documentos do médico (aba "OLD") e nos anexos do card do Kanban.

**P:** Qual a diferença entre blacklist e bloqueio temporário?
**R:** A blacklist bloqueia disparos automáticos de vez. O bloqueio temporário só tira o lead da seleção de disparos e pode ser removido depois.
