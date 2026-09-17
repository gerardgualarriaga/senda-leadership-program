# Servidor local minimo para las herramientas del proyecto (no se publica).
# Sirve la carpeta del proyecto y acepta POST /save/img/<archivo> para escribir en img/.
$root = Split-Path $PSScriptRoot -Parent
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8767/')
$listener.Start()
Write-Output "Sirviendo $root en http://localhost:8767/"
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.webp'='image/webp'; '.svg'='image/svg+xml'; '.woff2'='font/woff2'; '.pdf'='application/pdf'; '.md'='text/plain; charset=utf-8' }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  $res.Headers.Add('Cache-Control', 'no-store')
  try {
    $name = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ($req.HttpMethod -eq 'POST' -and $name -like 'save/img/*') {
      $rel = $name.Substring(5)
      if ($rel -match '\.\.' -or $rel -notmatch '^img/[\w.-]+$') { throw 'ruta no permitida' }
      $dest = Join-Path $root ($rel.Replace('/', '\'))
      $fs = [IO.File]::Create($dest); $req.InputStream.CopyTo($fs); $fs.Close()
      $b = [Text.Encoding]::UTF8.GetBytes('ok'); $res.OutputStream.Write($b, 0, $b.Length)
    } else {
      if ($name -eq '' ) { $name = 'index.html' }
      $path = Join-Path $root ($name.Replace('/', '\'))
      if (Test-Path -LiteralPath $path -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($path).ToLower()
        if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] }
        $bytes = [IO.File]::ReadAllBytes($path)
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404 }
    }
  } catch { $res.StatusCode = 500 }
  $res.Close()
}

