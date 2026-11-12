# Coletor de SLA de laudos (estação da GSS)

Roda no PC da GSS que fica com a VPN do Marieta e o Vue PACS abertos (`DESKTOP-0VUPT0G`, usuário `vinicius`).
Lê a fila "Não lido" da pasta `TC - Plantão` por OCR do Windows e manda à edge `sla-coletor` só data, hora e
origem de cada linha. Nome de paciente não sai do processo.

- `coletor.ps1` — captura em memória, acha as linhas pela cor (laranja internado, azul externo, vermelho PS),
  OCR linha a linha, envia. ASCII puro: o PowerShell 5.1 lê `.ps1` sem BOM como ANSI.
- `coletor.vbs` — roda o `.ps1` sem janela (para não tirar o foco do PACS).

Instalação no PC (em `C:\ProgramData\ssh-tunel\`, pelo túnel SSH; ver Vault `Projetos/GSS-SLA-Laudos-Radiologia.md`):

- `sla_key.txt` com o valor do secret `SLA_COLETOR_KEY` (só SYSTEM, Administradores e `vinicius` leem; nunca versionar).
- Tarefa `SigmaColetorSLA`: `schtasks /create /tn SigmaColetorSLA /tr "wscript.exe //B C:\ProgramData\ssh-tunel\coletor.vbs" /sc minute /mo 3 /it /ru vinicius /f`.
  Tem que ser `/it` (sessão do usuário): pela sessão do SSH a captura de tela não funciona.
- Log sem dado de paciente em `coletor.log`.

Posições da grade (`$gx = 487`, `$gw = 1425`, início em y 236) valem para a tela 1920x1080 desta estação.
