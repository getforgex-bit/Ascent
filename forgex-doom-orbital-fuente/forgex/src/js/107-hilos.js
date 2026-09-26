  // ================= HILOS DE RENDER (Web Workers) =================
  // Con el motor Rust, la imagen se puede repartir en franjas verticales entre varios hilos. Cada hilo tiene su propia
  // instancia de Rust con una réplica del mundo (sin memoria compartida: esta página no puede activar el aislamiento
  // entre orígenes que exige SharedArrayBuffer). El hilo principal simula, prepara el fotograma (cámara, sprites,
  // luces, chispas) y lo envía; los hilos devuelven sus franjas en búferes transferibles que se reciclan.
  // Coste: un fotograma más de latencia y ~60 MB de memoria por hilo. Si algo falla, se vuelve a un solo hilo.
  const WORKER_SRC = '@@WORKER:render@@';
  const WK = { list: [], ready: 0, id: 0, parts: new Map(), shown: 0, next: null, free: [], atlas: [], sentAt: new Map(), url: null, gen: 0, stats: { ms: 0, rays: 0, mem: 0, blocks: [] } };
  function workersWanted() {
    const c = CFG.threads.workers;
    if (!CAPS.workers) return [0, 'el navegador no permite hilos'];
    if (BACKEND !== 'rust' || !wasm || !WASM_MOD[WASM_VARIANT]) return [0, BACKEND === 'webgpu' ? 'con WebGPU el trabajo pesado lo hace la gráfica' : 'solo con el motor Rust'];
    if (c === 0) return [0, 'desactivados en los ajustes'];
    if (c === 'auto') {
      const n = Math.min(4, CAPS.cores - 1, Math.floor((CAPS.memGB || 8) / 2));
      if (n < 2) return [0, `automático: con ${CAPS.cores} núcleos lógicos no compensa (un hilo más cuesta ~60 MB y un fotograma de latencia)`];
      return [n, ''];
    }
    return [Math.max(0, Math.min(8, c | 0)), ''];
  }
  function stopWorkers(why) {
    for (const w of WK.list) { try { w.terminate(); } catch (_) {} }
    WK.list = []; WK.ready = 0; WK.parts.clear(); WK.sentAt.clear(); WK.next = null; WK.free = []; WK.atlas = []; WK.gen++;
    WJ.on = false; WJ.ops = [];
    WORKERS.active = 0; WORKERS.why = why || ''; perf.thread = 0;
  }
  // diario con el mundo cargado ahora mismo (para iniciar una réplica): los mismos chunks que tiene el hilo principal
  function worldSnapshot() {
    const a = [];
    forLoadedBlocks(b => a.push(1, b.x, b.y, b.zb, b.zt, b.tex, blockFlags(b), b.gx, b.gy, b.gw, b.gh, b.ao, 0));
    return Float32Array.from(a);
  }
  function configureWorkers() {
    const [n, why] = workersWanted();
    if (n === WK.list.length && n > 0 && WK.variant === WASM_VARIANT) return;
    stopWorkers(why);
    if (!n) { syncSettingsUI(); return; }
    let url;
    try { url = WK.url || (WK.url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))); }
    catch (err) { stopWorkers('no se pudo preparar el código de los hilos'); return; }
    const gen = WK.gen, B = wasm.memory.buffer, TT = T * T;
    // recursos que cada hilo copia a su instancia (una sola vez)
    const base = {
      t: 'init', module: WASM_MOD[WASM_VARIANT],
      texlv: new Uint32Array(B, wasm.p_texlv(), 8 * NL * TT).slice(), texem: new Uint8Array(B, wasm.p_texem(), 8 * TT).slice(),
      texgl: new Uint32Array(B, wasm.p_texgl(), 8 * TT).slice(), rim: new Uint32Array(B, wasm.p_rim(), 8 * NL).slice(),
      rimg: new Uint32Array(B, wasm.p_rimg(), 8 * NL).slice(), sky: new Uint32Array(B, wasm.p_sky(), SKW * SKH).slice(), padg: PADG, dark: DARK,
      world: worldSnapshot(), atlas: [[0, ATL.data.slice(0, ATL.used)]],
    };
    WJ.on = true; WJ.ops = []; // desde aquí, cada cambio del mundo se anota para las réplicas
    WK.variant = WASM_VARIANT; WORKERS.why = `iniciando ${n} hilos…`;
    const fail = msg => { if (gen !== WK.gen) return; console.warn('Hilos de render desactivados:', msg); stopWorkers(msg); gfx = wasm; applyResolution(true); syncSettingsUI(); };
    for (let k = 0; k < n; k++) {
      let w;
      try { w = new Worker(url); } catch (err) { fail('la página no permite crear hilos (' + (err && err.name || 'error') + ')'); return; }
      w.onerror = e => { e.preventDefault && e.preventDefault(); fail('un hilo no pudo arrancar: ' + (e.message || 'error de carga')); };
      w.onmessageerror = () => fail('mensaje dañado entre hilos');
      w.onmessage = e => onWorkerMsg(e.data, gen);
      try { w.postMessage({ ...base, k }); } catch (err) { fail('no se pudo enviar el motor al hilo (' + (err && err.name || 'error') + ')'); return; }
      WK.list.push(w); WK.free.push([]);
    }
  }
  function onWorkerMsg(d, gen) {
    if (gen !== WK.gen) return;
    if (d.t === 'ready') {
      if (++WK.ready === WK.list.length) { WORKERS.active = WK.list.length; WORKERS.why = ''; WK.id = WK.shown = 0; syncSettingsUI(); }
      return;
    }
    if (d.t === 'error') { stopWorkers('un hilo falló: ' + d.msg); applyResolution(true); syncSettingsUI(); return; }
    if (d.t !== 'done') return;
    let p = WK.parts.get(d.id); if (!p) { p = []; WK.parts.set(d.id, p); }
    p.push(d);
    if (p.length < WK.list.length) return;
    WK.parts.delete(d.id); WK.sentAt.delete(d.id);
    let ms = 0, rays = 0, w = 0, s = 0, l = 0;
    for (const q of p) { ms = Math.max(ms, q.ms[4]); w = Math.max(w, q.ms[0]); s = Math.max(s, q.ms[1]); l = Math.max(l, q.ms[2]); rays += q.rays; WK.stats.mem = q.mem; }
    WK.stats.blocks = p.map(q => q.blocks); // bloques de cada réplica: deben coincidir con los del hilo principal
    perfAdd('thread', ms); perfAdd('world', w); perfAdd('sprites', s); perfAdd('light', l); perf.rays = rays;
    // fotogramas antiguos que llegan tarde: sus búferes se reciclan y no se muestran
    if (d.id <= WK.shown || (WK.next && WK.next.id > d.id)) { recycle(p); return; }
    if (WK.next) recycle(WK.next.p);
    WK.next = { id: d.id, p };
  }
  function recycle(p) { for (const q of p) { const f = WK.free[q.k]; if (f && f.length < 4) f.push([q.out, q.gds]); } }
  // Envía el fotograma a los hilos (si no hay demasiados en vuelo)
  function workersRender(tPrep) {
    perfAdd('sprites', tPrep);
    const now = performance.now();
    for (const [id, t] of WK.sentAt) if (now - t > 2500) { stopWorkers('los hilos dejaron de responder'); gfx = wasm; applyResolution(true); syncSettingsUI(); return rustRender(0); }
    const inFlight = WK.sentAt.size, maxInFlight = CFG.memory.framesInFlight - 1;
    if (inFlight >= maxInFlight) { PERF.c.draws = 0; return; } // la GPU/CPU va por detrás: este fotograma no se envía
    const id = ++WK.id, N = WK.list.length;
    const cam = new Float32Array([px, py, camZ, FR.dirx, FR.diry, FR.plx, FR.ply, FR.pa, hor, CAM.fx, CAM.fy, CAM.fz, CAM.rx, CAM.ry, CAM.ux, CAM.uy, CAM.uz, CAM.cy]);
    const npt = Math.min(PARTS.n, 4096);
    const journal = WJ.ops.length ? Float32Array.from(WJ.ops) : null; WJ.ops = [];
    const atlas = WK.atlas.length ? WK.atlas : null; WK.atlas = [];
    const msg = { t: 'frame', id, cam, mode3d, rw: RW, rh: RH, acid: acidOff, maxd: MAXD, pl: PL,
      sprN, spr: SPRQ.slice(0, sprN * 8), npt, ptx: PARTS.x.slice(0, npt), pty: PARTS.y.slice(0, npt), ptz: PARTS.z.slice(0, npt), ptc: PARTS.c.slice(0, npt),
      nl: FR.nl, ns: FR.ns, lights: FR.LV.slice(0, FR.nl * 8), shad: FR.SV.slice(0, FR.ns * 5), lamp: st.lamp ? 1 : 0, rt: EFF.rt, rtmax: CFG.rt.maxDist,
      bloom: CFG.graphics.bloom, journal, atlas };
    let upload = 0;
    for (let k = 0; k < N; k++) {
      const x0 = Math.round(RW * k / N / 16) * 16, x1 = k === N - 1 ? RW : Math.round(RW * (k + 1) / N / 16) * 16;
      const f = WK.free[k].pop(), tr = [];
      const m = { ...msg, x0, x1, out: f ? f[0] : null, gds: f ? f[1] : null };
      if (m.out) tr.push(m.out); if (m.gds) tr.push(m.gds);
      try { WK.list[k].postMessage(m, tr); } catch (err) { stopWorkers('no se pudo enviar el fotograma'); gfx = wasm; applyResolution(true); return; }
      upload += (x1 - x0) * RH * 4;
    }
    WK.sentAt.set(id, now);
    PERF.c.draws = N; PERF.c.uploadBytes = upload;
  }
  function workersAtlas(off, N) { if (WK.list.length) WK.atlas.push([off, ATL.data.slice(off, off + N)]); }
  // Sube al canvas el último fotograma completo de los hilos (si llegó uno nuevo). Devuelve true si hay imagen.
  function workersPresent() {
    const f = WK.next; if (!f) return WK.shown > 0;
    WK.next = null;
    const ok = f.p.every(q => q.rw === RW && q.rh === RH);
    if (ok) for (const q of f.p) {
      const sw = q.x1 - q.x0;
      lctx.putImageData(new ImageData(new Uint8ClampedArray(q.out, 0, sw * RH * 4), sw, RH), q.x0, 0);
      if (q.gds && CFG.graphics.bloom) g1x.putImageData(new ImageData(new Uint8ClampedArray(q.gds, 0, (sw >> 2) * (RH >> 2) * 4), sw >> 2, RH >> 2), q.x0 >> 2, 0);
    }
    recycle(f.p);
    if (ok) WK.shown = f.id;
    return WK.shown > 0;
  }
