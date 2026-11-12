# Coletor de SLA de laudos (estacao da GSS, Marieta). ASCII puro: o PowerShell 5.1 le .ps1 sem BOM como ANSI.
# Roda como tarefa agendada na sessao do usuario (captura de tela nao funciona pela sessao do SSH).
# Le a fila "Nao lido" do Vue PACS por OCR e manda ao Sigma (edge sla-coletor) SO data, hora e origem de cada linha.
# Nome de paciente fica so na memoria deste processo: nao vai para disco, log nem rede.
# A captura inteira fica em memoria; so o recorte binarizado de uma linha passa pelo disco (o OCR do Windows
# le de arquivo) e e apagado no fim.
$base = "C:\ProgramData\ssh-tunel"
$saida = "$base\captura"
$url = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-coletor"
$versao = "coletor-v2"
$inicio = Get-Date
New-Item -ItemType Directory -Force $saida | Out-Null
function Log($msg) {
  $arq = "$base\coletor.log"
  Add-Content -Path $arq -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $msg)
  $todas = @(Get-Content $arq); if ($todas.Count -gt 2000) { $todas[-1000..-1] | Set-Content $arq }
}
function Enviar($corpo) {
  $chave = (Get-Content "$base\sla_key.txt" -Raw).Trim()
  $json = $corpo | ConvertTo-Json -Depth 5 -Compress
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  try {
    $r = Invoke-RestMethod -Method Post -Uri $url -Headers @{ "x-sla-key" = $chave } -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 30
    "ok novos=$($r.novos) sairam=$($r.sairam)"
  } catch { "falha_envio: $($_.Exception.Message)" }
}
Add-Type -AssemblyName System.Runtime.WindowsRuntime, System.Drawing, System.Windows.Forms
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Collections.Generic;
public static class Grade {
  static int Cls(Color c) {
    if (c.R > 200 && c.G > 90 && c.G < 190 && c.B < 90) return 1;   // laranja = Internado
    if (c.R < 90 && c.G > 140 && c.B > 200) return 2;                // azul = Externo
    if (c.R > 170 && c.G < 90 && c.B < 90) return 3;                 // vermelho = Pronto Socorro
    return 0;
  }
  // Linhas da grade: passo fixo de 25 px a partir da primeira linha colorida; a classe e a cor
  // que mais aparece numa amostra da linha (o texto nao atrapalha). Saida: [y0, classe, R, G, B]
  public static List<int[]> Linhas(Bitmap b, int x0, int w, int y0, int y1, int passo) {
    var r = new List<int[]>(); int y = y0;
    while (y < y1 && Cls(b.GetPixel(x0 + 4, y)) == 0) y++;
    for (; y + passo <= y1; y += passo) {
      var cont = new int[4]; Color ex = Color.White;
      for (int x = x0; x < x0 + w; x += 7) for (int dy = 3; dy < passo - 3; dy += 4) {
        Color c = b.GetPixel(x, y + dy); int k = Cls(c); cont[k]++; if (k > 0) ex = c; }
      int best = 1; for (int k = 2; k < 4; k++) if (cont[k] > cont[best]) best = k;
      if (cont[best] < cont[0] / 2) break;
      r.Add(new int[] { y, best, ex.R, ex.G, ex.B });
    }
    return r;
  }
  // Recorte ampliado e binarizado: as 2 cores mais comuns da linha sao fundo (zebra de colunas);
  // pixel longe das duas vira tinta (preto), o resto branco. Serve para texto escuro ou claro.
  public static int Tinta;
  public static Bitmap Binarizar(Bitmap src, Rectangle rc, int tol, int esc) { return Binarizar(src, rc, tol, esc, 2); }
  public static Bitmap Binarizar(Bitmap src, Rectangle rc, int tol, int esc, int nfundos) {
    var hist = new Dictionary<int, int>();
    for (int y = 0; y < rc.Height; y++) for (int x = 0; x < rc.Width; x++) {
      int k = src.GetPixel(rc.X + x, rc.Y + y).ToArgb(); int v; hist.TryGetValue(k, out v); hist[k] = v + 1; }
    int a = 0, b2 = 0, na = -1, nb = -1;
    foreach (var kv in hist) { if (kv.Value > na) { b2 = a; nb = na; a = kv.Key; na = kv.Value; } else if (kv.Value > nb) { b2 = kv.Key; nb = kv.Value; } }
    if (nfundos < 2) b2 = a;
    Color fa = Color.FromArgb(a), fb = Color.FromArgb(b2); Tinta = 0;
    int pad = nfundos < 2 ? 40 : 0;
    var o = new Bitmap(rc.Width * esc + 2 * pad, rc.Height * esc + 2 * pad);
    using (var g = Graphics.FromImage(o)) g.Clear(Color.White);
    for (int y = 0; y < rc.Height; y++) for (int x = 0; x < rc.Width; x++) {
      Color p = src.GetPixel(rc.X + x, rc.Y + y);
      int da = Math.Abs(p.R - fa.R) + Math.Abs(p.G - fa.G) + Math.Abs(p.B - fa.B);
      int db = Math.Abs(p.R - fb.R) + Math.Abs(p.G - fb.G) + Math.Abs(p.B - fb.B);
      if (Math.Min(da, db) > tol) { Tinta++; } if (Math.Min(da, db) > tol) for (int j = 0; j < esc; j++) for (int i = 0; i < esc; i++) o.SetPixel(pad + x * esc + i, pad + y * esc + j, Color.Black);
    }
    return o;
  }
}
"@
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Esperar($op, $tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait() | Out-Null; $t.Result }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
function Ler($bitmap) {
  $arq = "$saida\linha.png"; $bitmap.Save($arq, [System.Drawing.Imaging.ImageFormat]::Png)
  $f = Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync($arq)) ([Windows.Storage.StorageFile])
  $s = Esperar ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec = Esperar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $sb = Esperar ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Esperar ($engine.RecognizeAsync($sb)) ([Windows.Media.Ocr.OcrResult])
  $s.Dispose()
  # Junta as palavras da esquerda para a direita (o OCR quebra a linha por coluna).
  $ws = New-Object System.Collections.ArrayList
  foreach ($l in $res.Lines) { foreach ($w in $l.Words) { [void]$ws.Add([pscustomobject]@{ x = $w.BoundingRect.X; y = $w.BoundingRect.Y + $w.BoundingRect.Height / 2; t = [string]$w.Text }) } }
  $ord = @($ws | Sort-Object x)
  [pscustomobject]@{ t = (($ord | ForEach-Object { $_.t }) -join ' '); ws = $ord }
}
$reHora = '(?<![\d/])([01]\d|2[0-3])[^\d/]{1,4}([0-5]\d)[^\d/]{1,4}([0-5]\d)(?!\d)'
$nomes = @{ 1 = 'Internado'; 2 = 'Externo'; 3 = 'PS' }

