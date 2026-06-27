# Build the AlphaForge native engine with g++ (no cmake / pybind11 required).
# Produces native/bin/alphaforge_engine(.exe). Statically links the C++ runtime
# so the binary is self-contained and the Python layer can spawn it directly.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $root "src\alphaforge_engine.cpp"
$bin  = Join-Path $root "bin"
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$out  = Join-Path $bin "alphaforge_engine.exe"

$gpp = (Get-Command g++ -ErrorAction SilentlyContinue)
if (-not $gpp) {
    Write-Host "g++ not found on PATH. The Python layer will fall back to NumPy." -ForegroundColor Yellow
    exit 1
}

Write-Host "Compiling native engine -> $out"
& g++ -O2 -std=c++14 -static -s -o $out $src
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }
Write-Host "Built $out" -ForegroundColor Green

# Smoke test
"PING" | & $out | ForEach-Object {
    if ($_ -eq "OK pong") { Write-Host "Smoke test passed (PING -> OK pong)" -ForegroundColor Green }
    else { Write-Host "Unexpected smoke-test output: $_" -ForegroundColor Yellow }
}
