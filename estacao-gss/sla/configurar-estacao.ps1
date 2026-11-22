# Configura o Windows da estacao do SLA para nao cair (22/11/2026). ASCII puro (PowerShell 5.1).
# Rodar pelo tunel SSH, como o usuario da estacao (administrador). Sem -Aplicar so mostra como esta.
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\ssh-tunel\configurar-estacao.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\ssh-tunel\configurar-estacao.ps1 -Aplicar
# O que NAO da para fazer daqui (fica no roteiro do README): login automatico (a senha do Windows quem digita e
# alguem da GSS, no Autologon da Sysinternals), "ligar ao voltar a energia" na BIOS e o no-break.
param([switch]$Aplicar)
$ErrorActionPreference = "Continue"

function Reg($caminho, $nome) { try { (Get-ItemProperty -Path $caminho -Name $nome -ErrorAction Stop).$nome } catch { "(nao definido)" } }
function PorReg($caminho, $nome, $valor) {
  if (-not (Test-Path $caminho)) { New-Item -Path $caminho -Force | Out-Null }
  New-ItemProperty -Path $caminho -Name $nome -Value $valor -PropertyType DWord -Force | Out-Null
}
function Energia($sub, $set) {
  $linha = (powercfg /query SCHEME_CURRENT $sub $set | Select-String "Current AC Power Setting Index|Indice da Configuracao de Energia CA Atual|Configura" | Select-Object -Last 1)
  if (-not $linha) { return "?" }
  $v = $linha.ToString() -replace '.*:\s*', ''
  # Tempos vem em segundos e em hexadecimal (0x00000258 = 600 s = 10 min); 0 = nunca.
  if ($sub -like "SUB_*") { try { $s = [Convert]::ToInt32($v, 16); if ($s -eq 0) { "nunca" } else { "{0} min" -f [math]::Round($s / 60) } } catch { $v } } else { $v }
}

$WU = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU"
$SIS = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
$BOOT = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power"
$DESK = "HKCU:\Control Panel\Desktop"

function Retrato {
  [ordered]@{
    "Suspender na tomada"                  = Energia "SUB_SLEEP" "STANDBYIDLE"
    "Hibernar na tomada"                   = Energia "SUB_SLEEP" "HIBERNATEIDLE"
    "Desligar tela na tomada"              = Energia "SUB_VIDEO" "VIDEOIDLE"
    "Desligar disco na tomada"             = Energia "SUB_DISK" "DISKIDLE"
    "Suspensao seletiva USB (0 = desl.)"   = Energia "2a737441-1930-4402-8d77-b2bebba308a3" "48e6b7a6-50f5-4782-a5d4-53bb8f07e226"
    "Inicializacao rapida (0 = desl.)"     = Reg $BOOT "HiberbootEnabled"
    "Update: sem reiniciar com usuario"    = Reg $WU "NoAutoRebootWithLoggedOnUsers"
    "Update: modo (3 = baixa e avisa)"     = Reg $WU "AUOptions"
    "Bloqueio por inatividade (s, 0=nao)"  = Reg $SIS "InactivityTimeoutSecs"
    "Protecao de tela ativa"               = Reg $DESK "ScreenSaveActive"
    "Protecao de tela pede senha"          = Reg $DESK "ScreenSaverIsSecure"
    "Rede pode ser desligada p/ energia"   = ((Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object Status -eq "Up" | ForEach-Object {
        $pm = Get-NetAdapterPowerManagement -Name $_.Name -ErrorAction SilentlyContinue; "$($_.Name)=$($pm.AllowComputerToTurnOffDevice)" }) -join "; ")
  }
}

Write-Output "== Estacao $env:COMPUTERNAME, usuario $env:USERNAME, $(Get-Date -Format s) =="
Write-Output "-- Antes --"
(Retrato).GetEnumerator() | ForEach-Object { "{0,-40} {1}" -f $_.Key, $_.Value }
if (-not $Aplicar) { Write-Output "`n(so leitura: rode com -Aplicar para configurar)"; exit }

# Energia: nunca suspender, hibernar, desligar disco; tela pode apagar? Nao: tela apagada nao atrapalha a captura,
# mas alguns drivers de video param de desenhar e o OCR le preto. Fica sempre ligada.
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
powercfg /change monitor-timeout-ac 0 | Out-Null
powercfg /change disk-timeout-ac 0 | Out-Null
powercfg /hibernate off | Out-Null
powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 | Out-Null
powercfg /setactive SCHEME_CURRENT | Out-Null
# Inicializacao rapida desligada: o PC volta de um "desligar" como boot limpo e sobe o tunel e as tarefas.
PorReg $BOOT "HiberbootEnabled" 0
# Windows Update: baixa, mas so instala/reinicia quando alguem mandar; nunca reinicia com usuario logado.
PorReg $WU "NoAutoRebootWithLoggedOnUsers" 1
PorReg $WU "AUOptions" 3
# Sem bloqueio de tela: tela bloqueada = captura falha (motivo "tela_indisponivel" no coletor).
PorReg $SIS "InactivityTimeoutSecs" 0
Set-ItemProperty -Path $DESK -Name ScreenSaveActive -Value "0"
Set-ItemProperty -Path $DESK -Name ScreenSaverIsSecure -Value "0"
# Placa de rede ligada sempre (economia de energia derruba o tunel e a VPN).
Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object Status -eq "Up" | ForEach-Object {
  try { Set-NetAdapterPowerManagement -Name $_.Name -AllowComputerToTurnOffDevice Disabled -ErrorAction Stop } catch { Write-Output "rede $($_.Name): $($_.Exception.Message)" }
}

Write-Output "`n-- Depois --"
(Retrato).GetEnumerator() | ForEach-Object { "{0,-40} {1}" -f $_.Key, $_.Value }
Write-Output "`nFalta fazer no local (README): login automatico, BIOS 'ligar ao voltar a energia', no-break."
