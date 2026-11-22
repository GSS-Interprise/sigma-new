' Roda o vigia sem abrir janela (para nao tirar o foco do PACS).
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\ssh-tunel\vigia.ps1", 0, True
