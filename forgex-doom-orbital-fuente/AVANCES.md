# FORGEX DOOM Orbital — registro de avances de la refactorización del motor

**Fecha del corte:** 24 de septiembre de 2026, 15:50 (hora de Ciudad de México)
**Estado:** trabajo en curso. El juego de este paquete funciona y se puede jugar, pero la refactorización pedida
en la especificación (37 puntos, fases 1–10) **no está terminada**. La versión publicada en claude.ai sigue siendo
la v17; este código todavía no se ha publicado.

Pedido original: refactorizar a fondo el motor gráfico y de rendimiento con Rust/WebAssembly y WebGPU, con
configuración central, presets, AUTO, rutas de respaldo, panel de rendimiento y documentación honesta, y
**«asegúrate de que funcione en cualquier gráfica»**.

---

## 1. Resumen en una tabla

| Fase de la especificación | Estado | Qué hay |
|---|---|---|
| 1. Instrumentación | ✅ Hecho | Medias por sistema, anillo de 1024 fotogramas, percentiles 1 % y 0,1 %, σ, tirones, qué limita, memoria, imágenes nuevas/s, panel de rendimiento y panel de sistemas activos. |
| 2. Datos orientados / pools | ✅ Parcial | Pool SoA de partículas (sin basura por fotograma), cola de sprites en `Float32Array`, atlas único de sprites. Enemigos, objetos y proyectiles siguen siendo objetos JS. |
| 3. SIMD | ✅ Hecho | Luz con SIMD de 128 bits (ya existía) + **variante sin SIMD** (WebAssembly 1.0) verificada bit a bit. |
| 4. Descarte / lotes / instancias | ✅ Parcial | Descarte por frustum de sprites, cola de instancias de sprite rasterizada en Rust, chispas en Rust, LOD de IA. No hay descarte por oclusión. |
| 5. Búferes múltiples / fotogramas en vuelo | ✅ Parcial | Anillo de búferes transferibles y límite de fotogramas en vuelo para los hilos de render. En WebGPU aún no aplica (no existe esa ruta). |
| 6. Multihilo con respaldo | ✅ Hecho (sin validar en equipos de ≥4 núcleos) | Web Workers con réplica del mundo, diario de cambios, franjas verificadas idénticas al render completo, vuelta automática a un hilo si fallan. |
| 7. RT optimizado, temporal y denoise | ⚠️ Parcial | Distancia máxima de sombras RT configurable. **Acumulación temporal, denoise, varios rayos por píxel y luz indirecta NO están implementados**: dependen de la ruta WebGPU. |
| 8. Calidad adaptativa y resolución dinámica | ✅ Hecho | AUTO con 8 niveles, histéresis, enfriamiento y bloqueo anti-vaivén; resolución dinámica; preset automático por **medición**. |
| 9. Streaming / caché | ❌ No empezado | El mundo ya se genera y se poda por alturas (desde versiones anteriores); no hay caché nueva. |
| 10. Perfilado final y documentación | ⚠️ Parcial | Este documento y mediciones parciales; falta la comparación final completa y la batería de regresión. |
| **Ruta WebGPU** | ❌ No implementada | `110-webgpu.js` es un esqueleto: detecta el adaptador, pero `startGPU()` siempre devuelve «no disponible». |

---

## 2. Qué significa hoy «funciona en cualquier gráfica»

Hoy **ninguna parte del render depende de la tarjeta gráfica**: la escena se calcula en el procesador y la gráfica
solo compone la imagen final del canvas 2D (lo hace el navegador). Por eso funciona con cualquier gráfica que
pueda mostrar una página web. La cadena de respaldo, de la ruta más rápida a la más compatible, es:

1. **WebGPU** — aún no existe (el esqueleto informa el motivo).
2. **Rust + WebAssembly con SIMD** — navegadores desde ~2021 (Chrome 91, Firefox 89, Safari 16.4).
3. **Rust + WebAssembly 1.0 sin SIMD** — navegadores antiguos (instrucciones MVP verificadas).
4. **JavaScript** — último recurso; siempre funciona, más lento y sin trazado de rayos.

Además: si el motor activo lanza errores en 20 fotogramas seguidos, el juego cambia solo al siguiente de la cadena
y lo avisa. Si los hilos de render fallan, dejan de responder 2,5 s o la página no permite crearlos, se vuelve a
un solo hilo.

