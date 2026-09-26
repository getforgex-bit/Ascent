# =========================================================================
# run_all.ps1 — Arnés completo de pruebas de FORGEX DOOM Orbital (Plan E3)
# =========================================================================
# Ejecuta la suite de pruebas completa en Windows PowerShell, mide tiempos,
# reporta una tabla resumen con estados (PASS / FAIL / SKIP) y sale con 0 o 1.
# Opciones:
#   .\run_all.ps1 -Full : Incluye el benchmark ab_gpu.js (10s CPU vs 10s GPU).

param (
    [switch]$Full,
    [switch]$Ab
)

$ErrorActionPreference = "Continue"
$runAb = $Full -or $Ab

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "        FORGEX DOOM ORBITAL — SUITE COMPLETA DE TESTS            " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Directorio de trabajo: $(Get-Location)"
Write-Host "Fecha y hora: $(Get-Date)"
Write-Host "Modo completo (-Full / -Ab): $runAb"
Write-Host ""

Write-Host "== Verificando compilación y ensamblado de bundles ==" -ForegroundColor Yellow
python forgex/build.py
if (Test-Path "dist/forgex-doom-orbital.html") {
    Copy-Item dist/forgex-doom-orbital.html "..\FORGEX DOOM Orbital.html" -Force -ErrorAction SilentlyContinue
}
Write-Host ""

$tests = @(
    @{ Name = "rust_unit"; Command = "node pruebas/rust_unit.js" },
    @{ Name = "e1_config"; Command = "node pruebas/e1_config.js" },
    @{ Name = "e2_overlay"; Command = "node pruebas/e2_overlay.js" },
    @{ Name = "parity"; Command = "node pruebas/parity.js" },
    @{ Name = "strips (SIMD)"; Command = "node pruebas/strips.js rust-gfx/forgex_gfx.wasm" },
    @{ Name = "strips (Scalar)"; Command = "node pruebas/strips.js rust-gfx/forgex_gfx_scalar.wasm" },
    @{ Name = "wasmfeat (MVP)"; Command = "python pruebas/wasmfeat.py rust-gfx/forgex_gfx_scalar.wasm" },
    @{ Name = "modules_layout"; Command = "node pruebas/modules_layout.js" },
    @{ Name = "zero_alloc"; Command = "node pruebas/zero_alloc.js" },
    @{ Name = "mem_counters"; Command = "node pruebas/mem_counters.js" },
    @{ Name = "chunk_test"; Command = "node pruebas/chunk_test.js" },
    @{ Name = "streaming_test"; Command = "node pruebas/streaming_test.js" },
    @{ Name = "c1_physics"; Command = "node pruebas/c1_physics.js" },
    @{ Name = "c2_simd"; Command = "node pruebas/c2_simd.js" },
    @{ Name = "sim_replay"; Command = "node pruebas/sim_replay.js" },
    @{ Name = "parity_sim"; Command = "node pruebas/parity_sim.js" },
    @{ Name = "t_cfg"; Command = "node pruebas/t_cfg.js" },
    @{ Name = "t_workers"; Command = "node pruebas/t_workers.js" },
    @{ Name = "regression_gameplay"; Command = "node pruebas/regression_gameplay.js" },
    @{ Name = "chunks"; Command = "node pruebas/chunks.js" },
    @{ Name = "parity_gpu"; Command = "node pruebas/parity_gpu.js" }
)

if ($runAb) {
    $tests += @{ Name = "ab_gpu"; Command = "node pruebas/ab_gpu.js" }
}

$results = @()
$totalPass = 0
$totalFail = 0
$totalSkip = 0
$suiteStart = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($t in $tests) {
    Write-Host "-----------------------------------------------------------------"
    Write-Host ">>> [EJECUTANDO] $($t.Name)" -ForegroundColor Yellow
    Write-Host "    Comando: $($t.Command)"
    Write-Host "-----------------------------------------------------------------"

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $output = Invoke-Expression $t.Command 2>&1
    $sw.Stop()
    $exitCode = $LASTEXITCODE
    $elapsedSec = "{0:N1}s" -f ($sw.ElapsedMilliseconds / 1000)

    $outputStr = ($output | Out-String)
    Write-Host $outputStr

    $status = "PASS"
    if ($exitCode -ne 0) {
        $status = "FAIL"
        $totalFail++
        Write-Host ">>> [RESULTADO] ✗ $($t.Name) FALLÓ (código $exitCode) en $elapsedSec" -ForegroundColor Red
    } elseif ($outputStr -match "\[SKIP\]") {
        $status = "SKIP"
        $totalSkip++
        Write-Host ">>> [RESULTADO] ⚠ $($t.Name) OMITIDO (SKIP) en $elapsedSec" -ForegroundColor DarkYellow
    } else {
        $totalPass++
        Write-Host ">>> [RESULTADO] ✓ $($t.Name) PASÓ en $elapsedSec" -ForegroundColor Green
    }
    Write-Host ""

    $results += [PSCustomObject]@{
        Test = $t.Name
        Estado = $status
        Tiempo = $elapsedSec
    }
}

$suiteStart.Stop()
$totalSec = [Math]::Round($suiteStart.ElapsedMilliseconds / 1000)

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "                       RESUMEN DE RESULTADOS                     " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
$results | Format-Table -AutoSize | Out-String | Write-Host
Write-Host "-----------------------------------------------------------------"
Write-Host "Total: $totalPass PASS, $totalFail FAIL, $totalSkip SKIP  (${totalSec}s total)"
Write-Host "=================================================================" -ForegroundColor Cyan

if ($totalFail -gt 0) {
    Write-Host "ALERTA: La suite finalizó con errores ($totalFail tests fallidos)." -ForegroundColor Red
    exit 1
} else {
    Write-Host "ÉXITO: Todos los tests pasaron o se omitieron satisfactoriamente." -ForegroundColor Green
    exit 0
}
