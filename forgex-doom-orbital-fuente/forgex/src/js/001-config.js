  // ================= CONFIGURACIÓN CENTRAL =================
  // Todas las opciones del motor en un único sitio: valores por defecto seguros, presets, persistencia
  // y la descripción de cada opción (el panel de ajustes se genera a partir de esta lista).
  // Ninguna opción cambia la jugabilidad: solo cómo se dibuja y cómo se reparte el trabajo.
  const CFG_KEY = 'forgex-doom-cfg2';
  const OPTIONS = [
    // sección, clave, etiqueta, tipo, opciones, valor por defecto, [requiere]
    ['graphics', 'backend', 'Motor gráfico', 'select', [['auto', 'Automático'], ['webgpu', 'WebGPU (tarjeta gráfica)'], ['rust', 'Rust + WebAssembly (procesador)'], ['js', 'JavaScript (respaldo)']], 'auto'],
    ['graphics', 'quality', 'Resolución base', 'select', [[0, 'Baja · 320×200'], [1, 'Media · 480×300'], [2, 'Alta · 640×400'], [3, 'Ultra · 800×500']], 2],
    ['graphics', 'dynamicRes', 'Resolución dinámica (la baja AUTO si hace falta)', 'check', null, true],
    ['graphics', 'drawDistance', 'Distancia de dibujo', 'select', [[24, 'Corta'], [32, 'Media'], [40, 'Larga']], 40],
    ['graphics', 'lighting', 'Iluminación dinámica', 'select', [[0, 'Solo ambiente y linterna'], [1, 'Media · 8 luces'], [2, 'Completa · 12 luces']], 2],
    ['graphics', 'particles', 'Partículas', 'select', [[0, 'Pocas'], [1, 'Normales'], [2, 'Muchas']], 2],
    ['graphics', 'bloom', 'Resplandor (bloom)', 'check', null, true],
    ['graphics', 'grain', 'Grano de película', 'check', null, true],
    ['graphics', 'cam3d', 'Cámara 3D real siempre (más costosa)', 'check', null, false],
    ['graphics', 'allowSoftwareGpu', 'Permitir GPU por software', 'check', null, false, 'gpu'],
    ['rt', 'mode', 'Sombras con trazado de rayos', 'select', [[0, 'Apagadas'], [1, 'Las 4 luces más cercanas'], [2, 'Todas las luces'], [3, 'Todas, suaves (luz de área)']], 1],
    ['rt', 'maxDist', 'Distancia máxima con sombras RT', 'select', [[6, 'Cerca (60 m)'], [10, 'Media (100 m)'], [16, 'Lejos (160 m)'], [40, 'Todo lo visible']], 16],
    ['rt', 'rays', 'Rayos de sombra por píxel', 'select', [[1, '1'], [2, '2'], [4, '4']], 1, 'gpu'],
    ['rt', 'temporal', 'Acumulación temporal', 'check', null, true, 'gpu'],
    ['rt', 'denoise', 'Eliminación de ruido', 'select', [[0, 'Apagada'], [1, 'Baja'], [2, 'Media'], [3, 'Alta']], 2, 'gpu'],
    ['rt', 'indirect', 'Luz indirecta (1 rebote)', 'check', null, false, 'gpu'],
    ['perf', 'auto', 'Calidad automática (AUTO)', 'check', null, true],
    ['perf', 'targetFps', 'FPS objetivo de AUTO', 'select', [[30, '30'], [45, '45'], [60, '60'], [90, '90'], [120, '120'], [144, '144']], 60],
    ['perf', 'simHz', 'Frecuencia de la simulación', 'select', [[30, '30 Hz'], [60, '60 Hz'], [120, '120 Hz']], 60],
    ['perf', 'aiHz', 'Frecuencia de la IA lejana (con LOD)', 'select', [[10, '10 Hz'], [15, '15 Hz'], [30, '30 Hz']], 15],
    ['perf', 'interpolate', 'Interpolar movimiento entre pasos', 'check', null, true],
    ['perf', 'lod', 'LOD de simulación (IA lejana más lenta)', 'check', null, true],
    ['perf', 'culling', 'Descartar lo que no se ve', 'check', null, true],
    ['perf', 'statsHz', 'Refresco de estadísticas', 'select', [[5, '5 Hz'], [10, '10 Hz'], [30, '30 Hz']], 10],
    ['memory', 'framesInFlight', 'Fotogramas en vuelo', 'select', [[2, '2 (doble búfer)'], [3, '3 (triple búfer)']], 2],
    ['memory', 'chunkStreaming', 'Cargar en el motor solo los chunks cercanos', 'check', null, true],
    ['threads', 'workers', 'Hilos de render', 'select', [['auto', 'Automático'], [0, 'Ninguno'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], 'auto', 'workers'],
    ['cpu', 'simd', 'SIMD de WebAssembly', 'check', null, true, 'simd'],
    ['debug', 'overlay', 'Mostrar rendimiento', 'check', null, false],
    ['debug', 'systems', 'Mostrar sistemas activos', 'check', null, false],
  ];
  const SECTIONS = { graphics: 'Gráficos', rt: 'Trazado de rayos', perf: 'Rendimiento', memory: 'Memoria', threads: 'Hilos', cpu: 'Procesador', debug: 'Depuración' };
  // Presets: solo tocan opciones visuales y de reparto de trabajo
  const PRESETS = {
    ultra: { name: 'ULTRA', set: { graphics: { quality: 3, drawDistance: 40, lighting: 2, particles: 2, bloom: true, grain: true }, rt: { mode: 3, maxDist: 16, rays: 2, temporal: true, denoise: 2, indirect: true } } },
    alta: { name: 'ALTA', set: { graphics: { quality: 2, drawDistance: 40, lighting: 2, particles: 2, bloom: true, grain: true }, rt: { mode: 1, maxDist: 16, rays: 1, temporal: true, denoise: 2, indirect: false } } },
    media: { name: 'MEDIA', set: { graphics: { quality: 1, drawDistance: 40, lighting: 2, particles: 1, bloom: true, grain: true }, rt: { mode: 1, maxDist: 10, rays: 1, temporal: true, denoise: 1, indirect: false } } },
    baja: { name: 'BAJA', set: { graphics: { quality: 1, drawDistance: 32, lighting: 1, particles: 1, bloom: true, grain: false }, rt: { mode: 0, maxDist: 10, rays: 1, temporal: false, denoise: 0, indirect: false } } },
    rendimiento: { name: 'RENDIMIENTO', set: { graphics: { quality: 0, drawDistance: 32, lighting: 1, particles: 0, bloom: false, grain: false }, rt: { mode: 0, maxDist: 6, rays: 1, temporal: false, denoise: 0, indirect: false } } },
  };
  const PRESET_ORDER = ['ultra', 'alta', 'media', 'baja', 'rendimiento'];
  function defaultConfig() {
    // tamaño real de los chunks de 025-mundo.js (fijo, no es una opción) y radio horizontal de la ventana en chunks
    const c = { preset: 'auto', chunks: { sizeX: 32, sizeY: 32, sizeZ: 8, streamRadius: 2 } };
    for (const [s, k, , , , def] of OPTIONS) (c[s] = c[s] || {})[k] = def;
    return c;
  }
  const CFG = (() => {
    const c = defaultConfig();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(CFG_KEY)); } catch (_) {}
    if (!saved) { // ajustes de la versión anterior del juego
      try { const o = JSON.parse(localStorage.getItem('forgex-doom-cfg'));
        if (o) saved = { preset: 'custom', graphics: { quality: o.q, drawDistance: o.dist, bloom: o.bloom, grain: o.grain, cam3d: o.cam3d, backend: o.engine === 'js' ? 'js' : 'auto' }, rt: { mode: o.rt }, perf: { auto: o.auto }, debug: { overlay: o.perf } };
      } catch (_) {}
    }
    if (saved && typeof saved === 'object') {
      if (typeof saved.preset === 'string') c.preset = saved.preset;
      for (const [s, k, , type, opts] of OPTIONS) { const v = saved[s] && saved[s][k];
        if (v === undefined || v === null) continue;
        if (type === 'check') c[s][k] = !!v; else if (opts.some(o => o[0] === v)) c[s][k] = v; }
    }
    c.loaded = !!saved;
    return c;
  })();
  const saveCfg = () => { try { const { loaded, ...o } = CFG; localStorage.setItem(CFG_KEY, JSON.stringify(o)); } catch (_) {} };
  function applyPreset(name) {
    const P = PRESETS[name]; if (!P) return;
    for (const s in P.set) Object.assign(CFG[s], P.set[s]);
    CFG.preset = name;
  }
  // ¿coincide la configuración actual con algún preset?
  function matchingPreset() {
    for (const name of PRESET_ORDER) { const P = PRESETS[name].set; let ok = true;
      for (const s in P) for (const k in P[s]) if (CFG[s][k] !== P[s][k]) ok = false;
      if (ok) return name; }
    return 'custom';
  }
  // Valores efectivos de este fotograma: la configuración recortada por AUTO y por lo que soporta el motor activo
  const EFF = { rt: 0, lights: 12, parts: 2, scale: 1 };
  const RT_NAMES = ['apagado', 'sombras de las 4 luces más cercanas', 'sombras de todas las luces', 'sombras suaves de todas las luces'];

  let lastSyncTime = 0;

  // Sincroniza la configuración central de JS hacia las estructuras C congeladas en Rust
  function syncConfigToRust(X) {
    if (!X || !X.get_gfx_cfg || !X.get_perf_cfg) return;
    lastSyncTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const B = X.memory.buffer;
    const gfxPtr = X.get_gfx_cfg();
    const gfx = new Uint32Array(B, gfxPtr, 32);
    const f32g = new Float32Array(B, gfxPtr, 32);
    gfx[0] = { webgpu: 1, rust: 2, js: 3 }[typeof BACKEND !== 'undefined' ? BACKEND : (CFG.graphics.backend === 'auto' ? 'js' : CFG.graphics.backend)] ?? 0;
    gfx[1] = CFG.graphics.quality ?? 2;
    gfx[2] = CFG.graphics.dynamicRes ? 1 : 0;
    f32g[3] = Number(CFG.graphics.drawDistance ?? 40);
    gfx[4] = CFG.graphics.lighting ?? 2;
    gfx[5] = CFG.graphics.particles ?? 2;
    gfx[6] = CFG.graphics.bloom ? 1 : 0;
    gfx[7] = CFG.graphics.grain ? 1 : 0;
    gfx[8] = CFG.graphics.cam3d ? 1 : 0;
    gfx[9] = CFG.rt.mode ?? 1;
    f32g[10] = Number(CFG.rt.maxDist ?? 16);
    gfx[11] = CFG.rt.rays ?? 1;
    gfx[12] = CFG.rt.temporal ? 1 : 0;
    gfx[13] = CFG.rt.denoise ?? 2;
    gfx[14] = CFG.rt.indirect ? 1 : 0;
    gfx[15] = CFG.chunks && CFG.chunks.sizeX ? CFG.chunks.sizeX : 16;
    gfx[16] = CFG.chunks && CFG.chunks.sizeY ? CFG.chunks.sizeY : 16;
    gfx[17] = CFG.chunks && CFG.chunks.sizeZ ? CFG.chunks.sizeZ : 16;
    f32g[18] = Number(CFG.chunks && CFG.chunks.streamRadius ? CFG.chunks.streamRadius : 12);
    gfx[19] = CFG.graphics.allowSoftwareGpu ? 1 : 0;

    X.set_gfx_cfg(gfxPtr);

    const perfPtr = X.get_perf_cfg();
    const perf = new Uint32Array(B, perfPtr, 12);
    perf[0] = CFG.perf.auto ? 1 : 0;
    perf[1] = CFG.perf.targetFps ?? 60;
    perf[2] = CFG.perf.simHz ?? 60;
    perf[3] = CFG.perf.aiHz ?? 15;
    perf[4] = CFG.perf.interpolate ? 1 : 0;
    perf[5] = CFG.perf.lod ? 1 : 0;
    perf[6] = CFG.perf.culling ? 1 : 0;
    perf[7] = CFG.perf.statsHz ?? 10;
    perf[8] = CFG.memory && CFG.memory.framesInFlight ? CFG.memory.framesInFlight : 2;
    perf[9] = CFG.threads && CFG.threads.workers === 'auto' ? 0 : (Number(CFG.threads && CFG.threads.workers) || 0);
    perf[10] = CFG.cpu && CFG.cpu.simd ? 1 : 0;

    X.set_perf_cfg(perfPtr);
  }
