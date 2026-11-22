# Estações do SLA de laudos (GSS)

Duas estações, cada uma com o seu PACS aberto (22/11/2026). Marieta e CEPON usam o mesmo Vue PACS, e o programa
não abre os dois ao mesmo tempo na mesma máquina (Brenda, 18/11):

| Estação | Unidades | Túnel (na VPS da GSS) |
|---|---|---|
| PC do robô (`DESKTOP-0VUPT0G`, usuário `vinicius`) | Marieta (e Tijucas, quando o Animati for mapeado) | `ssh -i /root/.ssh/gss_pc -p 2222 vinicius@localhost` |
| PC da Brenda (usuário `heron`, a confirmar) | CEPON | `ssh -i /root/.ssh/gss_pc -p 2223 heron@localhost` |

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

A edge `sla-alertas` (cron 5 min) abre uma queda quando a estação fica 15 min sem leitura boa e avisa por e-mail e
WhatsApp (modelo `gss_estacao_sla_v1`), com lembrete a cada 3 h enquanto continuar parada, e de novo quando volta.
Quem recebe o WhatsApp: config `sla_estacao_destinos` (JSON `[{"nome","fone"}]`); vazio = `sla_teste_destino`.
