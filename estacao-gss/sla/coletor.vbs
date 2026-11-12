' Roda o coletor sem abrir janela (powershell -WindowStyle Hidden ainda pisca e pode tirar o foco do PACS).
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\ssh-tunel\coletor.ps1", 0, True