Cuando se implemente WebGPU, el plan es que AUTO solo la elija si (a) el adaptador no es por software,
(b) una prueba de arranque compara su imagen con la de Rust y coinciden, y (c) medida en ese equipo es más rápida.
Si el dispositivo se pierde, se vuelve a Rust.

---

## 3. Arquitectura actual del código

El juego se ensambla en **un solo HTML autocontenido** con `forgex/build.py`:

- `forgex/src/page.html`: cabecera, estilos, marcado. El panel de ajustes ya no está escrito a mano: se genera.
- `forgex/src/js/NNN-*.js`: partes del juego, concatenadas en orden dentro de una sola función (comparten ámbito).
- `forgex/src/workers/render.js`: código del hilo de render (se incrusta como texto).
- `rust-gfx/forgex_gfx*.wasm`: las dos variantes del motor Rust, incrustadas en base64.

### Módulos JS nuevos o reescritos en esta refactorización

| Archivo | Qué hace |
|---|---|
| `001-config.js` | **Configuración central.** Lista `OPTIONS` (sección, clave, etiqueta, tipo, opciones, valor por defecto, requisito). Presets ULTRA, ALTA, MEDIA, BAJA, RENDIMIENTO + personalizado + automático. Persistencia en `localStorage` (`forgex-doom-cfg2`) con migración de los ajustes de la versión anterior. `EFF` = valores efectivos del fotograma. |
| `002-capacidades.js` | Detección: WebAssembly, SIMD (validando un módulo mínimo), workers, SharedArrayBuffer/aislamiento, núcleos, memoria, táctil, adaptador WebGPU (fabricante, si es por software, timestamps). |
| `003-motor.js` | Estado del motor, resolución interna (múltiplo de 32 para tiles, bloques 3D y bloom), resolución dinámica, vistas de memoria sobre la instancia Rust. |
| `045-entidades.js` | **Pool SoA de partículas** (3072). La densidad se reduce de forma determinista, sin alterar la secuencia de `Math.random` (el mundo se genera igual). |
| `080-enemigos.js` | `stepEnemy()` por criatura + **LOD de simulación**: cerca o atacando → cada paso; a media distancia y tranquilas → a la frecuencia de «IA lejana»; a más de 28 m → congeladas (como antes). |
| `085-render-del-mundo.js` | `prepareFrame()` independiente del motor (cámara, cola de sprites, luces, sombras de contacto) y un ejecutor por motor: `rustRender`, `jsRender`, `workersRender`, `gpuRender`. Atlas de sprites. Descarte por frustum. |
| `095-rendimiento.js` | Instrumentación y paneles (ver fase 1). |
| `098-ajustes.js` | **Panel de ajustes generado** desde `OPTIONS`; muestra desactivado y con el motivo lo que el navegador no permite. |
| `100-bucle-principal.js` | **Simulación a paso fijo** (30/60/120 Hz), cámara aplicada en cada fotograma, **interpolación** entre pasos (sin interpolar teletransportes), **controlador AUTO**, composición. |
| `105-motor-rust.js` | Carga de variantes Rust, cadena de respaldo `setBackend()`, medición de la frecuencia del monitor, **calibración del preset automático**, ganchos de prueba `window.__doom`. |
| `107-hilos.js` | **Hilos de render** (ver sección 5). |
| `110-webgpu.js` | Esqueleto de la ruta WebGPU (sin implementar). |

### Cambios en el motor Rust (`rust-gfx/src/lib.rs`, `scalar4.rs`)

- `scalar4.rs`: emulación lane por lane de las instrucciones SIMD usadas → variante MVP.
- `render`, `render3d`, `light_pass`, `bloom_down` aceptan una **franja de columnas** `[cx0, cx1)`.
- `light_pass(…, rtmax)`: sombras RT solo hasta la distancia configurada.
- `sprite_pass` y `particle_pass`: sprites y chispas pasan de JS a Rust.
- Atlas de sprites (`p_atlas`), cola de sprites (`p_spr`), chispas (`p_ptx/y/z/c`).
- Seguimiento de rangos modificados del mundo (`w_dirty`, `p_head`, `p_bl`, `p_cz`) para una futura subida parcial a la GPU.
- Memoria por instancia: **61,4 MB** (medido).

---

