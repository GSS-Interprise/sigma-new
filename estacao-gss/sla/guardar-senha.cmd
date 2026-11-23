@echo off
rem Duplo clique: guarda a senha do Vue PACS ou da VPN para o login automatico da estacao do SLA.
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\ssh-tunel\guardar-senha.ps1"
