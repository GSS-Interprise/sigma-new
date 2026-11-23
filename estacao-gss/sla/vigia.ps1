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
  pasta = ""
}
if (Test-Path "$base\estacao.json") {
  try { (Get-Content "$base\estacao.json" -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $cfg[$_.Name] = $_.Value } } catch { }
}
$estadoArq = "$base\vigia-estado.json"
$estado = @{ pacs_aberto_em = $null; vpn_tentou_em = $null; coletor_disparou_em = $null; login_tentou_em = $null; login_falhas = 0 }
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

# 1b. Login do Vue (23/11/2026): o Vue tem protetor de tela proprio que derruba a sessao parada, e ai a lista some.
# Com a senha guardada pela GSS (guardar-senha.ps1, DPAPI), vue-login.ps1 entra sozinho e abre a pasta da fila.
# No maximo 1 tentativa a cada 3 min; depois de 3 falhas seguidas espera 30 min (senha trocada nao vira bloqueio).
# vue_login.py (pywinauto) e o caminho que funciona; o cliente UIA do .NET nao enxerga os campos do Vue.
$py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
if ($pacs -and (Test-Path "$base\vue_login.py") -and (Test-Path $py)) {
  $espera = $(if ([int]$estado.login_falhas -ge 3) { 30 } else { 3 })
  if (Passou $estado.login_tentou_em $espera) {
    $r = (& $py "$base\vue_login.py" ([string]$cfg.pasta) 2>&1 | Out-String).Trim()
    if ($r -ne "sem_tela_login") {
      $estado.login_tentou_em = (Get-Date).ToString("s")
      if ($r -like "entrou*") { $estado.login_falhas = 0 } elseif ($r -ne "sem_senha_guardada") { $estado.login_falhas = [int]$estado.login_falhas + 1 }
      Log "vue_tela_login -> $r (falhas seguidas: $($estado.login_falhas))"
    }
  }
}

# 2. VPN
# Estacao sem VPN (CEPON: servidor publico, sem Sophos): vpn_host vazio em estacao.json pula esta parte.
if ($cfg.vpn_host -and -not (VpnOk)) {
  if ($cfg.sophos_conexao -and (Test-Path $cfg.sophos_cli) -and (Passou $estado.vpn_tentou_em 5)) {
    $estado.vpn_tentou_em = (Get-Date).ToString("s")
    # Com usuario e senha guardados (guardar-senha.ps1 -Sistema sophos), reconecta mesmo sem a senha salva no Sophos.
    $argsVpn = @("enable", "-n", [string]$cfg.sophos_conexao)
    if (Test-Path "$base\cred-sophos.json") {
      try {
        $cs = Get-Content "$base\cred-sophos.json" -Raw | ConvertFrom-Json
        $ps = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $cs.senha)))
        $argsVpn += @("-u", [string]$cs.usuario, "-p", $ps)
      } catch { }
    }
    $saida = & $cfg.sophos_cli @argsVpn 2>&1 | Out-String
    $ps = $null; $argsVpn = $null
    Start-Sleep -Seconds 20
    Log ("vpn_caida -> pedi reconexao ao Sophos: " + ($(if (VpnOk) { "voltou" } else { "nao voltou" })) + " | " + $saida.Trim().Replace("`r", " ").Replace("`n", " "))
  } elseif (Passou $estado.vpn_tentou_em 30) {
    $estado.vpn_tentou_em = (Get-Date).ToString("s")
    Log "vpn_caida (sem reconexao automatica: falta sophos_conexao em estacao.json ou o Sophos Connect)"
  }
}

# 3. Coletor
$logColetor = "$base\coletor.log"
# Sem coletor.log o coletor ainda nao foi instalado nesta estacao: nada a disparar.
$parado = (Test-Path $logColetor) -and ((Get-Date) - (Get-Item $logColetor).LastWriteTime).TotalMinutes -gt 10
if ($parado -and (Passou $estado.coletor_disparou_em 10)) {
  schtasks /run /tn SigmaColetorSLA | Out-Null
  $estado.coletor_disparou_em = (Get-Date).ToString("s")
  Log "coletor sem leitura ha 10 min -> disparei a tarefa SigmaColetorSLA"
}

$estado | ConvertTo-Json | Set-Content $estadoArq
