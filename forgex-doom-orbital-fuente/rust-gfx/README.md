# forgex_gfx — motor gráfico en Rust de FORGEX DOOM Orbital

Motor de render que el juego carga como WebAssembly (incrustado en base64 dentro del HTML).
Si el navegador no puede cargarlo, el juego usa automáticamente el motor JavaScript de respaldo.

## Qué hace cada parte

| Función exportada | Qué hace |
|---|---|
| `w_reset / w_add / w_set_acid / w_prune` | Copia del mundo (pilas de bloques por celda) en la memoria de WASM. JS la mantiene sincronizada cada vez que añade o poda bloques, aunque en ese momento esté activo el motor JS. |
| `render` | Raycaster por columnas: paredes, suelos y techos con texturas y niebla precalculada, bordes emisivos y oclusión ambiental. Escribe un G-buffer mínimo por píxel: color, profundidad, normal (que también hace de máscara) y luz ambiente. |
| `light_pass` | Iluminación diferida por tiles de 16×16 px con SIMD de 128 bits (un quad 2×2 = 4 lanes). Reconstruye la posición de cada píxel desde la profundidad, descarta por tile las luces que no lo tocan y aplica ambiente, linterna, sombras de contacto y luces puntuales con Lambert. Con RT activo lanza rayos de sombra reales. Escribe la imagen final por filas en `OUT`. |
| `render3d` | Cámara con inclinación real (para mirar al cénit o al suelo bajo los pies): lanza un rayo 3D por píxel que recorre la rejilla y busca la primera pared, suelo o techo que corta. Usa muestreo jerárquico: un rayo cada 4×4 píxeles; si las 4 esquinas de un bloque tocan la misma cara, los píxeles de dentro se resuelven con la intersección exacta rayo-plano; si no, se baja a 2×2 y, en los bordes de objetos, a rayos individuales. |
| `bloom_down` | Reduce el buffer emisivo a 1/4 (media 4×4) para el resplandor: JS sube al canvas una imagen 16 veces menor. |

### Decisiones de rendimiento

- **Buffers por columnas** (índice = `x·RH + y`): el raycaster recorre columnas, así que cada columna escribe
  memoria contigua. Con los buffers por filas cada escritura caía en una línea de caché distinta; cambiarlo
  bajó el raycaster de ~7,0 a ~2,7 ms a 640×400 (medido en Node con una escena real volcada del juego).
- **Sin buffers de posición**: la posición en el mundo se reconstruye con `cámara + rayo_de_columna × profundidad`
  (exacta para paredes, suelos y techos). Se leen 5 flujos de memoria por píxel en vez de 9.
- **SIMD**: la luz de cada quad 2×2 se calcula con `f32x4` (4 píxeles por instrucción).
- **Un rayo por superficie en cada quad** (modos 1 y 2): si los píxeles del quad están en la misma superficie,
  comparten el resultado del rayo de sombra.

### Cuándo se usa cada cámara

Cerca del horizonte (inclinación menor de ~30°) el raycaster por columnas es exacto y unas 3–4 veces más rápido,
así que es el que se usa. Al inclinar más la vista el juego cambia a `render3d` (con histéresis para no parpadear
en el límite). La opción «Cámara 3D real siempre» fuerza `render3d` en todo momento.

El cielo es un mapa equirectangular (360° × 180°) que se consulta por dirección del rayo en ambos modos, así que
el cénit y el nadir se ven sin deformación.

### Sprites, chispas y franjas (añadido en la refactorización del motor)

| Función exportada | Qué hace |
|---|---|
| `p_atlas` / `atlas_max` | Atlas común de sprites: JS copia cada fotograma de sprite una sola vez (texeles ABGR, 0 = transparente, alfa `0xFE` = brillo propio). |
| `sprite_pass(n, cx0, cx1)` | Rasteriza la cola de sprites del fotograma (`p_spr`: desplazamiento en el atlas, lado, rectángulo en pantalla, profundidad, luz) con prueba de profundidad, de lejos a cerca. Antes lo hacía JS. |
| `particle_pass(n, cámara…, cx0, cx1)` | Dibuja las chispas (`p_ptx/p_pty/p_ptz/p_ptc`) como discos de 1–5 px con prueba de profundidad. |
| `render`, `render3d`, `light_pass`, `bloom_down` | Aceptan una franja de columnas `[cx0, cx1)`. El hilo principal pasa `0..RW`; cada hilo de render (Web Worker) pasa la suya y `light_pass` escribe la salida con el ancho de la franja. |
| `light_pass(…, rtmax)` | Solo lanza rayos de sombra para píxeles a menos de `rtmax` de profundidad (opción «Distancia máxima con sombras RT»). |
| `w_dirty`, `w_used`, `w_zrange`, `p_head`, `p_bl`, `p_cz` | Rangos del mundo modificados desde la última consulta y punteros a sus arrays, pensados para subir solo lo cambiado a una GPU. |
| `w_remove_box(x0, y0, x1, y1, z0, z1)` | Quita los bloques de las celdas `[x0, x1) × [y0, y1)` con base en `[z0, z1)`: así JS expulsa un chunk (32×32 celdas × 8 de alto) del mundo de render. Recalcula el rango de alturas de cada celda tocada. |

