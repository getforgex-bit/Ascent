  // ================= PANEL DE AJUSTES =================
  // Se genera a partir de OPTIONS (001-config.js): una opción nueva aparece aquí sin tocar el HTML.
  // Las opciones que dependen de algo que el navegador no tiene (WebGPU, hilos, SIMD) se muestran desactivadas
  // con el motivo, en lugar de esconderse.
  const $ = id => document.getElementById(id);
  const sBody = $('s-body'), sPre = $('s-pre'), sEngine = $('s-engine'), sCaps = $('s-caps'), sSync = $('s-sync');
  const CTRL = {};
  const REQ_OK = { gpu: () => CAPS.webgpu, workers: () => CAPS.workers, simd: () => CAPS.simd };
  const REQ_NO = { gpu: 'tu navegador o tu gráfica no ofrecen WebGPU', workers: 'el navegador no permite hilos', simd: 'el navegador no soporta WebAssembly SIMD' };
  const parseOpt = (opts, s) => { const o = opts.find(o => String(o[0]) === s); return o ? o[0] : opts[0][0]; };
  function buildSettings() {
    sPre.innerHTML = '<option value="auto">Automático (según tu equipo)</option>'
      + PRESET_ORDER.map(n => `<option value="${n}">${PRESETS[n].name}</option>`).join('') + '<option value="custom">Personalizado</option>';
    for (const sec in SECTIONS) {
      const fs = document.createElement('fieldset'), lg = document.createElement('legend');
      lg.textContent = SECTIONS[sec]; fs.append(lg);
      for (const [s, k, label, type, opts, , req] of OPTIONS) {
        if (s !== sec) continue;
        const lab = document.createElement('label'); let el;
        if (type === 'check') { lab.className = 'chk'; el = document.createElement('input'); el.type = 'checkbox'; const t = document.createElement('span'); t.textContent = label; lab.append(el, t); }
        else {
          el = document.createElement('select');
          for (const [v, t] of opts) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; el.append(o); }
          lab.append(label, el);
        }
        const note = document.createElement('small'); note.className = 'req'; lab.append(note);
        el.addEventListener('change', () => setOption(s, k, type === 'check' ? el.checked : parseOpt(opts, el.value)));
        CTRL[s + '.' + k] = { el, type, req, note };
        fs.append(lab);
      }
      sBody.append(fs);
    }
    sPre.addEventListener('change', () => choosePreset(sPre.value));
    $('s-reset').addEventListener('click', () => { const d = defaultConfig(); for (const s in SECTIONS) Object.assign(CFG[s], d[s]); CFG.preset = 'auto'; choosePreset('auto'); });
  }
  // Cambia una opción, la aplica al motor y la guarda
  function setOption(s, k, v) {
    CFG[s][k] = v;
    CFG.preset = matchingPreset();
    applyCfg(s + '.' + k);
    syncConfigToRust(typeof wasm !== 'undefined' ? wasm : null);
    saveCfg(); syncSettingsUI();
  }
  function choosePreset(name) {
    if (name === 'custom') { CFG.preset = 'custom'; saveCfg(); syncSettingsUI(); return; }
    applyPreset(name === 'auto' ? (CALIB.preset || autoPresetFor(BACKEND)) : name);
    if (name === 'auto') { CFG.preset = 'auto'; CFG.perf.auto = true; }
    applyCfg('*');
    syncConfigToRust(typeof wasm !== 'undefined' ? wasm : null);
    saveCfg(); syncSettingsUI();
  }
  // Lleva la configuración al motor. Los cambios de ruta de render o de variante Rust son asíncronos.
  function applyCfg(key) {
    MAXD = CFG.graphics.drawDistance;
    if (key === 'graphics.backend' || key === 'cpu.simd') { setBackend(CFG.graphics.backend).then(() => { saveCfg(); syncSettingsUI(); }); return; }
    if (key === 'threads.workers' || key === 'memory.framesInFlight' || key === '*') configureWorkers();
    if (quality !== CFG.graphics.quality) setQuality(CFG.graphics.quality);
    AUTOQ.level = Math.min(AUTOQ.level, AUTO_LEVELS.length - 1);
    computeEff();
    syncConfigToRust(typeof wasm !== 'undefined' ? wasm : null);
  }
  function syncSettingsUI() {
    qLabel();
    sPre.value = CFG.preset === 'auto' ? 'auto' : matchingPreset();
    for (const id in CTRL) {
      const c = CTRL[id], [s, k] = id.split('.'), v = CFG[s][k];
      if (c.type === 'check') c.el.checked = !!v; else c.el.value = String(v);
      let dis = c.req && !REQ_OK[c.req](), note = dis ? REQ_NO[c.req] : '';
      if (!dis && c.req === 'gpu' && BACKEND !== 'webgpu') note = 'solo tiene efecto con el motor WebGPU';
      if (id === 'rt.mode' && BACKEND === 'js') { dis = true; note = 'necesita el motor Rust o WebGPU'; }
      if (id === 'rt.mode' && !dis && EFF.rt < CFG.rt.mode) note = `ahora AUTO lo recorta a: ${RT_NAMES[EFF.rt]}`;
      if (id === 'graphics.cam3d' && BACKEND === 'js') { dis = true; note = 'necesita el motor Rust o WebGPU'; }
      if (id === 'threads.workers' && !dis && WORKERS.why) note = WORKERS.why;
      if (id === 'graphics.quality' && resScale < 1) note = `resolución dinámica: ${RW}×${RH} (${Math.round(resScale * 100)} %)`;
      c.el.disabled = !!dis; c.note.textContent = note ? '(' + note + ')' : '';
    }
    const be = CTRL['graphics.backend'];
    if (be) for (const o of be.el.options) o.disabled = (o.value === 'webgpu' && !CAPS.webgpu) || (o.value === 'rust' && !wasm);
    sEngine.textContent = `Motor activo: ${engineName()}.`
      + (CFG.graphics.backend !== 'auto' && CFG.graphics.backend !== BACKEND ? ` Elegiste «${CFG.graphics.backend}», pero no está disponible: ${WHY[CFG.graphics.backend] || 'no cargó'}.` : '');
    sCaps.textContent = `Detectado: WebGPU ${CAPS.webgpu ? 'sí' + (CAPS.gpuFallback ? ' (adaptador por software)' : '') + (CAPS.gpuInfo ? ' · ' + CAPS.gpuInfo : '') : 'no (' + (CAPS.gpuError || 'sin soporte') + ')'}`
      + ` · WebAssembly ${CAPS.wasm ? 'sí' : 'no'} · SIMD ${CAPS.simd ? 'sí' : 'no'} · ${CAPS.cores} núcleos lógicos${CAPS.memGB ? ' · ~' + CAPS.memGB + ' GB de memoria' : ''}`
      + ` · hilos ${CAPS.workers ? 'sí' : 'no'} · memoria compartida ${CAPS.sharedMemory ? 'sí' : 'no'} · monitor ~${CAPS.refresh} Hz.`
      + (CALIB.preset ? ` Preset automático: ${PRESETS[CALIB.preset].name} (${CALIB.why}).` : '');
    if (sSync) {
      let rustBackend = 'N/A';
      let isSynced = false;
      if (typeof wasm !== 'undefined' && wasm && wasm.get_gfx_cfg) {
        const u32 = new Uint32Array(wasm.memory.buffer, wasm.get_gfx_cfg(), 1);
        const bMap = ['auto', 'webgpu', 'rust', 'js'];
        rustBackend = bMap[u32[0]] || 'desconocido';
        isSynced = (rustBackend === CFG.graphics.backend);
      }
      const dt = typeof lastSyncTime !== 'undefined' && lastSyncTime ? (performance.now() - lastSyncTime).toFixed(0) : '0';
      sSync.textContent = `Config sincronizada con Rust: ${isSynced ? 'sí' : 'no'} (G_CFG.backend: ${rustBackend}, última vez: ${dt} ms).`;
    }
  }
  buildSettings();