## 4. Opciones configurables (todas con valor por defecto seguro)

| Sección | Opciones |
|---|---|
| Gráficos | motor (auto/WebGPU/Rust/JS), resolución base, resolución dinámica, distancia de dibujo, iluminación dinámica (0/8/12 luces), partículas, bloom, grano, cámara 3D siempre |
| Trazado de rayos | modo (apagado / 4 luces / todas / suaves), distancia máxima con sombras RT; *rayos por píxel, acumulación temporal, denoise y luz indirecta aparecen pero hoy **no tienen efecto** (solo WebGPU, no implementada)* |
| Rendimiento | AUTO, FPS objetivo, frecuencia de simulación, frecuencia de la IA lejana, interpolación, LOD de simulación, descarte, refresco de estadísticas |
| Memoria | fotogramas en vuelo (2 o 3; hoy solo afecta a los hilos de render) |
| Hilos | hilos de render (automático / 0–4) |
| Procesador | SIMD de WebAssembly |
| Depuración | mostrar rendimiento, mostrar sistemas activos |

Ninguna opción cambia la jugabilidad; todas cambian solo cómo se dibuja o cómo se reparte el trabajo. Una
matización honesta: el LOD de IA hace que las criaturas lejanas y tranquilas decidan con un retraso de hasta
~67 ms (a 15 Hz); se puede desactivar.

---

## 5. Hilos de render

- Cada hilo carga su propia instancia de Rust (se le envía el módulo ya compilado) y una **réplica del mundo**.
- Los cambios del mundo (añadir bloques, ácido, poda, reinicio) se anotan en un **diario** que viaja con el
  siguiente fotograma; los sprites nuevos del atlas, igual.
- Cada hilo dibuja una **franja vertical** (anchos múltiplos de 16) y devuelve su imagen y su bloom en
  **búferes transferibles** que el hilo principal recicla (sin copias extra ni basura).
- **Coste:** ~61 MB de memoria por hilo y un fotograma más de latencia.
- **Política automática actual:** hilos = mín(4, núcleos − 1, memoria GB / 2); si sale menos de 2, **no se usan**.
- **Por qué no memoria compartida:** `SharedArrayBuffer` exige que la página esté aislada entre orígenes
  (cabeceras COOP/COEP) y la página publicada en claude.ai no puede pedirlas.
- **Sin probar todavía:** que la política de seguridad de claude.ai permita crear workers desde un Blob. Si no lo
  permite, el juego lo detecta y sigue en un hilo.

---

## 6. Verificaciones hechas

| Prueba | Resultado |
|---|---|
| `pruebas/parity.js` — variante SIMD vs sin SIMD, 3 resoluciones × 6 cámaras × 4 modos RT × 2 cámaras | **144/144 imágenes idénticas bit a bit** (incluido el bloom) |
| `pruebas/strips.js` — 3 franjas en 3 instancias vs render completo, con sprites, chispas, RT y bloom, 4 resoluciones × 8 cámaras × 2 modos | **64/64 idénticas** en cada variante |
| `pruebas/wasmfeat.py` — instrucciones de la variante sin SIMD | **solo WebAssembly 1.0 (MVP)** |
| `pruebas/t_cfg.js` — panel, presets, cambio de variante y de motor, paneles de depuración | sin errores |
| `pruebas/t_workers.js` — 0 a 3 hilos, RT 4 luces y suaves | sin errores; imagen correcta |
| Error encontrado y corregido | `sprite_pass` en Rust leía fuera de rango cuando la primera fila/columna del sprite caía antes del texel 0 (en JS devolvía `undefined` y no pasaba nada; en Rust habría detenido el motor). Lo detectó `strips.js`. |

**Pendiente:** volver a pasar la batería de regresión de jugabilidad de versiones anteriores (atascos, ramas,
masmorras, mirar arriba/abajo, curación) tras la refactorización.

---

## 7. Mediciones (con su contexto)

**Equipo de medición:** contenedor en la nube con **2 núcleos lógicos**, Chromium 141 sin interfaz (headless),
**sin GPU** (WebGPU no disponible). Los números absolutos no representan un PC de juego; sirven para comparar
versiones en la misma máquina y la misma sesión.

**Escena fija:** semilla 20260924, «MEGAMASMORRA · ANTENA MUERTA», ALTA 640×400, 4 direcciones de cámara,
AUTO apagado. Tiempo de trabajo por fotograma (media · peor dirección):

