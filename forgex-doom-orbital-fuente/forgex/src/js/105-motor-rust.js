  // ================= RUTAS DE RENDER Y ARRANQUE =================
  // Rust/WebAssembly se incluye en dos variantes: con SIMD (rápida) y WebAssembly 1.0 sin SIMD (compatible con
  // navegadores antiguos). Si ninguna carga, el juego usa el motor JavaScript. La instancia Rust (wasm) se mantiene
  // sincronizada con el mundo aunque la ruta activa sea otra, así cambiar de motor es instantáneo.
  const WASM_B64 = { simd: '@@WASM_SIMD@@', scalar: '@@WASM_SCALAR@@' };
  const WASM_MOD = {};
  const WHY = { webgpu: '', rust: '', simd: '' }; // motivo por el que una ruta no está disponible
  const b64bytes = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  async function wasmModule(variant) {
    if (WASM_MOD[variant]) return WASM_MOD[variant];
    const src = WASM_B64[variant];
    if (!src || src.startsWith('@@')) throw new Error('variante no incluida');
    const bytes = b64bytes(src);
    if (!WebAssembly.validate(bytes)) throw new Error('el navegador no admite esta variante');
    return WASM_MOD[variant] = await WebAssembly.compile(bytes);
  }
  // texturas, cielo y constantes: se copian una vez a la memoria de cada instancia
  function uploadAssets(X) {
    if (X.dims() !== MW * 10000 + T || !X.sky_dims || X.sky_dims() !== SKW * 10000 + SKH) throw new Error('dimensiones distintas entre JS y Rust');
    const B = X.memory.buffer, TT = T * T;
    const tlv = new Uint32Array(B, X.p_texlv(), 8 * NL * TT), tem = new Uint8Array(B, X.p_texem(), 8 * TT), tgl = new Uint32Array(B, X.p_texgl(), 8 * TT);
    const rim = new Uint32Array(B, X.p_rim(), 8 * NL), rimg = new Uint32Array(B, X.p_rimg(), 8 * NL);
    for (let k = 1; k <= 7; k++) {
      for (let l = 0; l < NL; l++) tlv.set(TEX[k].lv[l], (k * NL + l) * TT);
      tem.set(TEX[k].em, k * TT); tgl.set(TEX[k].gl, k * TT);
      if (RIM[k]) for (let l = 0; l < NL; l++) { rim[k * NL + l] = RIM[k][l]; rimg[k * NL + l] = RIMG[k][l]; }
    }
    new Uint32Array(B, X.p_sky(), SKW * SKH).set(sky);
    X.set_consts(PADG, DARK);
  }
  // copia del mundo cargado (al crear una instancia o al cambiar de variante): los chunks de la ventana, o todos sin streaming
  function syncWorld(X) {
    X.w_reset();
    forLoadedBlocks(b => X.w_add(b.x, b.y, b.zb, b.zt, b.tex, blockFlags(b), b.gx, b.gy, b.gw, b.gh, b.ao, 0));
  }
  async function newRustInstance(variant) {
    const imports = {
      env: {
        now_import: () => performance.now(),
      },
    };
    const X = (await WebAssembly.instantiate(await wasmModule(variant), imports)).exports;
    uploadAssets(X); syncWorld(X);
    if (ATL.used) atlasTo(X, 0, ATL.used);
    syncConfigToRust(X);
    return X;
  }
  // Carga la variante Rust que corresponde a la configuración (SIMD si se puede y está activado)
  async function ensureRust() {
    const want = CAPS.simd && CFG.cpu.simd ? 'simd' : 'scalar';
    if (wasm && WASM_VARIANT === want) return true;
    for (const v of want === 'simd' ? ['simd', 'scalar'] : ['scalar']) {
      try { wasm = await newRustInstance(v); WASM_VARIANT = v; WHY.rust = ''; if (v === 'simd') WHY.simd = ''; return true; }
      catch (err) { console.warn(`Motor Rust (${v}) no disponible:`, err); if (v === 'simd') WHY.simd = String(err.message || err); WHY.rust = String(err.message || err); }
    }
    wasm = null; WASM_VARIANT = ''; return false;
  }
  // Elige la ruta de render. pref: 'auto' | 'webgpu' | 'rust' | 'js'. Si la preferida falla, baja a la siguiente.
  async function setBackend(pref) {
    const order = { auto: ['webgpu', 'rust', 'js'], webgpu: ['webgpu', 'rust', 'js'], rust: ['rust', 'js'], js: ['js'] }[pref] || ['rust', 'js'];
    await ensureRust();
    let chosen = 'js';
    for (const b of order) {
      if (b === 'webgpu') { if (!wasm || (pref === 'auto' && !gpuAutoOk())) continue; if (await startGPU()) { chosen = 'webgpu'; break; } continue; }
      if (b === 'rust') { if (wasm) { chosen = 'rust'; break; } continue; }
      chosen = 'js'; break;
    }
    if (chosen !== 'webgpu') stopGPU();
    BACKEND = chosen;
    gfx = chosen === 'rust' ? wasm : null;
    if (wasm) syncConfigToRust(wasm);
    applyResolution(true);
    computeEff();
    configureWorkers();
    syncSettingsUI();
    return chosen;
  }
  // Frecuencia del monitor: mediana de los intervalos entre fotogramas mientras el juego aún no dibuja nada
  function measureRefresh() {
    return new Promise(res => { const ts = []; const f = t => { ts.push(t); if (ts.length < 24) requestAnimationFrame(f); else {
      const g = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b), med = g[g.length >> 1];
      if (med > 3 && med < 60) CAPS.refresh = Math.round(1000 / med); res(); } };
      requestAnimationFrame(f); setTimeout(res, 1500); });
  }
  // Calibración del preset automático: se dibujan unos fotogramas de prueba en ALTA con sombras RT de 4 luces
  // y se elige el preset más alto que, según el tiempo medido, cabe en el presupuesto del objetivo de FPS.
  // (Es una estimación: AUTO sigue ajustando durante la partida.)
  const CALIB = { ms: 0, preset: '', why: '' };
  async function calibratePreset() {
    const q0 = quality, e0 = { ...EFF }, s0 = resScale;
    try {
      quality = 2; resScale = 1; applyResolution(true);
      EFF.rt = BACKEND === 'js' ? 0 : 1; EFF.lights = 12; EFF.parts = 2;
      const ts = [];
      for (let k = 0; k < 10; k++) {
        const t0 = performance.now();
        renderWorld(); lctx.putImageData(img, 0, 0); ctx.drawImage(low, 0, 0, W, H);
        if (gfx && g1img) { gfx.bloom_down(RW, RH, 0, RW); g1x.putImageData(g1img, 0, 0); }
        const t1 = await gpuFrameDone(t0);
        if (k >= 4) ts.push(t1 - t0);
      }
      ts.sort((a, b) => a - b);
      const t = ts[ts.length >> 1], B = .8 * 1000 / Math.min(CFG.perf.targetFps, CAPS.refresh);
      CALIB.ms = t;
      CALIB.preset = 3.1 * t < B ? 'ultra' : t < B ? 'alta' : .6 * t < B ? 'media' : .45 * t < B ? 'baja' : 'rendimiento';
      CALIB.why = `un fotograma de prueba en ALTA con RT tardó ${t.toFixed(1)} ms (presupuesto ${B.toFixed(1)} ms)`;
    } catch (err) { console.warn('Calibración fallida:', err); CALIB.preset = autoPresetFor(BACKEND); CALIB.why = 'calibración fallida; preset según núcleos y memoria'; }
    quality = q0; resScale = s0; Object.assign(EFF, e0); applyResolution(true);
    return CALIB.preset;
  }
  async function initEngine() {
    await Promise.all([probeWebGPU(), measureRefresh()]);
    await setBackend(CFG.graphics.backend);
    if (CFG.preset === 'auto') { applyPreset(await calibratePreset()); CFG.preset = 'auto'; }
    MAXD = CFG.graphics.drawDistance;
    if (quality !== CFG.graphics.quality) setQuality(CFG.graphics.quality);
    computeEff(); syncSettingsUI();
  }
  const go = () => requestAnimationFrame(t => { last = t; frame(t); });
  const fontsReady = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('700 22px Silkscreen'), document.fonts.load('600 16px "IBM Plex Mono"')]).catch(() => {}) : Promise.resolve();
  Promise.all([fontsReady, initEngine().catch(err => console.error('Arranque del motor:', err))]).then(go, go);

  // Ganchos para pruebas automáticas
  window.__doom = { spawn: (...a) => spawn(...a), addItem: (...a) => addItem(...a), setQuality, setBackend, setOption: (...a) => setOption(...a), choosePreset: n => choosePreset(n),
    cfg: CFG, EFF, PERF, CAPS, AUTOQ, WHY, CALIB, perfStats, calibratePreset, sprites: () => ({ impFrames, skullFrames, cacoFrames, chestFrames }),
    syncConfigToRust: () => syncConfigToRust(wasm), get_gfx_cfg: () => wasm && wasm.get_gfx_cfg ? wasm.get_gfx_cfg() : 0, get_perf_cfg: () => wasm && wasm.get_perf_cfg ? wasm.get_perf_cfg() : 0,
    get wasm() { return wasm; },
    get perf() { return perf; }, get engine() { return BACKEND; }, get variant() { return WASM_VARIANT; }, get quality() { return quality; }, get res() { return [RW, RH]; },
    get lights() { return lights; }, get st() { return st; }, get ships() { return ships; }, get gen() { return gen; }, get parts() { return PARTS.n; },
    get CAM() { return CAM; }, get FR() { return FR; }, get sprN() { return sprN; }, get SPRQ() { return SPRQ; },
    get px() { return px; }, get py() { return py; }, get camZ() { return camZ; }, prepareFrame, renderWorld, rustRender, gpuRender,
    nextStep, makeFarlands, plat, safeSpot, CHUNKS, chunkStats, chunkWindow, chunkLayer, streamChunks, forLoadedBlocks, pruneWorld, setChunkStreaming, CHUNK_XY, CHUNK_Z, get WK() { return WK; }, get director() { return DIR; }, directorTick, directorBeat, directorNote, directorSummary, spawnChaser, CHASER, RHYTHM_SHARE, get WORKERS() { return WORKERS; }, R_EXPLORE, chanceAt, contentAt, bandOf, regionAt, axisT, C, R_MAX, MW, get cells() { return cells; },
    tp: (x, y, z, a) => {
      st.px = x; st.py = y; st.pz = z; st.pa = a; st.vz = 0; st.ox = undefined; started = true;
      st.cp = [x, y, z]; st.healLock = 0;
    } };
