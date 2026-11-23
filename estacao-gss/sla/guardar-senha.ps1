# Guarda usuario e senha de um sistema para o login automatico da estacao do SLA (23/11/2026). ASCII puro.
# Quem roda e a pessoa da GSS, NA PROPRIA ESTACAO e logada como o usuario da estacao (o mesmo das tarefas do vigia):
# a senha e digitada aqui e cifrada com o DPAPI do Windows (so esse usuario, nesse PC, consegue abrir). Nao vai para
# o Sigma, para o git nem para a Pulse. Arquivo: C:\ProgramData\ssh-tunel\cred-<sistema>.json (acesso so do usuario).
# Uso: duplo clique em guardar-senha.cmd, ou  powershell -File guardar-senha.ps1 -Sistema vue|sophos
param([ValidateSet("vue", "sophos")][string]$Sistema = "")
$base = "C:\ProgramData\ssh-tunel"
if (-not $Sistema) {
  Write-Host "Qual senha guardar?  1 = Vue PACS   2 = VPN Sophos"
  $op = Read-Host "Numero"
  $Sistema = @{ "1" = "vue"; "2" = "sophos" }[$op]
  if (-not $Sistema) { Write-Host "Opcao invalida."; exit 1 }
}
$usuario = Read-Host "Usuario do $Sistema"
$senha = Read-Host "Senha do $Sistema (nao aparece na tela)" -AsSecureString
$conf = Read-Host "Repita a senha" -AsSecureString
$p1 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($senha))
$p2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($conf))
if ($p1 -ne $p2 -or -not $p1) { Write-Host "As senhas nao conferem. Nada foi guardado."; exit 1 }
$p1 = $null; $p2 = $null
$arq = "$base\cred-$Sistema.json"
@{ usuario = $usuario; senha = (ConvertFrom-SecureString $senha); guardado_em = (Get-Date).ToString("s"); por = $env:USERNAME } |
  ConvertTo-Json | Set-Content $arq -Encoding ASCII
# So o usuario da estacao (e o SYSTEM) le o arquivo; o conteudo ja e inutil fora deste usuario/PC (DPAPI).
icacls $arq /inheritance:r /grant:r "${env:USERNAME}:(R,W)" "SYSTEM:(F)" | Out-Null
Write-Host "Guardado. O vigia passa a entrar sozinho no $Sistema quando a sessao cair."
Start-Sleep -Seconds 3