### Chunks

JS (`025-mundo.js`) decide qué chunks están cargados en Rust: los de una ventana alrededor del jugador (distancia de
dibujo + 8, también en vertical) o todos si el streaming está apagado. Rust solo recibe bloques (`w_add`) y
expulsiones (`w_remove_box`). Sus rangos modificados (`w_dirty`) usan la misma rejilla: 17×17 chunks en horizontal y,
en vertical, un anillo de 8 capas (`floor(z / 8) mód 8`), sin el tope que antes metía todo lo de z ≥ 56 en la capa 7.

### Compilar

`sh build.sh`. Sin los sysroots propios (`$WSYS`, `$WSYS_MVP`) usa `cargo -Z build-std` para recompilar `core` en cada
variante; necesita `rustup target add wasm32-unknown-unknown` y `rustup component add rust-src`. Después, copiar los
dos `.wasm` también a la carpeta superior (las pruebas de simulación los leen de ahí) y ejecutar `python3 ../forgex/build.py`.

Pruebas (en `../pruebas`): `parity.js` comprueba que la variante sin SIMD da la misma imagen bit a bit que la
SIMD (144 casos); `strips.js` comprueba que dibujar en 3 franjas separadas da exactamente la misma imagen que el
render completo, con sprites, chispas, RT y bloom (64 casos por variante).

### Variantes del módulo

- `forgex_gfx.wasm`: SIMD de 128 bits + bulk-memory + conversiones sin trampa.
- `forgex_gfx_scalar.wasm`: WebAssembly 1.0 (MVP) sin SIMD, para navegadores antiguos. `scalar4.rs` emula lane por
  lane las instrucciones SIMD que usa `light_pass`; al ser ítems locales tapan a los de `core::arch::wasm32`.
  `wasmfeat.py` (en `../pruebas`) confirma que solo contiene instrucciones MVP.

El juego elige en tiempo de ejecución: SIMD si el navegador lo valida y la opción está activa; si no, la escalar;
si tampoco carga, el motor JavaScript.

## Trazado de rayos (RT)

El navegador no da acceso a los núcleos RT de la tarjeta gráfica (ni WebGL ni WebGPU exponen
aceleración de trazado de rayos por hardware), así que el trazado es **por software en la CPU**:
cada rayo de sombra recorre la rejilla del mundo con un DDA y comprueba, en cada celda, si el
segmento corta en altura algún bloque apilado. Es trazado de rayos real contra la geometría del
nivel, no un truco de pantalla.

| Modo | Qué traza |
|---|---|
| 0 | Sin rayos (solo sombras de contacto). |
| 1 | Sombras duras de las 4 luces más cercanas. Un rayo sirve a los píxeles de un quad 2×2 que están en la misma superficie. |
| 2 | Sombras duras de todas las luces (mismo reparto por quads). |
| 3 | Sombras suaves de todas las luces: cada luz es una esfera de radio 0,34; cada píxel del quad lanza un rayo a un punto distinto de la esfera y la superficie promedia las 4 muestras (penumbra). |

## Compilar

Necesita Rust *nightly* (usa `core::arch::wasm32::f32_sqrt` y compañía, que siguen siendo
inestables) y el objetivo `wasm32-unknown-unknown`:

```sh
rustup toolchain install nightly
rustup target add wasm32-unknown-unknown --toolchain nightly
RUSTFLAGS="-C target-feature=+simd128,+bulk-memory,+nontrapping-fptoint" \
  cargo +nightly build --release --target wasm32-unknown-unknown
```

`build.sh` compila las dos variantes con `rustc` directamente (el entorno donde se creó no tenía acceso a
crates.io ni a los binarios de rustup, así que `core` y `compiler_builtins` se compilaron desde el código fuente
de Rust, una vez con las características SIMD y otra con `-C target-cpu=mvp`; rutas en `WSYS` y `WSYS_MVP`).
Para compilar `core` MVP:

```sh
SRC=$(rustc --print sysroot)/lib/rustlib/src/rust/library
RUSTC_BOOTSTRAP=1 rustc --edition 2024 --crate-name core --crate-type rlib --target wasm32-unknown-unknown \
  -C opt-level=3 -C panic=abort -C target-cpu=mvp -Z force-unstable-if-unmarked $SRC/core/src/lib.rs --out-dir wsys-mvp
RUSTC_BOOTSTRAP=1 rustc --edition 2024 --crate-name compiler_builtins --crate-type rlib --target wasm32-unknown-unknown \
  -C opt-level=3 -C panic=abort -C target-cpu=mvp -Z force-unstable-if-unmarked --cfg 'feature="compiler-builtins"' \
  --cfg 'feature="mem"' --extern core=wsys-mvp/libcore.rlib -L wsys-mvp \
  $SRC/compiler-builtins/compiler-builtins/src/lib.rs --out-dir wsys-mvp
```

Después, `python3 ../forgex/build.py` incrusta ambas variantes (base64) en `forgex-doom-orbital.html`.

Si se cambia el tamaño del mapa (`MW`/`MH`) o de las texturas (`T`) en el JS, hay que cambiarlo
también aquí: al cargar, el juego compara `dims()` y usa el motor JS si no coinciden.
