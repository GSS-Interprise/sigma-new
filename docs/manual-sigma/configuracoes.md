---
area: configuracoes
titulo: Configurações
modulo: configuracoes
telas: [/configuracoes, /conectar-claude]
---
# Configurações
Área do administrador para cuidar de usuários, papéis, permissões, integrações e do acesso do Claude dos sócios ao Sigma.

## Onde fica
- Menu lateral, item "Configurações" (rota /configuracoes). Só aparece para Administrador.
- A tela tem 3 grupos:
  - "Pessoas & Acesso": abas "Usuários", "Permissões", "Matriz de permissões" e "Setores".
  - "Canais & Integrações": abas "WhatsApp", "LinkedIn e Instagram", "Motor de IA", "Agente do Sigma", "API Tokens" e "Webhooks".
  - "Auditoria & Histórico": abas "Log de permissões" e "Histórico geral".
- A página /conectar-claude fica no item "Conectar o Claude" do menu. Aparece para Administrador e Diretoria.

## Como o acesso funciona
- Cada pessoa tem um ou mais papéis (perfis), por exemplo "Gestor Financeiro" ou "Diretoria".
- A tabela de permissões diz, para cada papel, o que ele pode fazer em cada módulo: Visualizar, Criar, Editar, Excluir e Aprovar.
- A pessoa pode o que qualquer um dos seus papéis pode (função `has_permission`).
- O papel Administrador pode tudo.
- Um módulo só aparece no menu se a pessoa tem a ação Visualizar nele. Abrir a rota sem essa permissão leva de volta à página inicial.
- Existe também o bloqueio de um módulo para uma pessoa só (tabela `usuario_modulos_bloqueados`). Ele vale acima do papel, até para administrador.

## Como fazer: criar um usuário
1. Em "Pessoas & Acesso", aba "Usuários", clique em "Criar Usuário".
2. Preencha "Nome Completo", "Email", "Senha", "Telefone", "Setor" e "Status" ("Ativo", "Inativo" ou "Suspenso").
3. Em "Permissões / Funções", marque os papéis da pessoa.
4. Clique em "Salvar".
- Papéis disponíveis: Administrador, Gestor de Contratos, Gestor de Captação, Coordenador de Escalas, Gestor Financeiro, Diretoria, Gestor de Radiologia, Gestor de Marketing, Gestor AGES, Líder de Setor, Encerramento de Tickets, Líder de Licitação e Licitador.

## Como fazer: dar acesso a alguém (mudar os papéis)
1. Na aba "Usuários", clique no botão de editar da pessoa.
2. Em "Permissões / Funções", marque ou desmarque os papéis.
3. Clique em "Salvar".
- O campo "Senha" só aparece na criação. Para senha esquecida, use o botão "Resetar senha" da linha. Ele envia um e-mail de redefinição.

## Como fazer: mudar o que um papel pode fazer
1. Aba "Permissões", em "Selecione um Perfil", escolha o papel.
2. Abra o módulo e marque as ações: "Visualizar", "Criar", "Editar", "Excluir" e "Aprovar".
3. Para começar de um modelo, use "Aplicar template". Para copiar de outro papel, escolha em "Copiar de..." e clique no botão ao lado.
4. Clique em "Salvar Alterações (N)". "Descartar" desfaz o que não foi salvo.
- Desmarcar "Visualizar" desmarca todas as outras ações do módulo.
- O perfil Administrador não pode ter as permissões alteradas.
- A mudança vale para todas as pessoas daquele papel.
- Cada mudança fica registrada na aba "Log de permissões".

## Como fazer: ver quem tem acesso a quê
1. Abra a aba "Matriz de permissões".
2. Use "Buscar usuário..." ou "Filtrar por role".
3. Para levar a matriz para planilha, clique em "Exportar CSV".

## Como fazer: liberar um assunto para o Claude dos sócios
1. Em "Canais & Integrações", abra a aba "Agente do Sigma".
2. No quadro "O que cada papel enxerga", ligue a chave do assunto na linha do papel.
3. A mudança vale na próxima pergunta. Pessoas do mesmo papel recebem as mesmas respostas.
- Assunto novo nasce desligado para todos os papéis. O administrador libera aqui.
- Assuntos "Em breve" aparecem listados, desligados.