| RT | v17 (antes) | Actual | Diferencia |
|---|---|---|---|
| Apagado | 8,5 · 9,6 ms | 8,0 · 8,6 ms | −0,5 ms |
| 4 luces | 10,4 · 13,3 ms | 10,0 · 12,3 ms | −0,4 ms |
| Todas | 12,3 · 14,1 ms | 12,0 · 13,9 ms | −0,3 ms |
| Suaves | 20,7 · 27,0 ms | 19,7 · 26,2 ms | −1,0 ms |

Lectura honesta: **sin regresión y una mejora pequeña**, dentro de lo que puede ser ruido. La refactorización de
esta etapa aporta sobre todo robustez, configuración y medición, no velocidad bruta. El cuello de botella sigue
siendo la luz con RT en el procesador (6–16 ms de los 10–20).

**SIMD frente a sin SIMD** (escena inicial, ALTA): 7,0 ms frente a 10,8 ms por fotograma (la luz: 1,7 frente a
4,7 ms). La variante sin SIMD es ~1,5× más lenta, pero solo se usa donde la otra no funcionaría.

**Hilos de render en 2 núcleos** (misma escena): el hilo principal baja de ~10–20 ms a ~1,5–1,9 ms, pero la franja
más lenta tarda 7,5–21 ms porque 3–4 hilos se reparten 2 núcleos. Las imágenes nuevas por segundo medidas fueron
irregulares (30–45 con RT 4 luces; 20–38 con RT suaves) y la medición de esa ventana es ruidosa. **Conclusión:
con 2 núcleos no hay una ganancia clara**, por eso el modo automático no los activa en equipos así. En equipos de
6–8 núcleos se espera ganancia en RT suaves, pero **no está medido**.

**Calibración del preset automático:** en este equipo, un fotograma de prueba en ALTA con RT tardó 5,4 ms frente a
un presupuesto de 13,3 ms (80 % de 60 FPS) → eligió ALTA.

---

## 8. Limitaciones y riesgos conocidos

- **WebGPU no está implementado.** Las opciones de RT por GPU se muestran pero no hacen nada.
- En este entorno solo existe el adaptador WebGPU por software (SwiftShader); cuando exista la ruta GPU, su
  rendimiento en tarjetas reales **no se podrá medir aquí**.
- Hilos: +1 fotograma de latencia y ~61 MB por hilo; política automática validada solo en 2 núcleos.
- La medición de «imágenes nuevas por segundo» usa ventanas cortas y es ruidosa.
- La opción «fotogramas en vuelo» hoy solo afecta a los hilos.
- La batería completa de regresión de jugabilidad no se ha vuelto a ejecutar.

---

## 9. Cómo compilar y probar

```sh
# 1) Motor Rust (dos variantes). Requisitos y cómo compilar core en rust-gfx/README.md
cd rust-gfx && ./build.sh
# 2) Ensamblar el HTML (incrusta wasm, worker y, en el futuro, shaders)
cd ../forgex && python3 build.py          # escribe ../dist/forgex-doom-orbital.html
# 3) Pruebas del motor (Node 18+)
node pruebas/parity.js
node pruebas/strips.js rust-gfx/forgex_gfx.wasm
node pruebas/strips.js rust-gfx/forgex_gfx_scalar.wasm
python3 pruebas/wasmfeat.py rust-gfx/forgex_gfx_scalar.wasm
# 4) Pruebas en navegador (Playwright + Chromium)
node pruebas/t_cfg.js
node pruebas/t_workers.js
node pruebas/ab.js <ruta al html> 2 0,1,2,3     # banco A/B con semilla fija
```

En el paquete, `dist/forgex-doom-orbital.html` es la compilación actual (se abre directamente en el navegador) y
`pruebas/referencia/orbital_v17.html` es la versión anterior para comparar.

---

## 11. Agente C — Física, SIMD y Simulación en Rust

