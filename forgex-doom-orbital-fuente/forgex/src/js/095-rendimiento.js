  // ================= RENDIMIENTO: medición y paneles =================
  // perf: medias móviles (ms) por sistema. PERF: anillo con los últimos 1024 fotogramas para percentiles,
  // contadores del fotograma y estadísticas que se recalculan a la frecuencia configurada.
  const perf = { sim: 0, ai: 0, world: 0, sprites: 0, light: 0, comp: 0, hud: 0, total: 0, gpu: 0, thread: 0, rays: 0, logic: 0 };
  const perfAdd = (k, v) => { perf[k] = perf[k] * .92 + v * .08; };
  const PERF = {
    N: 1024, work: new Float32Array(1024), gap: new Float32Array(1024), head: 0, n: 0, tmp: new Float32Array(1024),
    c: { spritesVis: 0, spritesCulled: 0, particles: 0, lights: 0, shadows: 0, draws: 0, instances: 0, uploadBytes: 0, simSteps: 0, aiFull: 0, aiLod: 0, aiFrozen: 0 },
    s: { fps: 0, imgFps: 0, gapAvg: 16.7, gapP99: 0, gapP999: 0, workAvg: 0, workP99: 0, workP999: 0, sd: 0, stutters: 0, bound: '' },
    rust: [0, 0, 0, 0, 0, 0, 0],
    lines: null,
    overlayW: 0,
    t: 0, img: 0, imgT: 0, imgLast: 0, // imágenes nuevas de la escena (con hilos o GPU puede haber menos que fotogramas)
  };
  function perfFrame(workMs, gapMs) {
    const P = PERF; P.work[P.head] = workMs; P.gap[P.head] = gapMs; P.head = (P.head + 1) & (P.N - 1); if (P.n < P.N) P.n++;
  }
  function perfPct(src, n, q) { // percentil q (0..1) de las últimas n muestras
    const P = PERF, t = P.tmp.subarray(0, n);
    for (let k = 0; k < n; k++) t[k] = src[(P.head - 1 - k + P.N) & (P.N - 1)];
    t.sort(); return t[Math.min(n - 1, Math.floor(q * n))];
  }
  function updatePerfLines() {
    const S = PERF.s, C = PERF.c, f = v => (v || 0).toFixed(1), m = memMB();
    const r = PERF.rust;
    const rustActive = wasm && wasm.prof_drain && r && r.length >= 7;
    const rustLine = rustActive
      ? `CPU Rust: World ${f(r[0])} · Light/RT ${f(r[1])} · Sim ${f(r[2])} · AI ${f(r[3])} · Sprites ${f(r[4])} · Upload ${f(r[5])} · Present ${f(r[6])} ms`
      : 'CPU Rust: (inactivo)';

    let staticMB = (wasm && wasm.wasm_bytes_static) ? (wasm.wasm_bytes_static() / 1048576).toFixed(0) : (m.wasm || 0).toFixed(0);
    let liveMB = (wasm && wasm.wasm_bytes_live) ? (wasm.wasm_bytes_live() / 1048576).toFixed(0) : '0';
    let allocs = (wasm && wasm.wasm_alloc_count) ? wasm.wasm_alloc_count() : 0;

    const K = chunkStats();
    const chLine = `Chunks ${CHUNK_XY}×${CHUNK_XY}×${CHUNK_Z}: ${K.total} con bloques · a la vista ${K.visible} · cargados ${K.loaded} (${K.blocks} bloques)${BACKEND === 'webgpu' ? ' en GPU' : ''} · expulsados ${K.evicted} · capa ${K.layer}${CHUNKS.stream ? '' : ' · streaming apagado'}`;

    PERF.lines = [
      ['#9dff7a', `FPS ${S.fps.toFixed(0)}${Math.abs(S.imgFps - S.fps) > 2 ? ' (imágenes nuevas ' + S.imgFps.toFixed(0) + '/s)' : ''} · fotograma ${f(S.gapAvg)} ms · 1 % ${f(S.gapP99)} ms · 0,1 % ${f(S.gapP999)} ms · σ ${f(S.sd)} · tirones ${S.stutters}`],
      ['#e6e2f5', `Trabajo por fotograma ${f(perf.total)} ms (1 % ${f(S.workP99)}) → ${Math.round(1000 / Math.max(.5, perf.total))} FPS posibles · límite: ${S.bound}`],
      ['#e6e2f5', rustLine],
      ['#e6e2f5', `CPU JS: sim ${f(perf.sim)} · ai ${f(perf.ai)} · world ${f(perf.world)} · sprites ${f(perf.sprites)} · comp ${f(perf.comp)} · hud ${f(perf.hud)} · total ${f(perf.total)} · logic ${f(perf.logic)} ms`],
      ['#e6e2f5', `GPU ${f(perf.gpu)} ms${CAPS.gpuTimestamps ? '' : ' (aprox.)'} · subidas ${(C.uploadBytes / 1024).toFixed(0)} KB · pases ${C.draws} · instancias ${C.instances}`],
      ['#e6e2f5', `Memoria: ${m.js != null ? 'JS ' + m.js.toFixed(0) + ' MB · ' : ''}WASM estático ${staticMB} MB · WASM vivo ${liveMB} MB · allocs ${allocs} · GPU ${m.gpu.toFixed(0)} MB`],
      ['#e6e2f5', chLine],
      ['#5ff2e6', `${engineName()} · ${RW}×${RH} (${Math.round(RW / QUALITIES[quality][1] * 100)} %) · RT ${['apagado', '4 luces', 'todas', 'suaves'][EFF.rt]}${EFF.rt < CFG.rt.mode ? ' (AUTO)' : ''} · cámara ${mode3d ? '3D real' : 'por columnas'}`],
    ];

    if (typeof ctx !== 'undefined' && ctx && ctx.measureText) {
      ctx.save();
      ctx.font = PM(600, 11);
      PERF.overlayW = Math.max(...PERF.lines.map(l => ctx.measureText(l[1]).width)) + 16;
      ctx.restore();
    } else {
      PERF.overlayW = 400;
    }
  }
  function perfStats() {
    const P = PERF, S = P.s, n = Math.min(P.n, 600);
    if (n < 10) {
      if (!P.lines) updatePerfLines();
      return;
    }
    let sg = 0, sw = 0, sq = 0;
    for (let k = 0; k < n; k++) { const i = (P.head - 1 - k + P.N) & (P.N - 1); sg += P.gap[i]; sw += P.work[i]; }
    S.gapAvg = sg / n; S.workAvg = sw / n; S.fps = 1000 / S.gapAvg;
    { const now = performance.now(); if (P.imgT) S.imgFps = (P.img - P.imgLast) * 1000 / Math.max(1, now - P.imgT); P.imgT = now; P.imgLast = P.img; }
    for (let k = 0; k < n; k++) { const d = P.gap[(P.head - 1 - k + P.N) & (P.N - 1)] - S.gapAvg; sq += d * d; }
    S.sd = Math.sqrt(sq / n);
    const med = perfPct(P.gap, n, .5);
    S.gapP99 = perfPct(P.gap, n, .99); S.gapP999 = perfPct(P.gap, n, .999);
    S.workP99 = perfPct(P.work, n, .99); S.workP999 = perfPct(P.work, n, .999);
    let st2 = 0; for (let k = 0; k < n; k++) { const g = P.gap[(P.head - 1 - k + P.N) & (P.N - 1)]; if (g > med * 2 && g > 25) st2++; }
    S.stutters = st2;
    // ¿qué limita? (se decide con medias, no con un solo fotograma)
    const cpu = perf.total, gpu = perf.gpu, thr = WORKERS.active ? perf.thread : 0;
    S.bound = BACKEND === 'webgpu' && gpu > cpu * 1.15 ? 'GPU'
      : thr > cpu * 1.15 && thr > S.gapAvg * .8 ? 'hilos de render'
      : EFF.rt > 0 && perf.light > cpu * .45 ? 'luz y RT en el procesador'
      : cpu > S.gapAvg * .85 ? 'procesador'
      : S.gapAvg > 1000 / CAPS.refresh * 1.2 ? 'navegador (tiempo fuera del juego: composición, otras pestañas)'
      : 'pantalla (sincronía vertical)';
    updatePerfLines();
  }
  const memMB = () => {
    const js = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
    const wm = (wasm ? wasm.memory.buffer.byteLength : 0) / 1048576;
    return { js, wasm: wm + (WORKERS.active ? WORKERS.active * WK.stats.mem / 1048576 : 0), gpu: GPUB ? GPUB.bytes / 1048576 : 0 };
  };
  function drawPerf() {
    if (!PERF.lines) updatePerfLines();
    if (!PERF.lines) return;
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = PM(600, 11);
    ctx.fillStyle = 'rgba(4,2,12,.82)'; ctx.fillRect(8, 100, PERF.overlayW || 400, PERF.lines.length * 15 + 8);
    PERF.lines.forEach((l, k) => { ctx.fillStyle = l[0]; ctx.fillText(l[1], 16, 110 + k * 15); });
    ctx.restore();
  }
  function engineName() {
    return BACKEND === 'webgpu' ? 'WebGPU (' + (CAPS.gpuInfo || 'gráfica') + ')'
      : BACKEND === 'rust' ? `Rust + WebAssembly ${WASM_VARIANT === 'simd' ? 'con SIMD' : 'sin SIMD'}${WORKERS.active ? ' · ' + WORKERS.active + ' hilos' : ''}`
      : 'JavaScript';
  }
  // Panel de sistemas activos y de las rutas de respaldo
  function drawSystems() {
    const on = v => v ? 'sí' : 'no', C = PERF.c;
    const lines = [
      `Motor: ${engineName()}`,
      `WebGPU: ${CAPS.webgpu ? (CAPS.gpuFallback ? 'solo adaptador por software' : 'disponible') : 'no (' + (CAPS.gpuError || 'sin soporte') + ')'}`,
      `SIMD: ${on(CAPS.simd)} · workers: ${on(CAPS.workers)} · memoria compartida: ${CAPS.sharedMemory ? 'sí' : 'no (página sin aislamiento entre orígenes)'}`,
      `Cámara: ${mode3d ? '3D real por píxel' : 'raycaster por columnas'} · resolución dinámica: ${CFG.graphics.dynamicRes ? Math.round(resScale * 100) + ' %' : 'no'}`,
      `AUTO: ${CFG.perf.auto ? 'sí, objetivo ' + Math.min(CFG.perf.targetFps, CAPS.refresh) + ' FPS' + (AUTOQ.note ? ' · ' + AUTOQ.note : '') : 'no'}`,
      `Paso fijo: ${CFG.perf.simHz} Hz · IA lejana ${CFG.perf.aiHz} Hz · interpolación ${on(CFG.perf.interpolate)} · LOD de simulación ${on(CFG.perf.lod)} · descarte ${on(CFG.perf.culling)} (${C.spritesCulled} sprites)`,
      `Pool de partículas ${PARTS.n}/${PARTS.cap} · fotogramas en vuelo ${CFG.memory.framesInFlight} · hilos de render ${WORKERS.active || 0}${WORKERS.why ? ' (' + WORKERS.why + ')' : ''}`,
      `RT: ${RT_NAMES[EFF.rt]}${EFF.rt < CFG.rt.mode ? ' (recortado por AUTO)' : ''} · alcance ${CFG.rt.maxDist} m`,
      BACKEND === 'webgpu' ? `RT en GPU: ${CFG.rt.rays} rayos/píxel · temporal ${on(CFG.rt.temporal)} · denoise ${['no', 'bajo', 'medio', 'alto'][CFG.rt.denoise]} · indirecta ${on(CFG.rt.indirect)}` : 'Acumulación temporal, denoise y luz indirecta: solo con WebGPU',
      `Luces dinámicas: hasta ${EFF.lights} · partículas ${['pocas', 'normales', 'muchas'][EFF.parts]} · bloom ${on(CFG.graphics.bloom)} · grano ${on(CFG.graphics.grain)}`,
    ];
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = PM(600, 11);
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 16, y0 = CFG.debug.overlay ? 100 + (PERF.lines ? PERF.lines.length : 8) * 15 + 12 : 100;
    ctx.fillStyle = 'rgba(4,2,12,.82)'; ctx.fillRect(8, y0, w, lines.length * 15 + 8);
    ctx.fillStyle = '#c8c4e0'; lines.forEach((l, k) => ctx.fillText(l, 16, y0 + 10 + k * 15));
    ctx.restore();
  }
