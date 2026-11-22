# Vigia da estacao do SLA de laudos (22/11/2026). ASCII puro: o PowerShell 5.1 le .ps1 sem BOM como ANSI.
# Roda a cada 1 min na sessao do usuario (tarefa SigmaVigiaSLA, /it): a sessao do SSH nao abre programa na tela.
# Motivo: de 13 a 22/11 o coletor ficou mais tempo parado que rodando (VPN caida 13-16/11, PACS fechado 16-19/11).
# O que faz, sem nunca mexer em dado de paciente:
#   1. PACS fechado  -> abre o Vue PACS de novo (no maximo 1 vez a cada 10 min). Login e pasta "Nao lido" o
#      coletor nao sabe fazer: se o PACS pedir senha, o aviso de estacao parada chega a equipe pelo Sigma.
#   2. VPN caida     -> pede ao Sophos Connect para reconectar (sccli), se a conexao estiver configurada em
#      estacao.json (sophos_conexao) e o Sophos tiver a senha salva. Sem isso, so registra.
#   3. Coletor parado (log sem linha nova ha 10 min) -> dispara a tarefa SigmaColetorSLA.
# Configuracao em C:\ProgramData\ssh-tunel\estacao.json (mesmo arquivo do coletor). Log em vigia.log.
$base = "C:\ProgramData\ssh-tunel"
$cfg = @{
  unidade = "marieta"
  pacs_exe = "C:\Program Files\Philips\PACS\mvclient_574\mv_client\mp.exe"
  vpn_host = "192.168.0.90"; vpn_porta = 2104
  sophos_cli = "C:\Program Files (x86)\Sophos\Connect\sccli.exe"; sophos_conexao = ""
}
if (Test-Path "$base\estacao.json") {
  try { (Get-Content "$base\estacao.json" -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $cfg[$_.Name] = $_.Value } } catch { }
}
$estadoArq = "$base\vigia-estado.json"
$estado = @{ pacs_aberto_em = $null; vpn_tentou_em = $null; coletor_disparou_em = $null }
if (Test-Path $estadoArq) {
  try { (Get-Content $estadoArq -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $estado[$_.Name] = $_.Value } } catch { }
}
function Log($msg) {
  $arq = "$base\vigia.log"
  Add-Content -Path $arq -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $msg)
  $todas = @(Get-Content $arq); if ($todas.Count -gt 3000) { $todas[-1500..-1] | Set-Content $arq }
}
function Passou($quando, $min) {
  if (-not $quando) { return $true }
  try { return ((Get-Date) - [datetime]$quando).TotalMinutes -ge $min } catch { return $true }
}
function VpnOk {
  try { $tc = New-Object System.Net.Sockets.TcpClient; $ok = $tc.ConnectAsync([string]$cfg.vpn_host, [int]$cfg.vpn_porta).Wait(3000) -and $tc.Connected; $tc.Close(); return $ok } catch { return $false }
}

# 1. PACS
$pacs = Get-Process mp -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pacs) {
  if (Passou $estado.pacs_aberto_em 10) {
    if (Test-Path $cfg.pacs_exe) {
      Start-Process -FilePath $cfg.pacs_exe -WorkingDirectory (Split-Path $cfg.pacs_exe)
      $estado.pacs_aberto_em = (Get-Date).ToString("s")
      Log "pacs_fechado -> abri o Vue PACS"
    } else { Log "pacs_fechado e programa nao encontrado em $($cfg.pacs_exe)" }
  }
}

# 2. VPN
if (-not (VpnOk)) {
  if ($cfg.sophos_conexao -and (Test-Path $cfg.sophos_cli) -and (Passou $estado.vpn_tentou_em 5)) {
    $estado.vpn_tentou_em = (Get-Date).ToString("s")
    $saida = & $cfg.sophos_cli enable -n ([string]$cfg.sophos_conexao) 2>&1 | Out-String
    Start-Sleep -Seconds 20
    Log ("vpn_caida -> pedi reconexao ao Sophos: " + ($(if (VpnOk) { "voltou" } else { "nao voltou" })) + " | " + $saida.Trim().Replace("`r", " ").Replace("`n", " "))
  } elseif (Passou $estado.vpn_tentou_em 30) {
    $estado.vpn_tentou_em = (Get-Date).ToString("s")
    Log "vpn_caida (sem reconexao automatica: falta sophos_conexao em estacao.json ou o Sophos Connect)"
  }
}

# 3. Coletor
$logColetor = "$base\coletor.log"
$parado = -not (Test-Path $logColetor) -or ((Get-Date) - (Get-Item $logColetor).LastWriteTime).TotalMinutes -gt 10
if ($parado -and (Passou $estado.coletor_disparou_em 10)) {
  schtasks /run /tn SigmaColetorSLA | Out-Null
  $estado.coletor_disparou_em = (Get-Date).ToString("s")
  Log "coletor sem leitura ha 10 min -> disparei a tarefa SigmaColetorSLA"
}

$estado | ConvertTo-Json | Set-Content $estadoArq