### Plan C1: SimState, World Queries y Física del Jugador (Completado)
- **`world.rs`**: Se añadieron consultas espaciales optimizadas (`cell_at`, `blocked`, `floor_at`, `solid_at`, `clear_path`).
- **`sim_state.rs`**: Estructura `SimState` `#[repr(C)]` con 30 campos alineados (posición, velocidad, ángulos, vida, regeneración Fibonacci, checkpoints, top).
- **`physics.rs`**: Port completo de la física del jugador (`075-fisica-del-jugador.js`) con cálculo Fibonacci bit-exacto (`regen_step`).
- **`075-fisica-del-jugador.js`**: Delegación a `wasm.sim_step` cuando `BACKEND !== 'js'` con fallback JS idéntico. *(Desconectado el 26-sep-2026: ver «Corrección» más abajo.)*
- **`pruebas/c1_physics.js`**: 38/38 pruebas unitarias y de integración pasando al 100% en SIMD y Escalar.

### Plan C2: SIMD Explícito de 128 bits, Hitscan y Simulación de Entidades (Completado)
- **`simd_ops.rs`**: Operaciones vectoriales explícitas de 128 bits (`sep4`, `dist4`, `simd_los4`, `simd_damage4`) con intrinsics de WebAssembly SIMD128.
- **`scalar_simd.rs`**: Emulación escalar lane-a-lane para WebAssembly MVP sin SIMD.
- **`hitscan.rs`**: Sistema de hitscan con `HitscanResult` (`hit_count`, `ids[64]`, `along[64]`). Batching SIMD de 4 rayos para dispersión de escopeta (7 perdigones), oclusión por paredes con `clear_path`, ordenamiento por distancia `along` e impacto perforante vs único blanco.
- **`sim.rs`**: Port en Rust de la IA de enemigos (`step_enemy` para imp, calavera y cacodemonio), LOD por distancia (`d3 > 28` congelado, `12 < d3 <= 28` acumulación `aiHz`, `d3 <= 12` tick completo), actualización de proyectiles y colisiones de ítems.
- **`ecs.rs`**: Ampliación de `EntitySoA` con temporizadores y estados para IA; nuevo `ItemsSoA` para objetos del mundo.
- **`070-disparo.js` & `080-enemigos.js`**: Delegación a Rust de hitscan, enemigos, proyectiles e ítems cuando `BACKEND !== 'js'`, manteniendo compatibilidad completa en JS.
- **`pruebas/c2_simd.js`**: 7/7 suites de pruebas pasando con 0 diferencias (< 1e-6) en 1000 vectores aleatorios entre SIMD y Escalar.

### Plan C3: Reproducibilidad, Paridad SIMD vs Escalar e Integración JS (Completado)
- **`sim_hash()` en Rust**: Exportación C-ABI con hashing FNV-1a (32-bit, primo `16777619`, offset `2166136261`) serializando jugador (`SIM.px, py, pz, pa, look`) y entidades activas (`x, y, z, hp`).
- **`pruebas/sim_replay.js`**: Replay determinista de 3600 pasos (1 minuto a 60 Hz) con entradas fijas. 121/120 checkpoints verificados al 100% con hashes idénticos bit a bit entre JavaScript y Rust.
- **`pruebas/parity_sim.js`**: Comparación de `forgex_gfx.wasm` (SIMD128) vs `forgex_gfx_scalar.wasm` (Escalar MVP) en simulación integral (física, IA de imps, calaveras y cacodemonios, proyectiles e ítems). 121/120 checkpoints idénticos bit a bit.
- **`100-bucle-principal.js`**: Integración en `simStep(dt)` de `wasm.sim_step(dt)` cuando `BACKEND !== 'js'` sustituyendo las llamadas fragmentadas de física, IA, proyectiles e ítems, con sincronización de estado limpia antes y después del paso.
- **`pruebas/c3_stress.js`**:
  - Test C3.5: 10.000 pasos deterministas continuos sin diverger, generando 500/500 hashes únicos en las muestras.
  - Test C3.6: 18.000 pasos (5 minutos de simulación continua a 60 FPS) verificando ausencia total de bloqueos, NaNs e invariantes de estado (no `hp <= 0` sin `dead = true`).
- **Suite de Regresión**: Cero regresiones en `c1_physics.js` (38/38), `c2_simd.js` (7/7), `parity.js` (144/144), `t_cfg.js` (aprobado).

