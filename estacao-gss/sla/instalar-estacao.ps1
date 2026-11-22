# Instala coletor e vigia numa estacao do SLA (22/11/2026). ASCII puro (PowerShell 5.1).
# Os arquivos (coletor.ps1/.vbs, vigia.ps1/.vbs, configurar-estacao.ps1) ja precisam estar em C:\ProgramData\ssh-tunel
# (copiados pelo tunel com scp). sla_key.txt tambem (valor do secret SLA_COLETOR_KEY; nunca versionar).
# Uso, pelo tunel, como o usuario da estacao:
#   PC do Marieta: ...\instalar-estacao.ps1 -Unidade marieta
#   PC da Brenda:  ...\instalar-estacao.ps1 -Unidade cepon
# Grade em outra posicao (tela diferente de 1920x1080 ou PACS em outra janela): passar -GradeX/-GradeLargura/-GradeTopo
# e -AtualizarX/-AtualizarY, medidos numa captura da tela (sem dado de paciente salvo).
param(
  [Parameter(Mandatory = $true)][ValidateSet("marieta", "cepon")][string]$Unidade,
  [int]$GradeX = 487, [int]$GradeLargura = 1425, [int]$GradeTopo = 236, [int]$AtualizarX = 340, [int]$AtualizarY = 95,
  [string]$SophosConexao = ""
)
$base = "C:\ProgramData\ssh-tunel"
foreach ($f in "coletor.ps1", "coletor.vbs", "vigia.ps1", "vigia.vbs", "sla_key.txt") {
  if (-not (Test-Path "$base\$f")) { Write-Output "FALTA $base\${f}: copie antes de instalar."; exit 1 }
}
$cfg = [ordered]@{
  unidade = $Unidade; grade_x = $GradeX; grade_largura = $GradeLargura; grade_topo = $GradeTopo
  atualizar_x = $AtualizarX; atualizar_y = $AtualizarY; sophos_conexao = $SophosConexao
}
$cfg | ConvertTo-Json | Set-Content "$base\estacao.json" -Encoding ASCII
$usuario = $env:USERNAME
# /it = so roda com o usuario logado na tela (captura e abrir programa nao funcionam pela sessao do SSH).
schtasks /create /tn SigmaColetorSLA /tr "wscript.exe //B $base\coletor.vbs" /sc minute /mo 3 /it /ru $usuario /f | Out-Null
schtasks /create /tn SigmaVigiaSLA /tr "wscript.exe //B $base\vigia.vbs" /sc minute /mo 1 /it /ru $usuario /f | Out-Null
Write-Output "estacao.json:"; Get-Content "$base\estacao.json"
Write-Output "`nTarefas:"; schtasks /query /tn SigmaColetorSLA /fo LIST | Select-String "Nome da tarefa|TaskName|Status"; schtasks /query /tn SigmaVigiaSLA /fo LIST | Select-String "Nome da tarefa|TaskName|Status"
Write-Output "`nPronto. Em ate 3 min a primeira leitura de '$Unidade' aparece no Sigma (Radiologia > SLA ao vivo)."
