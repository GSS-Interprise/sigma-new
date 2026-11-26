# Estações do SLA de laudos (GSS)

Duas estações, cada uma com o seu PACS aberto (22/11/2026). Marieta e CEPON usam o mesmo Vue PACS, e o programa
não abre os dois ao mesmo tempo na mesma máquina (Brenda, 18/11):

| Estação | Unidades | Túnel (na VPS da GSS) |
|---|---|---|
| PC do robô (`DESKTOP-0VUPT0G`, usuário `vinicius`) | Marieta (e Tijucas, quando o Animati for mapeado) | `ssh -i /root/.ssh/gss_pc -p 2222 vinicius@localhost` |
| PC da Brenda / baia do Wagner (usuário `heron`) | CEPON (e Tijucas/Mobilimed, web) | `ssh -i /root/.ssh/gss_pc -p 2223 heron@localhost` |

### Mapa da baia do Wagner (sonda só-leitura, 23/11/2026)

- **Dois monitores**, 3840x1080 no total. O Vue PACS (CEPON) fica no monitor da esquerda (0-1920), e o Chrome no da
  direita. O Vue do CEPON é o `PACS592extip`, servidor `srvpacs` (187.94.103.178), **sem VPN**. O Sophos não
  está conectado nesse PC.
- **Vue do CEPON = mesmo programa da Marieta, 48 px mais baixo:** a barra "Aplicativos" do visualizador fica por
  cima do explorador. Cabeçalho da grade em y 239 (Marieta 191). Logo `-GradeTopo 284 -AtualizarX 341
  -AtualizarY 143`, com `-GradeX 487` igual. **Conferir numa captura com a lista aberta** antes de instalar.
- **Árvore do `srvpacs`:**
  - Procurar;
  - 00 - BRONCOSCOPIA / COLONOSCOPIA / ENDOSCOPIA / HOJE / RAIO X / RETOSSIGMOIDOSCOPIA / TOMOGRAFIA / ULTRASSONOGRAFIA;
  - Arquivo de aprendizagem, Hoje, RX - a distribuir, TC - a distribuir, Todos os estudos, Todos os pacientes.
- **Falta a GSS dizer** qual dessas pastas é a fila de "não laudados" (na Marieta é "TC - Plantão", filtro NÃO LIDO).
- **Pela UIA**, o Vue expõe o botão Atualizar (`ae_refresh`) e as linhas da grade (`DataItem`). Com isso dá para
  atualizar sem clique de mouse e sem o PACS na frente, o que importa porque é o PC de trabalho do Wagner. Ainda
  não testado com a lista aberta.
- **Tijucas (Animati):** web, `cdi.tijucas.rangsaude.com.br/studies`, no Chrome do Wagner. **Mobilimed:** web,
  `laudos.mobilemed.com.br`, login da Brenda. O Chrome não expõe o conteúdo da página pela UIA. Para os dois, o
  caminho é ler a página no navegador (extensão no perfil logado ou API da própria página), não OCR. É coletor
  novo, ainda não feito.

Arquivos (todos em `C:\ProgramData\ssh-tunel\` na estação; ASCII puro, porque o PowerShell 5.1 lê `.ps1` sem BOM como ANSI):

- `coletor.ps1` / `coletor.vbs` — lê a fila "Não lido" do PACS por OCR a cada 3 min e manda à edge `sla-coletor` data,
  hora, origem, nome e estudo. A unidade e as posições da tela vêm de `estacao.json`.
- `vigia.ps1` / `vigia.vbs` — a cada 1 min: reabre o PACS se fechou, pede ao Sophos para reconectar a VPN (se
  `sophos_conexao` estiver em `estacao.json` e a senha salva no Sophos) e dispara o coletor se ele parou. Log em `vigia.log`.
- `configurar-estacao.ps1` — deixa o Windows sem suspender, sem hibernar, sem bloqueio de tela, sem reinício do
  Windows Update com usuário logado, sem inicialização rápida e com a placa de rede sempre ligada. Sem `-Aplicar` só mostra.
- `instalar-estacao.ps1 -Unidade marieta|cepon` — grava `estacao.json` e cria as tarefas `SigmaColetorSLA` (3 min) e
  `SigmaVigiaSLA` (1 min), na sessão do usuário (`/it`: pela sessão do SSH a tela não é capturada).
- `sla_key.txt` — valor do secret `SLA_COLETOR_KEY` (só SYSTEM, Administradores e o usuário leem; **nunca versionar**).

## Roteiro quando a estação ligar (pelo túnel)

1. Da VPS (os scripts já estão em `/root/estacao-sla/`): copiar (`scp -P 2222 -i /root/.ssh/gss_pc /root/estacao-sla/*
   vinicius@localhost:C:/ProgramData/ssh-tunel/`). No PC da Brenda, porta 2223 e copiar também `sla_key.txt`.
2. `configurar-estacao.ps1` (ver como está) e depois `configurar-estacao.ps1 -Aplicar`.
3. `instalar-estacao.ps1 -Unidade marieta` (PC do robô) ou `-Unidade cepon` (PC da Brenda). Se a tela do PC da Brenda
   não for 1920x1080 com o PACS maximizado, medir a grade numa captura e passar `-GradeX/-GradeLargura/-GradeTopo` e
   `-AtualizarX/-AtualizarY` (apagar a captura depois: tem nome de paciente).
4. Conferir no Sigma (Radiologia › SLA ao vivo, escolher a unidade no topo) a primeira leitura em até 3 min.

## O que só dá para fazer no local (Brenda ou o TI da GSS)

- **Login automático** do usuário da estação (Autologon da Sysinternals; a senha do Windows é digitada por alguém da
  GSS). Sem isso, depois de reiniciar, coletor e vigia só voltam quando alguém faz login.
- **BIOS:** "Restore on AC power loss" = Power On (o PC liga sozinho quando a energia volta).
- **No-break** nas duas estações.
- **Sophos Connect:** salvar usuário e senha da VPN na conexão e informar o nome da conexão (`sophos_conexao`) para
  o vigia reconectar sozinho.
- **Antes de sair da GSS:** VPN conectada, PACS aberto e maximizado na pasta "Não lido", sem outra janela por cima e
  sem bloquear a tela (Windows + L trava a captura).

## Avisos quando a estação para

A edge `sla-alertas` (cron 2 min) abre uma queda quando a estação fica 15 min sem leitura boa, ou antes: 2 leituras
seguidas com PACS fechado, VPN caída, tela de login ou sessão expirada, ou 8 min sem leitura nenhuma (26/11). Avisa por e-mail e
WhatsApp (modelo `gss_estacao_sla_v1`), com lembrete a cada 3 h enquanto continuar parada, e de novo quando volta.
Quem recebe o WhatsApp: config `sla_estacao_destinos` (JSON `[{"nome","fone"}]`); vazio = `sla_teste_destino`.