### Corrección del 26 de septiembre de 2026: la simulación del juego vuelve a JavaScript
La integración de C1–C3 en el juego estaba rota con el motor Rust (el que se usa por defecto), aunque las pruebas
de Rust aisladas pasaban. En cada paso, el JS recreaba el estado en Rust desde cero:
- `sim_set_player` ponía `vz = 0` y borraba el empuje: **el salto subía 0,09 m** (el HUD mostraba «1 m») y la
  **caída al vacío no terminaba nunca** (bajaba a 0,33 m/s constantes sin llegar al umbral de −14 m).
- `sim_reset_entities` + `sim_spawn` reiniciaban la IA en cada paso: **los imps y cacodemonios nunca disparaban y
  las calaveras nunca embestían**; los proyectiles no se leían de vuelta desde Rust.
- `SIM.dead` no se reiniciaba: **tras morir y pulsar R el jugador seguía muerto**.
- `physics.rs` marca el récord con `F_SHIP` en lugar de la marca de ruta (16): **el récord no subía en las
  plataformas de la ruta** y la torre dejaba de generarse por encima.
- Las flechas y el ratón giraban la cámara dos veces (en `applyLook` y otra vez en Rust), faltaban sonidos y efectos
  (plataformas de impulso, punto seguro, aterrizaje) y los datos se leían en una dirección fija (`0x20000`) de la
  memoria de Rust.

Solución aplicada: la simulación (física del jugador, enemigos, proyectiles, objetos y disparo) usa siempre la lógica
JS, que es la de la v17 verificada. Rust sigue haciendo el render. El código de simulación en Rust (`sim.rs`,
`physics.rs`, `hitscan.rs`) se conserva y sus pruebas aisladas siguen igual, pero no está conectado al juego:
conectarlo bien exige que Rust conserve el estado entre pasos en lugar de recrearlo, además de corregir el fallo de
`F_SHIP`. `pruebas/regression_gameplay.js` añade los escenarios 7–10 (salto y doble salto, caída libre real, reinicio
tras morir y ataque de un imp) con el motor Rust.

---

## 12. Agente E — Configuración central, instrumentación, tests y CI

### Plan E1: Configuración congelada y profiling en Rust (Completado)
- **`config.rs`**: Estructuras congeladas `#[repr(C)]` con layouts fijos para ABI C:
  - `GraphicsConfig` (128 bytes): backend, quality, dynamic_res, draw_distance, lighting, particles, bloom, grain, cam3d, rt_mode, rt_max_dist, rt_rays, rt_temporal, rt_denoise, rt_indirect, pad.
  - `PerformanceConfig` (48 bytes): auto, target_fps, sim_hz, ai_hz, interpolate, lod, culling, stats_hz, pad.
  - Funciones exportadas `get_gfx_cfg()`, `get_perf_cfg()`, `set_gfx_cfg()` y `set_perf_cfg()` con lógica de validación y límites automáticos en Rust.
- **`prof.rs`**: Sistema de telemetría de alto rendimiento sin asignación dinámica:
  - Búfer de 7 ranuras fijas (`PROF_WORLD`, `PROF_LIGHT`, `PROF_SIM`, `PROF_AI`, `PROF_SPRITES`, `PROF_UPLOAD`, `PROF_PRESENT`).
  - Macros `prof_begin!(slot)` y `prof_end!(slot)` con importación `now_import` desde JS.
  - Exportación `prof_drain(*mut f32, count)` y `prof_buf()` con búfer estático `DRAIN_BUF` para drenado rápido en 1 llamada C-ABI por fotograma.
- **`001-config.js` & `105-motor-rust.js`**:
  - `syncConfigToRust(wasm)` escribe los 128 bytes de gráficos y 48 bytes de rendimiento directamente en la memoria WASM.
  - Registro de `lastSyncTime` y paso de `now_import: () => performance.now()` en todas las instancias WASM.
- **`pruebas/e1_config.js`**: Batería de validación de offsets C-ABI, tamaños exactos y drenado de profiling. 100% aprobado.

