# Coletor de SLA de laudos (estacao da GSS, Marieta). ASCII puro: o PowerShell 5.1 le .ps1 sem BOM como ANSI.
# Roda como tarefa agendada na sessao do usuario (captura de tela nao funciona pela sessao do SSH).
# Le a fila "Nao lido" do Vue PACS por OCR e manda ao Sigma (edge sla-coletor) SO data, hora e origem de cada linha.
# Nome de paciente fica so na memoria deste processo: nao vai para disco, log nem rede.
# A captura inteira fica em memoria; so o recorte binarizado de uma linha passa pelo disco (o OCR do Windows
# le de arquivo) e e apagado no fim.
$base = "C:\ProgramData\ssh-tunel"
$saida = "$base\captura"
$url = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-coletor"
$versao = "coletor-v6"
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
    int y = y0;
    while (y < y1 && Cls(b.GetPixel(x0 + 4, y)) == 0) y++;
    return LinhasDe(b, x0, w, y, y1, passo);
  }
  // Linhas a partir de um inicio exato (sem procurar a 1a cor): usado para alinhar telas depois de rolar.
  public static List<int[]> LinhasDe(Bitmap b, int x0, int w, int y, int y1, int passo) {
    var r = new List<int[]>();
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
  // Impressao digital de uma linha (pixels): reconhece a mesma linha em telas diferentes ao rolar a lista.
  public static ulong Hash(Bitmap b, int x0, int w, int y) {
    ulong h = 1469598103934665603UL;
    for (int yy = 2; yy < 23; yy++) for (int x = x0; x < x0 + w; x += 2) { h ^= (ulong)(uint)b.GetPixel(x, y + yy).ToArgb(); h *= 1099511628211UL; }
    return h;
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
  // Leitura da hora por modelo de glifo (12/11): o OCR do Windows falha em ~10% das linhas mesmo com a celula nitida.
  // A fonte do PACS e fixa: cada caractere da coluna Hora tem sempre o mesmo desenho. Os modelos saem das linhas
  // que o OCR leu certo (hora conhecida) e servem para ler as que falharam.
  // Glifos: colunas com tinta separadas por coluna vazia; tinta = longe da cor dominante da celula.
  public static List<bool[,]> Glifos(Bitmap src, Rectangle rc, int tol) {
    var hist = new Dictionary<int, int>();
    for (int y = 0; y < rc.Height; y++) for (int x = 0; x < rc.Width; x++) { int k = src.GetPixel(rc.X + x, rc.Y + y).ToArgb(); int v; hist.TryGetValue(k, out v); hist[k] = v + 1; }
    int a = 0, na = -1; foreach (var kv in hist) if (kv.Value > na) { a = kv.Key; na = kv.Value; }
    Color f = Color.FromArgb(a);
    var tinta = new bool[rc.Width, rc.Height];
    for (int y = 0; y < rc.Height; y++) for (int x = 0; x < rc.Width; x++) {
      Color p = src.GetPixel(rc.X + x, rc.Y + y);
      tinta[x, y] = Math.Abs(p.R - f.R) + Math.Abs(p.G - f.G) + Math.Abs(p.B - f.B) > tol;
    }
    var r = new List<bool[,]>(); int ini = -1;
    for (int x = 0; x <= rc.Width; x++) {
      bool col = false;
      if (x < rc.Width) for (int y = 0; y < rc.Height; y++) if (tinta[x, y]) { col = true; break; }
      if (col && ini < 0) ini = x;
      if (!col && ini >= 0) {
        var g = new bool[x - ini, rc.Height];
        for (int gx = 0; gx < x - ini; gx++) for (int y = 0; y < rc.Height; y++) g[gx, y] = tinta[ini + gx, y];
        r.Add(g); ini = -1;
      }
    }
    return r;
  }
  // Diferenca entre dois glifos (pixels diferentes, alinhados a esquerda e ao topo; largura diferente custa caro).
  public static int Dist(bool[,] a, bool[,] b) {
    int w = Math.Max(a.GetLength(0), b.GetLength(0)), h = Math.Max(a.GetLength(1), b.GetLength(1)), d = 0;
    for (int x = 0; x < w; x++) for (int y = 0; y < h; y++) {
      bool pa = x < a.GetLength(0) && y < a.GetLength(1) && a[x, y];
      bool pb = x < b.GetLength(0) && y < b.GetLength(1) && b[x, y];
      if (pa != pb) d++;
    }
    return d + 6 * Math.Abs(a.GetLength(0) - b.GetLength(0));
  }
  public static Dictionary<char, List<bool[,]>> Modelos = new Dictionary<char, List<bool[,]>>();
  public static void Aprender(Bitmap src, Rectangle rc, string hora) {
    var gs = Glifos(src, rc, 160);
    if (gs.Count < hora.Length) return;
    for (int i = 0; i < hora.Length; i++) {
      char c = hora[i];
      if (!Modelos.ContainsKey(c)) Modelos[c] = new List<bool[,]>();
      if (Modelos[c].Count < 6) Modelos[c].Add(gs[i]);
    }
  }
  // Le "HH:MM:SS" pelos modelos; null se faltar modelo ou algum glifo ficar longe demais de todos.
  public static string Ler(Bitmap src, Rectangle rc) {
    var gs = Glifos(src, rc, 160);
    if (gs.Count < 8) return null;
    var sb = new System.Text.StringBuilder();
    for (int i = 0; i < 8; i++) {
      char melhor = '?'; int md = int.MaxValue;
      foreach (var kv in Modelos) foreach (var m in kv.Value) { int d = Dist(gs[i], m); if (d < md) { md = d; melhor = kv.Key; } }
      if (md > 12) return null;
      sb.Append(melhor);
    }
    return sb.ToString();
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
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
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
function Capturar {
  $vt = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bm = New-Object System.Drawing.Bitmap $vt.Width, $vt.Height
  $gr = [System.Drawing.Graphics]::FromImage($bm); $gr.CopyFromScreen($vt.Left, $vt.Top, 0, 0, $bm.Size); $gr.Dispose()
  $bm
}
function Roda($cliques) {
  # Roda do mouse sobre a grade; depois tira o mouse de cima (tooltip atrapalha) e espera redesenhar.
  [void][Jan]::SetCursorPos(1200, 600); Start-Sleep -Milliseconds 100
  [Jan]::mouse_event(0x0800, 0, 0, (-120 * $cliques), [UIntPtr]::Zero); Start-Sleep -Milliseconds 120
  [void][Jan]::SetCursorPos(1900, 1060); Start-Sleep -Milliseconds 700
}
try { $tela = Capturar } catch {
  # Tela bloqueada ou sessao desconectada: CopyFromScreen falha.
  $res = Enviar @{ unidade = "marieta"; lida_em = (Get-Date).ToUniversalTime().ToString("o"); status = "erro"; linhas = @(); detalhe = @{ motivo = "tela_indisponivel"; versao = $versao } }
  Log "erro tela_indisponivel -> $res"; exit
}
$lidaEm = (Get-Date).ToUniversalTime().ToString("o")
$gx = 487; $gw = 1425
$alturaTela = $tela.Height
# Inicio da grade: 1a linha colorida (y 247 nesta tela). Fica fixo para todas as paginas: rolar desloca a lista
# por linhas inteiras, e com o inicio fixo a mesma linha da o mesmo hash nas duas telas.
$faixas = [Grade]::Linhas($tela, $gx, $gw, 236, $alturaTela - 40, 25)
$y0 = if ($faixas.Count -gt 0) { $faixas[0][0] } else { 0 }
# Hash so da parte esquerda da linha (Data, Nome, Hora, Tipo; x 487-1087): avisos do Windows (OneDrive) cobrem a
# direita da grade em posicoes fixas da tela e faziam a mesma linha ter hash diferente em telas diferentes.
function Pagina($bm, $ini = $y0) {
  $fs = [Grade]::LinhasDe($bm, $gx, $gw, $ini, $alturaTela - 40, 25)
  @($fs | ForEach-Object { [pscustomobject]@{ f = $_; h = [Grade]::Hash($bm, $gx, 600, $_[0]); bm = $bm } })
}
function Cheia($pg) { $pg.Count -gt 0 -and ($pg[$pg.Count - 1].f[0] + 25) -ge ($alturaTela - 90) }

# Le a lista inteira: rola 1 clique por vez (11 linhas nesta tela) e junta as paginas pela sobreposicao dos hashes.
$telas = New-Object System.Collections.ArrayList; [void]$telas.Add($tela)
$acum = New-Object System.Collections.ArrayList
# A ultima linha de uma tela cheia pode estar cortada pela borda da grade (hash diferente da mesma linha
# inteira na tela seguinte): ela fica de fora da juncao e so entra quando aparecer inteira.
function SemUltima($p) { if ($p.Count -le 1) { @() } else { @($p[0..($p.Count - 2)]) } }
$pg = @(); if ($y0) { $pg = Pagina $tela }
$cheia = Cheia $pg
if ($cheia -and $atualizou) { foreach ($x in (SemUltima $pg)) { [void]$acum.Add($x) } } else { foreach ($x in $pg) { [void]$acum.Add($x) } }
$paginas = 1; $rolou = 0; $quebrou = $false
if ($cheia -and $atualizou) {
  # 3 cliques = 9 linhas por passo (sobrepoe ~20 das ~29 visiveis). Com 1 clique e limite de 15 telas, a fila de
  # 64 exames (12/11 a tarde) nao chegava ao fim e nenhuma saida era registrada.
  while ($paginas -lt 40) {
    Roda 3; $rolou++
    $nova = Capturar; [void]$telas.Add($nova); $pn = Pagina $nova
    $pc = SemUltima $pn
    # Deslocamento por votacao: cada linha da tela nova que ja foi vista vota em (posicao antiga - posicao nova).
    # 1 clique = 3 linhas nesta tela; o passo e de 3 cliques.
    # Algumas linhas mudam de aparencia entre uma captura e outra (realce, redesenho), entao nao se exige
    # igualdade total: vale o deslocamento mais votado, com pelo menos 5 votos. 1 clique = 3 linhas nesta tela.
    function Votar($lista) {
      $v = @{}
      for ($i = 0; $i -lt $lista.Count; $i++) {
        for ($j = 0; $j -lt $acum.Count; $j++) { if ($acum[$j].h -eq $lista[$i].h) { $d = $j - $i; $v[$d] = 1 + [int]$v[$d]; break } }
      }
      $v
    }
    $votos = Votar $pc
    $desloc = $null; $mv = 0
    foreach ($d in $votos.Keys) { if ($votos[$d] -gt $mv) { $mv = $votos[$d]; $desloc = $d } }
    if ($mv -lt 5) {
      # No fim da lista a grade encosta a ultima linha na borda de baixo e sai do passo de 25 px a partir de y0:
      # procura o deslocamento vertical (1-24 px) que realinha as linhas.
      for ($dy = 1; $dy -lt 25; $dy++) {
        $pt = Pagina $nova ($y0 + $dy); $ptc = SemUltima $pt; $vt2 = Votar $ptc
        foreach ($d in $vt2.Keys) { if ($vt2[$d] -gt $mv) { $mv = $vt2[$d]; $desloc = $d; $pn = $pt; $pc = $ptc; $votos = $vt2 } }
        if ($mv -ge 5) { break }
      }
    }
    if ($null -eq $desloc -or $mv -lt 5) { $diag = (0..24 | ForEach-Object { $pt = Pagina $nova ($y0 + $_); $mm = 0; foreach ($q in $pt) { foreach ($a2 in $acum) { if ($a2.h -eq $q.h) { $mm++; break } } }; "$($_):$($pt.Count):$mm" }) -join " "; $pgIg = 0; foreach ($q in $pn) { foreach ($a2 in $pg) { if ($a2.h -eq $q.h) { $pgIg++; break } } }; $cores = (247, 260, 272, 285, 297, 600, 900, 990, 1000, 1010 | ForEach-Object { $c = $nova.GetPixel(491, $_); "$($_)=$($c.R),$($c.G),$($c.B)" }) -join " "; Log "debug pagina=$paginas diag=$diag pn_vs_pg=$pgIg cores=$cores"; Log "debug sem_juncao votos=$(($votos.GetEnumerator() | ForEach-Object { "$($_.Key):$($_.Value)" }) -join ',')"; $quebrou = $true; break }
    $k = $acum.Count - $desloc   # linhas da tela nova que ja estao no acumulado
    if ($k -ge $pc.Count) { [void]$acum.Add($pn[$pn.Count - 1]); $cheia = $false; break }   # nao andou: fim da lista
    for ($i = $k; $i -lt $pc.Count; $i++) { [void]$acum.Add($pc[$i]) }
    $pg = $pn; $paginas++
  }
  Roda (-60)   # volta ao topo para a proxima leitura e para quem olhar a tela
}

$linhas = New-Object System.Collections.ArrayList
$xsHora = New-Object System.Collections.ArrayList
$n = 0
foreach ($item in $acum) {
  $n++; $f = $item.f; $tela = $item.bm
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
  [void]$linhas.Add([ordered]@{ n = $n; bm = $tela; y = $f[0]; data = $data; origem = $nomes[$f[1]]; hora = $hora; nao_lido = $lido; via = $via; tents = $tents; cor = "$($f[2]),$($f[3]),$($f[4])" })
}
# 2a passada: so as palavras que cairam na coluna Hora (x mediano das horas lidas), com troca das
# letras que o OCR confunde com digito (O->0, l/I/|->1, S->5, B->8, Z->2).
$colHora = $null
if ($xsHora.Count -gt 0) { $o = @($xsHora | Sort-Object); $colHora = $o[[int]($o.Count / 2)] }
if ($colHora) {
  # Modelos de glifo a partir das horas lidas com segundos (ver Grade.Aprender).
  foreach ($l in $linhas) {
    if ($l.hora -and $l.hora.Length -eq 8 -and $l.via -like 'bin*') {
      try { [Grade]::Aprender($l.bm, (New-Object System.Drawing.Rectangle ($colHora - 10), $l.y, 72, 25), $l.hora) } catch {}
    }
  }
  foreach ($l in $linhas) {
    if ($l.hora) { continue }
    # 1o: leitura por modelo de glifo (a celula esta nitida; quem falha e o OCR)
    try { $hm = [Grade]::Ler($l.bm, (New-Object System.Drawing.Rectangle ($colHora - 10), $l.y, 72, 25)) } catch { $hm = $null }
    if ($hm -and $hm -match '^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$') { $l.hora = $hm; $l.via = 'modelo'; continue }
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
    if (-not $l.hora) {
      $l.via = 'falhou: ' + ($vistos -join ' / ')
      # Diagnostico (12/11): guarda SO a celula da coluna Hora (sem nome de paciente) das linhas que falharam.
      if (Test-Path "$base\diag_hora.on") {
        try { $cel = $l.bm.Clone((New-Object System.Drawing.Rectangle ($colHora - 10), $l.y, 90, 25), $l.bm.PixelFormat); $cel.Save("$saida\falha_$($l.n).png"); $cel.Dispose() } catch {}
      }
    }
  }
}
foreach ($bm in $telas) { $bm.Dispose() }
Remove-Item "$saida\linha.png" -ErrorAction SilentlyContinue
$envio = @($linhas | Where-Object { $_.hora } | ForEach-Object { @{ data = $_.data; hora = $_.hora; origem = $_.origem } })
$detalhe = @{
  atualizou = $atualizou; versao = $versao; faixas = $acum.Count; paginas = $paginas; quebrou = $quebrou; sem_hora = @($linhas | Where-Object { -not $_.hora }).Count
  por_modelo = @($linhas | Where-Object { $_.via -eq 'modelo' }).Count
  precisao_minuto = @($linhas | Where-Object { $_.via -eq 'minuto' }).Count; sem_data = @($linhas | Where-Object { -not $_.data }).Count
  duracao_ms = [int]((Get-Date) - $inicio).TotalMilliseconds
}
$status = if ($acum.Count -eq 0) { 'sem_grade' } else { 'ok' }
# Lista vazia: testa o servidor do PACS (pela VPN). Em 12/11 a VPN do Sophos caiu a tarde e a grade ficou vazia;
# o motivo exato vai no alerta. TcpClient com 3 s (Test-NetConnection demora ~20 s quando falha).
if ($status -eq 'sem_grade') {
  $vpnOk = $false
  try { $tc = New-Object System.Net.Sockets.TcpClient; $vpnOk = $tc.ConnectAsync("192.168.0.90", 2104).Wait(3000) -and $tc.Connected; $tc.Close() } catch { $vpnOk = $false }
  $detalhe.motivo = if ($vpnOk) { 'lista_vazia' } else { 'vpn_desconectada' }
}
$res = Enviar @{ unidade = "marieta"; lida_em = $lidaEm; status = $status; cheia = $cheia; linhas = $envio; detalhe = $detalhe }
Log "$status $($detalhe.motivo) atualizou=$atualizou paginas=$paginas quebrou=$quebrou faixas=$($acum.Count) enviadas=$($envio.Count) sem_hora=$($detalhe.sem_hora) cheia=$cheia $($detalhe.duracao_ms)ms -> $res"