$pacs = Get-Process mp -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pacs) {
  $res = Enviar @{ unidade = "marieta"; lida_em = (Get-Date).ToUniversalTime().ToString("o"); status = "erro"; linhas = @(); detalhe = @{ motivo = "pacs_fechado"; versao = $versao } }
  Log "erro pacs_fechado -> $res"; exit
}
# A lista do Vue PACS NAO atualiza sozinha (testado em 12/11: 30 min parada; 1 clique trouxe 19 exames novos).
# Clica em "Atualizar" (setas verdes da barra, x 340 y 95 nesta tela) antes de ler. So clica se a janela da
# frente for o PACS: com outra janela por cima, o clique cairia em outro programa.
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Jan {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
}
"@
$pidFrente = 0; [void][Jan]::GetWindowThreadProcessId([Jan]::GetForegroundWindow(), [ref]$pidFrente)
$atualizou = $false
if ($pidFrente -eq $pacs.Id) {
  [void][Jan]::SetCursorPos(340, 95); Start-Sleep -Milliseconds 150
  [Jan]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60; [Jan]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  [void][Jan]::SetCursorPos(1900, 1060)   # mouse fora da grade: tooltip por cima atrapalha o OCR
  Start-Sleep -Seconds 4                  # tempo da lista recarregar do servidor
  $atualizou = $true
}
try {
  $vt = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $tela = New-Object System.Drawing.Bitmap $vt.Width, $vt.Height
  $gr = [System.Drawing.Graphics]::FromImage($tela); $gr.CopyFromScreen($vt.Left, $vt.Top, 0, 0, $tela.Size); $gr.Dispose()
} catch {
  # Tela bloqueada ou sessao desconectada: CopyFromScreen falha.
  $res = Enviar @{ unidade = "marieta"; lida_em = (Get-Date).ToUniversalTime().ToString("o"); status = "erro"; linhas = @(); detalhe = @{ motivo = "tela_indisponivel"; versao = $versao } }
  Log "erro tela_indisponivel -> $res"; exit
}
$lidaEm = (Get-Date).ToUniversalTime().ToString("o")
# Grade comeca em x=487, y~245 nesta estacao; varre ate o rodape para pegar lista maior que o recorte antigo.
$gx = 487; $gw = 1425
$faixas = [Grade]::Linhas($tela, $gx, $gw, 236, $tela.Height - 40, 25)
$linhas = New-Object System.Collections.ArrayList
$xsHora = New-Object System.Collections.ArrayList
$n = 0
foreach ($f in $faixas) {
  $n++
  $rc = New-Object System.Drawing.Rectangle $gx, $f[0], $gw, 25
  $data = $null; $hora = ''; $lido = $false; $via = ''; $tents = New-Object System.Collections.ArrayList
  foreach ($tent in @(@(160, 3, 'bin160'), @(110, 3, 'bin110'), @(220, 4, 'bin220'), @(60, 3, 'bin60'), @(250, 3, 'bin250'), @(160, 4, 'bin160x4'), @(110, 2, 'bin110x2'))) {
    $img = [Grade]::Binarizar($tela, $rc, $tent[0], $tent[1])
    $r = Ler $img; $img.Dispose(); $t = $r.t; [void]$tents.Add(@($tent[1], $r.ws))
    $m = [regex]::Match($t, $reHora)
    # Guarda onde a hora apareceu (x na tela) para a 2a passada so na coluna Hora.
    if ($m.Success) { $w = $r.ws | Where-Object { $_.t -match '^([01]\d|2[0-3])[^\d/]{1,4}[0-5]' } | Select-Object -First 1; if ($w) { [void]$xsHora.Add([int]($gx + $w.x / $tent[1])) } }
    if ($t -match 'lido') { $lido = $true }
    if (-not $data) { $md = [regex]::Match($t, '(?<!\d)([0-3]\d)/([01]\d)/(20\d\d)(?!\d)'); if ($md.Success) { $data = $md.Value } }
    if ($m.Success) { $hora = "$($m.Groups[1].Value):$($m.Groups[2].Value):$($m.Groups[3].Value)"; $via = $tent[2]; break }
  }
  [void]$linhas.Add([ordered]@{ n = $n; y = $f[0]; data = $data; origem = $nomes[$f[1]]; hora = $hora; nao_lido = $lido; via = $via; tents = $tents; cor = "$($f[2]),$($f[3]),$($f[4])" })
}
# 2a passada: so as palavras que cairam na coluna Hora (x mediano das horas lidas), com troca das
# letras que o OCR confunde com digito (O->0, l/I/|->1, S->5, B->8, Z->2).
$colHora = $null
if ($xsHora.Count -gt 0) { $o = @($xsHora | Sort-Object); $colHora = $o[[int]($o.Count / 2)] }
if ($colHora) {
  foreach ($l in $linhas) {
    if ($l.hora) { continue }
    $vistos = @()
    foreach ($tt in $l.tents) {
      $esc = $tt[0]
      $txt = (@($tt[1] | Where-Object { ($gx + $_.x / $esc) -ge ($colHora - 15) -and ($gx + $_.x / $esc) -le ($colHora + 70) } | ForEach-Object { $_.t }) -join ' ')
      $vistos += $txt
      $norm = $txt.Replace('O', '0').Replace('o', '0').Replace('l', '1').Replace('I', '1').Replace('|', '1').Replace('S', '5').Replace('B', '8').Replace('Z', '2')
      $m = [regex]::Match($norm, $reHora)
      if ($m.Success) { $l.hora = "$($m.Groups[1].Value):$($m.Groups[2].Value):$($m.Groups[3].Value)"; $l.via = "coluna-normalizada"; break }
    }
    if (-not $l.hora) {
      # Sem segundos legiveis: HH:MM basta para SLA (prazo em minutos). Fica marcado como precisao minuto.
      foreach ($v in $vistos) {
        $norm = $v.Replace('O', '0').Replace('o', '0').Replace('l', '1').Replace('I', '1').Replace('S', '5').Replace('B', '8')
        $m = [regex]::Match($norm, '(?<![\d/])([01]\d|2[0-3])[^\d/]{1,3}([0-5]\d)(?!\d)')
        if ($m.Success) { $l.hora = "$($m.Groups[1].Value):$($m.Groups[2].Value)"; $l.via = 'minuto'; break }
      }
    }
    if (-not $l.hora) { $l.via = 'falhou: ' + ($vistos -join ' / ') }
  }
}
$alturaTela = $tela.Height
$tela.Dispose()
Remove-Item "$saida\linha.png" -ErrorAction SilentlyContinue
# Lista "cheia": a ultima linha encosta no fim da area visivel, pode haver exame abaixo (sem rolagem ainda).
# Nesse caso o Sigma nao marca saida de ninguem nesta leitura.
$cheia = $false
if ($faixas.Count -gt 0) { $ult = $faixas[$faixas.Count - 1][0]; $cheia = ($ult + 25) -ge ($alturaTela - 90) }
$envio = @($linhas | Where-Object { $_.hora } | ForEach-Object { @{ data = $_.data; hora = $_.hora; origem = $_.origem } })
$detalhe = @{
  atualizou = $atualizou; versao = $versao; faixas = $faixas.Count; sem_hora = @($linhas | Where-Object { -not $_.hora }).Count
  precisao_minuto = @($linhas | Where-Object { $_.via -eq 'minuto' }).Count; sem_data = @($linhas | Where-Object { -not $_.data }).Count
  duracao_ms = [int]((Get-Date) - $inicio).TotalMilliseconds
}
$status = if ($faixas.Count -eq 0) { 'sem_grade' } else { 'ok' }
$res = Enviar @{ unidade = "marieta"; lida_em = $lidaEm; status = $status; cheia = $cheia; linhas = $envio; detalhe = $detalhe }
Log "$status atualizou=$atualizou faixas=$($faixas.Count) enviadas=$($envio.Count) sem_hora=$($detalhe.sem_hora) cheia=$cheia $($detalhe.duracao_ms)ms -> $res"