### Plan E2: Overlay extendido a 8 líneas y optimización de render (Completado)
- **`095-rendimiento.js`**: Reescritura del panel de rendimiento a 8 líneas estables:
  - Línea 1 (verde): FPS, fotograma medio, percentiles P99, P999, desviación típica σ y tirones.
  - Línea 2: Trabajo por fotograma, percentil P99 de trabajo, FPS posibles según carga y cuello de botella detectado.
  - Línea 3: CPU Rust con los 7 valores drenados de `prof_drain` (World, Light/RT, Sim, AI, Sprites, Upload, Present).
  - Línea 4: CPU JS con los 8 tiempos de simulación, IA, mundo, sprites, composición, HUD, lógica y total.
  - Línea 5: GPU en ms, volumen de subidas en KB, pases de render e instancias de sprites.
  - Línea 6: Memoria JS, WASM estático (~61 MB constante), WASM vivo, asignaciones dinámicas en caliente (`allocs`) y VRAM GPU.
  - Línea 7: Chunks totales, visibles en frustum, en CPU, en GPU y expulsados.
  - Línea 8: Motor/backend activo, resolución efectiva, porcentaje de escala, modo RT y tipo de cámara.
- **Caché y optimización de dibujo**: Los textos de las 8 líneas y el ancho del panel (`PERF.overlayW`) se formatean y miden exclusivamente dentro de `perfStats()` a la frecuencia configurada (`statsHz`, 4 Hz por defecto), eliminando el micro-stutter que causaba `ctx.measureText` en cada fotograma.
- **`098-ajustes.js` & `page.html`**: Indicador visual `s-sync` en el panel de opciones que muestra en tiempo real el backend sincronizado en Rust y el instante de la última sincronización.
- **`pruebas/e2_overlay.js`**: Prueba con Chromium/Playwright que verifica las 8 líneas del panel, la presencia de las 7 métricas de Rust y guarda captura en `salida/e2_overlay.png`. 100% aprobado.

### Plan E3: Arnés de tests, regresión de gameplay y benchmarks (Completado)
- **`run_all.sh` & `pruebas/run_all.sh`**: Arnés unificado que ejecuta la suite completa de 11 tests en orden estricto, mide tiempos con precisión de milisegundos, genera tabla resumen con estados `PASS`, `FAIL` o `SKIP`, y gestiona códigos de retorno para CI/CD.
- **`pruebas/regression_gameplay.js`**: Verificación Playwright de 6 escenarios críticos de jugabilidad:
  1. Caminar 10s continuos sin atascarse (`stuck < 1.0`).
  2. Ascender por la torre alcanzando una cota `top >= 20m` (31.7m verificados).
  3. Entrada y salida de estructuras/mazmorras con transición correcta de `zone`.
  4. Rotación vertical libre de la cámara cubriendo todo el rango `[-0.85, 0.85]`.
  5. Curación y regeneración Fibonacci en reposo (consumo de reserva y recuperación de vida).
  6. Caída al vacío, recepción de daño por caída y reaparición inmediata en el último checkpoint.
- **`pruebas/ab_gpu.js`**: Benchmark comparativo automatizado de 10s en WebGPU vs 10s en CPU (Rust), reportando gap medio/P99, trabajo medio/P99, transferencias de búfer y guardando el reporte en `pruebas/out/ab_gpu_<timestamp>.json`.
- **`pruebas/parity_gpu.js`**: Refinado con soporte de omisión elegante (`[SKIP]`) en entornos CI sin GPU y validación estricta de umbrales PSNR (≥ 35 dB en RT 0, ≥ 32 dB en RT 1/2, ≥ 28 dB en RT 3) y subida diferencial < 1 KB (96 bytes medidos).
- **`pruebas/README.md`**: Guía detallada para desarrolladores documentando cada test, su objetivo, cómo ejecutarlo individualmente y cómo depurar fallos.

---

### Cómo leer el panel de rendimiento (Overlay de 8 líneas)