## Como fazer: conectar o Claude de alguém da GSS
1. Na aba "Agente do Sigma", no quadro "Conectar o Claude de alguém da GSS", clique em "Copiar convite" e mande à pessoa.
2. O convite explica o passo a passo: no Claude, Configurações › Conectores › Adicionar conector personalizado, colar o endereço e entrar com o login do Sigma.
3. "Copiar endereço" copia só o endereço do conector.
- A pessoa precisa ser Administrador ou Diretoria.
- Os números do topo mostram pessoas conectadas, perguntas e erros dos últimos 7 dias.

## Como fazer: desligar o Claude de alguém
1. Na aba "Agente do Sigma", em "Claudes conectados", clique em "Desligar" na conexão.
2. Confirme. Esse Claude para de ler o Sigma na hora.
- Para voltar, a pessoa conecta de novo pelo convite.

## Como fazer: comparar duas respostas diferentes do Claude
1. Na aba "Agente do Sigma", em "Perguntas dos últimos 7 dias", marque as duas perguntas.
2. A comparação aparece lado a lado. Mesmo resultado indica o mesmo fato, só com redação diferente.
- O quadro "Guia que o agente lê" mostra o texto exato que chega ao Claude e a versão do protocolo.

## Página Conectar o Claude (/conectar-claude)
- Cada sócio usa esta página para a própria conta. Ela fica fora de Configurações porque lá só entra administrador.
- "Endereço do conector": o endereço para colar no Claude, com botão "Copiar".
- "Suas conexões": as conexões da própria pessoa, com o botão "Desligar".
- "Token para o Claude Code": só se o Claude Code não abrir o login sozinho. Clique em "Gerar token" e copie o comando. O token não aparece de novo. Depois clique em "Já copiei".
- Quando o Claude pede acesso, a página mostra "Conectar o ... ao Sigma?" com os botões "Autorizar" e "Cancelar".
- Sem papel Administrador ou Diretoria, a página avisa que o usuário não tem acesso ao Claude dos sócios.

## Regras e situações
- Configurações é só para Administrador. Quem não é vê "Acesso restrito a administradores" e volta para a página inicial.
- O bloqueio de módulo por pessoa não tem tela. É feito pela equipe técnica do Sigma.
- Pessoa com um módulo bloqueado não vê o item no menu e não abre a rota. Para Licitações, ela também deixa de receber as notificações de licitação.
- Permissões e papéis ficam guardados por até 5 minutos no navegador. Depois de mudar, peça para a pessoa recarregar a página.

## Quem pode
- Tudo em /configuracoes: só Administrador.
- /conectar-claude: Administrador e Diretoria.
- Liberar assuntos do agente e desligar conexões de outras pessoas: só Administrador.

## Perguntas frequentes
**P:** Por que alguém não vê um módulo no menu?
**R:** Pode ser um destes motivos: (1) nenhum papel dela tem "Visualizar" naquele módulo; (2) o módulo está bloqueado só para ela; (3) a página dela ainda não recarregou depois da mudança.

**P:** Como dou acesso ao Financeiro para uma pessoa?
**R:** Dê a ela um papel que tenha "Visualizar" em Financeiro (aba "Usuários"). Ou ligue "Visualizar" em Financeiro para o papel dela (aba "Permissões"), lembrando que vale para todos daquele papel.

**P:** Quero tirar um módulo de uma pessoa só, sem afetar o resto do papel. Como?
**R:** Use o bloqueio de módulo por pessoa. Ele não tem tela: peça à equipe técnica do Sigma.

**P:** Mudei a permissão e a pessoa ainda não vê. O que faço?
**R:** Peça para ela recarregar a página. A permissão fica guardada por até 5 minutos.

**P:** Um sócio não consegue conectar o Claude. Por quê?
**R:** Ele precisa do papel Administrador ou Diretoria. Veja os papéis dele na aba "Usuários".

**P:** O Claude disse que não tem acesso a um assunto. Como libero?
**R:** Na aba "Agente do Sigma", ligue a chave do assunto na linha do papel da pessoa.
