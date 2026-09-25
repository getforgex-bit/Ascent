# Suite de Pruebas y Arnés de Verificación — FORGEX DOOM Orbital

Este directorio contiene el conjunto completo de pruebas automatizadas, arneses de paridad, pruebas de regresión de gameplay y benchmarks de rendimiento para el motor de **FORGEX DOOM Orbital**.

---

## 1. Ejecución Rápida de la Suite Completa

Para ejecutar todas las pruebas en orden de manera secuencial con reporte de tiempos y resumen:

```bash
# Desde la raíz del proyecto o desde el directorio pruebas/
./run_all.sh
```

El script `run_all.sh` retornará código de salida `0` si todas las pruebas pasan o se omiten justificadamente (por ejemplo, si no hay WebGPU disponible en CI sin gráfica), y código `1` si alguna prueba falla.

---

## 2. Catálogo de Pruebas

### 2.1 `rust_unit.js` — Pruebas Unitarias de Rust
- **Qué verifica:** Compilación e integridad algorítmica de módulos internos de Rust (como `pool.rs` y `ecs.rs`), asegurando que las estructuras de datos orientadas (SoA) y piscinas de memoria fija operen sin fugas.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/rust_unit.js
  ```
- **Qué hacer si falla:** Verificar que el compilador `rustc` esté instalado y accesible en el PATH o en `~/.cargo/bin/rustc`. Revisar desbordamientos de capacidad estática en las estructuras probadas.

### 2.2 `e1_config.js` — Sincronización de Configuración y Profiling
- **Qué verifica:** Conformidad estricta C-ABI entre `GraphicsConfig` / `PerformanceConfig` en Rust (`config.rs`) y JavaScript (`001-config.js`), validando tamaños de estructura, alineaciones y offsets de cada campo. También comprueba las macros de telemetría de `prof.rs`.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/e1_config.js
  ```
- **Qué hacer si falla:** Comprobar que ningún campo de `GraphicsConfig` (128 bytes) o `PerformanceConfig` (48 bytes) haya sido modificado sin actualizar simultáneamente el mapa de offsets en `001-config.js`.

### 2.3 `e2_overlay.js` — Panel de Depuración y Rendimiento (8 Líneas)
- **Qué verifica:** Arranca el juego en Chromium (Playwright), activa `cfg.debug.overlay = true`, espera el refresco a `statsHz`, captura la pantalla completa en `salida/e2_overlay.png` y verifica que existan exactamente 8 líneas de telemetría y que la línea 3 contenga las 7 métricas de profiling de CPU Rust.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/e2_overlay.js
  ```
- **Qué hacer si falla:** Comprobar que `dist/forgex-doom-orbital.html` haya sido compilado con `python forgex/build.py` y que `095-rendimiento.js` esté formateando las 8 líneas en `PERF.lines`.

### 2.4 `parity.js` — Paridad SIMD vs Escalar (CPU)
- **Qué verifica:** 144 combinaciones representativas de cámaras, modos de iluminación y trazado de rayos entre `forgex_gfx.wasm` (SIMD128) y `forgex_gfx_scalar.wasm` (WebAssembly 1.0 MVP), garantizando identidad bit a bit en los píxeles de salida.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/parity.js
  ```
- **Qué hacer si falla:** Verificar la emulación lane a lane en `scalar4.rs` contra los intrinsics SIMD correspondientes en `render_cpu.rs`.

### 2.5 `strips.js` — Paridad de Renderizado por Franjas
- **Qué verifica:** Asegura que dividir el búfer de render en múltiples franjas verticales para trabajadores multihilo (`Web Workers`) produzca un resultado idéntico pixel por pixel al renderizado monohilo completo.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/strips.js rust-gfx/forgex_gfx.wasm
  node pruebas/strips.js rust-gfx/forgex_gfx_scalar.wasm
  ```
- **Qué hacer si falla:** Comprobar los límites de franjas `[cx0, cx1)` y el manejo de bordes/oclusiones en `render_cpu.rs`.

### 2.6 `parity_sim.js` — Paridad de Simulación Integral (SIMD vs Escalar)
- **Qué verifica:** Ejecuta 3600 pasos continuos (1 minuto a 60 Hz) de física, IA de enemigos (imps, skulls, cacos), proyectiles y colisiones en ambas variantes de WASM, comparando el hash FNV-1a de estado (`sim_hash()`) cada 30 pasos (120 checkpoints).
- **Cómo ejecutarla:**
  ```bash
  node pruebas/parity_sim.js
  ```
- **Qué hacer si falla:** Revisar precisión de operaciones trigonométricas (`sinf`, `cosf`) y normalizaciones de vectores en `simd_ops.rs` vs `scalar_simd.rs`.

### 2.7 `sim_replay.js` — Determinismo y Replicabilidad (JS vs Rust)
- **Qué verifica:** 3600 pasos deterministas con entradas fijas comparando la simulación en JavaScript frente a la simulación en Rust con punto flotante unificado (`Math.fround`).
- **Cómo ejecutarla:**
  ```bash
  node pruebas/sim_replay.js
  ```
- **Qué hacer si falla:** Verificar que las funciones auxiliares de JS en `075-fisica-del-jugador.js` mantengan coerción `Math.fround` en cada paso intermedio.

### 2.8 `zero_alloc.js` — Cero Allocs en Caliente
- **Qué verifica:** Ejecuta 600 fotogramas continuos de renderizado en caliente en el motor Rust y valida que `wasm_alloc_count() == 0`, garantizando ausencia de pausas por recolección de basura o fragmentación del montículo.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/zero_alloc.js
  ```