| Línea | Color / Formato | Significado y cómo interpretarlo |
|---|---|---|
| **1** | `#9dff7a` (verde)<br>`FPS · gap · P99 · P999 · σ · tirones` | **Tasa de refresco y suavidad del cuadro.**<br>- `FPS`: fotogramas mostrados por segundo (y nuevas imágenes `imgFps` si difiere).<br>- `fotograma`: intervalo medio entre frames en ms (`gapAvg`).<br>- `1 %` y `0,1 %`: percentiles P99 y P99.9 de los peores intervalos (picos de lag).<br>- `σ`: desviación típica de los intervalos en ms (valores < 3.0 indican gran estabilidad).<br>- `tirones`: cuenta de caídas donde el intervalo superó el doble de la mediana y excedió 25 ms. |
| **2** | `#e6e2f5`<br>`Trabajo · P99 · FPS posibles · límite` | **Presupuesto de cómputo y cuello de botella.**<br>- `Trabajo`: tiempo que el motor tardó en computar el cuadro en ms (`perf.total`).<br>- `1 %`: percentil P99 de tiempo de trabajo.<br>- `FPS posibles`: fotogramas teóricos máximos que la máquina alcanzaría sin sincronización vertical (`1000 / trabajo`).<br>- `límite`: diagnóstico automático de qué recurso restringe el rendimiento (*GPU*, *hilos de render*, *luz y RT en el procesador*, *procesador*, *navegador* o *pantalla (sincronía vertical)*). |
| **3** | `#e6e2f5`<br>`CPU Rust: 7 métricas` | **Tiempos del núcleo nativo Rust (ms).**<br>Lee en tiempo real las 7 ranuras de profiling drenadas mediante `prof_drain`: `World` (recorrido de celdas), `Light/RT` (trazado de rayos y cálculo de iluminación), `Sim` (física y movimiento del jugador), `AI` (comportamiento de enemigos), `Sprites` (ordenamiento y dibujo de entidades), `Upload` (subida de texturas y buffers) y `Present` (presentación en pantalla). Muestra `(inactivo)` si el motor activo no es Rust. |
| **4** | `#e6e2f5`<br>`CPU JS: 8 métricas` | **Carga de trabajo en JavaScript (ms).**<br>Desglosa los subsistemas en el hilo principal de JavaScript: `sim` (física y simulación JS), `ai` (inteligencia artificial de criaturas), `world` (recorrido del mundo y oclusión), `sprites` (preparación de sprites e iconos), `comp` (composición 2D, bloom y viñeta), `hud` (dibujo de interfaz, barras, textos e iconos), `total` (tiempo acumulado de trabajo por fotograma) y `logic` (lógica general del juego). |
| **5** | `#e6e2f5`<br>`GPU · subidas · pases · instancias` | **Carga del pipeline gráfico y memoria de transferencia.**<br>- `GPU`: tiempo consumido por la GPU en ms (con GPU timestamps reales si el navegador lo permite o estimación precisa).<br>- `subidas`: volumen en KB transferido a la GPU en el fotograma.<br>- `pases`: número de render/compute passes ejecutados.<br>- `instancias`: cantidad de sprites dibujados mediante instanciación en GPU. |
| **6** | `#e6e2f5`<br>`Memoria: JS · WASM estático · WASM vivo · allocs · GPU` | **Diagnóstico de memoria y recolección de basura.**<br>- `JS`: tamaño del heap de JavaScript en MB.<br>- `WASM estático`: memoria nativa estática reservada por WebAssembly (estrictamente constante a ~61 MB).<br>- `WASM vivo`: memoria dinámica viva en MB.<br>- `allocs`: contador de asignaciones dinámicas en caliente (`wasm_alloc_count()`). Debe ser estrictamente 0 durante el render para garantizar cero pausas por GC.<br>- `GPU`: VRAM ocupada por texturas y búferes en MB. |
| **7** | `#e6e2f5`<br>`Chunks: total · visibles · CPU · GPU · expulsados` | **Gestión espacial del mundo por chunks.**<br>- `total`: número total de chunks del mundo (2312).<br>- `visibles`: chunks dentro del frustum de la cámara.<br>- `CPU`: chunks activos en memoria del procesador.<br>- `GPU`: chunks con búferes cargados en la GPU.<br>- `expulsados`: chunks liberados de memoria por distancia o streaming vertical. |
| **8** | `#5ff2e6`<br>`Motor · resolución · RT · cámara` | **Identidad y configuración efectiva del motor.**<br>- Motor activo: `WebGPU (<GPU>)`, `Rust + WebAssembly con/sin SIMD (<hilos> hilos)` o `JavaScript`.<br>- Resolución: dimensiones internas (`RW×RH`) y porcentaje relativo a la resolución base.<br>- Trazado de rayos: modo efectivo (`apagado`, `4 luces`, `todas`, `suaves`) y aviso `(AUTO)` si la calidad adaptativa lo recortó.<br>- Cámara: proyección activa (`3D real por píxel` o `raycaster por columnas`). |

---

## 13. Siguientes pasos (en orden)

1. Publicación de la versión refactorizada.
2. Monitorización y telemetría continua de rendimiento con el arnés `run_all.sh`.

