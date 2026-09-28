#!/usr/bin/env bash
# =========================================================================
# run_all.sh — Arnés completo de pruebas de FORGEX DOOM Orbital (Plan E3)
# =========================================================================
# Ejecuta la suite de pruebas completa en orden estricto, mide tiempos,
# reporta una tabla resumen con estados (PASS / FAIL / SKIP) y sale con 0 o 1.
# Opciones:
#   --full o --ab : Incluye el benchmark pesado ab_gpu.js (10s CPU vs 10s GPU).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RUN_AB=false
for arg in "$@"; do
  if [ "$arg" = "--full" ] || [ "$arg" = "--ab" ]; then
    RUN_AB=true
  fi
done

PYTHON_CMD="python3"
if ! command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python"
fi

echo "================================================================="
echo "        FORGEX DOOM ORBITAL — SUITE COMPLETA DE TESTS            "
echo "================================================================="
echo "Directorio de trabajo: $(pwd)"
echo "Fecha y hora: $(date)"
echo "Modo completo (--full / --ab): $RUN_AB"
echo ""

echo "== Verificando compilación y ensamblado de bundles =="
(cd forgex && $PYTHON_CMD build.py)
if [ -f "dist/forgex-doom-orbital.html" ]; then
  cp dist/forgex-doom-orbital.html "FORGEX DOOM Orbital.html" 2>/dev/null || cp dist/forgex-doom-orbital.html "../FORGEX DOOM Orbital.html" 2>/dev/null || true
fi
echo ""

# Arrays para el reporte final
TEST_NAMES=()
TEST_STATUS=()
TEST_TIMES=()

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
SUITE_START=$(date +%s)

run_test() {
  local name="$1"
  local cmd="$2"

  echo "-----------------------------------------------------------------"
  echo ">>> [EJECUTANDO] $name"
  echo "    Comando: $cmd"
  echo "-----------------------------------------------------------------"

  local t0
  t0=$(node -e "process.stdout.write(String(Date.now()))")

  local tmp_out
  tmp_out=$(mktemp)

  # Ejecutar comando capturando stdout/stderr
  set +e
  eval "$cmd" > >(tee "$tmp_out") 2>&1
  local exit_code=$?
  set -e

  local t1
  t1=$(node -e "process.stdout.write(String(Date.now()))")
  local elapsed_ms=$((t1 - t0))
  local elapsed_sec=$(awk "BEGIN {printf \"%.1fs\", $elapsed_ms / 1000}")

  local status="PASS"
  if [ $exit_code -ne 0 ]; then
    status="FAIL"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    echo ">>> [RESULTADO] ✗ $name FALLÓ (código $exit_code) en $elapsed_sec"
  elif grep -q "\[SKIP\]" "$tmp_out"; then
    status="SKIP"
    TOTAL_SKIP=$((TOTAL_SKIP + 1))
    echo ">>> [RESULTADO] ⚠ $name OMITIDO (SKIP) en $elapsed_sec"
  else
    TOTAL_PASS=$((TOTAL_PASS + 1))
    echo ">>> [RESULTADO] ✓ $name PASÓ en $elapsed_sec"
  fi

  rm -f "$tmp_out"
  echo ""

  TEST_NAMES+=("$name")
  TEST_STATUS+=("$status")
  TEST_TIMES+=("$elapsed_sec")
}

# 1. Pruebas unitarias de Rust (Node WASM runner)
run_test "rust_unit" "node pruebas/rust_unit.js"

# 2. Configuración central y profiling (E1)
run_test "e1_config" "node pruebas/e1_config.js"

# 3. Overlay extendido y panel de rendimiento (E2)
run_test "e2_overlay" "node pruebas/e2_overlay.js"

# 4. Paridad SIMD vs Escalar CPU (144 casos)
run_test "parity" "node pruebas/parity.js"

# 5. Renderizado por franjas CPU (SIMD)
run_test "strips (SIMD)" "node pruebas/strips.js rust-gfx/forgex_gfx.wasm"

# 6. Renderizado por franjas CPU (Escalar)
run_test "strips (Scalar)" "node pruebas/strips.js rust-gfx/forgex_gfx_scalar.wasm"

# 7. Verificación MVP de bytecode WASM
run_test "wasmfeat (MVP)" "$PYTHON_CMD pruebas/wasmfeat.py rust-gfx/forgex_gfx_scalar.wasm"

# 8. Mapeo de módulos y layout SoA
run_test "modules_layout" "node pruebas/modules_layout.js"

# 9. Cero allocs en caliente durante 600 frames
run_test "zero_alloc" "node pruebas/zero_alloc.js"

# 10. Contadores y telemetría de memoria
run_test "mem_counters" "node pruebas/mem_counters.js"

# 11. Estructura y estados de chunks
run_test "chunk_test" "node pruebas/chunk_test.js"

# 12. Streaming espacial de chunks
run_test "streaming_test" "node pruebas/streaming_test.js"

# 13. Física de movimiento y colisiones (C1)
run_test "c1_physics" "node pruebas/c1_physics.js"

# 14. Aritmética vectorial SIMD (C2)
run_test "c2_simd" "node pruebas/c2_simd.js"

# 15. Reproducibilidad y replay determinista (C3)
run_test "sim_replay" "node pruebas/sim_replay.js"

# 16. Paridad SIMD en simulación integral (C3)
run_test "parity_sim" "node pruebas/parity_sim.js"

# 17. Interacción con panel de opciones y extensiones E3.6
run_test "t_cfg" "node pruebas/t_cfg.js"

# 18. Escalado multitarea con Web Workers
run_test "t_workers" "node pruebas/t_workers.js"

# 19. Regresión de 6 escenarios críticos de gameplay (E3.2)
run_test "regression_gameplay" "node pruebas/regression_gameplay.js"

# 19b. Sistema de chunks: índice, streaming, imagen idéntica y réplicas de los hilos
run_test "chunks" "node pruebas/chunks.js"

# 19c. Director de Ritmo y acechador
run_test "ritmo" "node pruebas/ritmo.js"

# 20. Paridad GPU vs CPU (WebGPU, modos RT 0..3)
run_test "parity_gpu" "node pruebas/parity_gpu.js"

# 21. Benchmark A/B opcional (--full / --ab)
if [ "$RUN_AB" = true ]; then
  run_test "ab_gpu" "node pruebas/ab_gpu.js"
fi

SUITE_END=$(date +%s)
TOTAL_TIME=$((SUITE_END - SUITE_START))

# Tabla resumen
echo "================================================================="
echo "                       RESUMEN DE RESULTADOS                     "
echo "================================================================="
printf "%-32s %-10s %s\n" "Test" "Estado" "Tiempo"
echo "-----------------------------------------------------------------"

for i in "${!TEST_NAMES[@]}"; do
  printf "%-32s %-10s %s\n" "${TEST_NAMES[$i]}" "${TEST_STATUS[$i]}" "${TEST_TIMES[$i]}"
done

echo "-----------------------------------------------------------------"
echo "Total: ${TOTAL_PASS} PASS, ${TOTAL_FAIL} FAIL, ${TOTAL_SKIP} SKIP  (${TOTAL_TIME}s total)"
echo "================================================================="

if [ "$TOTAL_FAIL" -gt 0 ]; then
  echo "ALERTA: La suite finalizó con errores ($TOTAL_FAIL tests fallidos)."
  exit 1
else
  echo "ÉXITO: Todos los tests pasaron o se omitieron satisfactoriamente."
  exit 0
fi