- **Qué hacer si falla:** Inspeccionar el código de la ruta caliente en `render_cpu.rs` para eliminar asignaciones dinámicas accidentales (`Vec::new`, `Box`, `format!`, etc.).

### 2.9 `mem_counters.js` — Telemetría de Memoria
- **Qué verifica:** Constancia estricta de la memoria estática (~61 MB) mediante `wasm_bytes_static()` y seguimiento dinámico preciso de bloques añadidos y podados mediante `wasm_bytes_live()`.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/mem_counters.js
  ```
- **Qué hacer si falla:** Revisar los contadores en `prof_hooks.rs` y el ciclo de vida de `w_add` / `w_prune` en `world.rs`.

### 2.10 `parity_gpu.js` — Paridad WebGPU vs CPU
- **Qué verifica:** Compara el renderizado de la GPU contra el renderizado de referencia en CPU a lo largo de 8 cámaras, evaluando métricas PSNR (≥ 35 dB en RT 0, ≥ 32 dB en RT 1/2, ≥ 28 dB en RT 3) y confirmando que la subida diferencial de bloques no exceda 1 KB.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/parity_gpu.js
  ```
- **Qué hacer si falla:** Si falla por calidad gráfica, inspeccionar shaders WGSL en `forgex/src/shaders/`. Si se ejecuta en un entorno sin soporte de WebGPU (como CI sin GPU), la prueba lo detectará automáticamente y registrará `[SKIP]` con código de salida `0`.

### 2.11 `regression_gameplay.js` — 6 Escenarios Críticos de Gameplay
- **Qué verifica:** Valida mediante Playwright que 6 mecánicas fundamentales permanezcan operativas:
  1. Andar durante 10 segundos continuos sin atascarse (`stuck < 1.0`).
  2. Ascender hacia adelante por la torre alcanzando una altura récord de `top >= 20m`.
  3. Entrar a una mazmorra/estructura y salir, verificando el cambio de zona y su restauración.
  4. Rotar el ángulo de visión vertical en todo el rango `look` de [-0.85, 0.85].
  5. Curarse al estar quieto en reposo (consumo de reserva y aumento de vida).
  6. Caer al vacío, recibir daño por caída y reaparecer de forma segura en el último checkpoint.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/regression_gameplay.js
  ```
- **Qué hacer si falla:** Revisar la sincronización de estado entre JS y Rust en `100-bucle-principal.js` y `075-fisica-del-jugador.js`. Las capturas visuales de cada escenario se guardan en `salida/gameplay_<N>.png`.

### 2.12 `chunk_test.js` & `streaming_test.js` — Chunks y Streaming Espacial
- **Qué verifica:** Estructura espacial de 2312 chunks (17x17x8), asignación de estados en WASM (`chunk_state`), funciones de mapeo de coordenadas (`chunkOf`), carga de catálogo y expulsión (`Evicted`) según radio de streaming alrededor del jugador.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/chunk_test.js
  node pruebas/streaming_test.js
  ```

### 2.13 `c1_physics.js` & `c2_simd.js` — Física y Aritmética SIMD
- **Qué verifica:** `c1_physics.js` valida movimiento, colisiones horizontales/verticales, salto parabólico, daño por caída y regeneración Fibonacci. `c2_simd.js` valida operaciones vectoriales SIMD de 4 carriles (`sep4`, `dist4`, `simd_los4`, `simd_damage4`, `hitscan`).
- **Cómo ejecutarla:**
  ```bash
  node pruebas/c1_physics.js
  node pruebas/c2_simd.js
  ```

### 2.14 `t_cfg.js` & `t_workers.js` — UI, Configuración y Escalado Multihilo
- **Qué verifica:** `t_cfg.js` interactúa con el panel de ajustes en Playwright y verifica en caliente `syncConfigToRust`, recorte de valores fuera de rango en `set_gfx_cfg` y migración de configuraciones heredadas. `t_workers.js` valida la estabilidad del pipeline multihilo en Web Workers al variar la cantidad de hilos de 0 a 3.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/t_cfg.js
  node pruebas/t_workers.js
  ```

### 2.15 `wasmfeat.py` & `modules_layout.js` — Validación de Bytecode y Layout SoA
- **Qué verifica:** `wasmfeat.py` inspecciona el archivo WebAssembly escalar asegurando que cumpla los estándares mínimos sin requerir SIMD. `modules_layout.js` verifica la presencia de los 54 exports base, punteros SoA de entidades/proyectiles/partículas y constantes geométricas.
- **Cómo ejecutarla:**
  ```bash
  python pruebas/wasmfeat.py rust-gfx/forgex_gfx_scalar.wasm
  node pruebas/modules_layout.js
  ```

### 2.16 `ab_gpu.js` — Benchmark Comparativo A/B
- **Qué verifica:** Ejecuta 10 segundos continuos con WebGPU y 10 segundos continuos con CPU (Rust), calculando percentiles P50, P99 y medias para tiempo de fotograma (`gap`), trabajo por fotograma (`work`), volumen de subida gráfica y pases de render.
- **Cómo ejecutarla:**
  ```bash
  node pruebas/ab_gpu.js
  ```
- **Salida:** Imprime la tabla comparativa en la terminal y guarda un informe detallado en formato JSON en `pruebas/out/ab_gpu_<timestamp>.json`.

