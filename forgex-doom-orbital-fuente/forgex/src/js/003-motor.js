  // ================= MOTOR: estado, resolución y buffers =================
  // Rutas de render, de la más rápida a la más compatible:
  //   webgpu → la tarjeta gráfica hace raycast, luz y RT (si el navegador y la gráfica lo permiten)
  //   rust   → Rust/WebAssembly en el procesador (con SIMD o sin él), opcionalmente repartido en hilos
  //   js     → JavaScript puro (último recurso; siempre funciona)
  const QUALITIES = [['BAJA', 320, 200], ['MEDIA', 480, 300], ['ALTA', 640, 400], ['ULTRA', 800, 500]];
  let quality = CFG.graphics.quality, resScale = 1; // resScale: resolución dinámica que ajusta AUTO
  MAXD = CFG.graphics.drawDistance;
  let wasm = null, gfx = null, LIGHTSV = null, SHADV = null, SPRV = null, PTV = null, g1img = null; // wasm: instancia Rust siempre sincronizada con el mundo; gfx: motor Rust activo (o null)
  let BACKEND = 'js', WASM_VARIANT = ''; // ruta activa y variante del módulo Rust ('simd' o 'scalar')
  const WORKERS = { active: 0, why: '' }; // hilos de render en uso (y por qué no, si no hay)
  // Disposición de los buffers por píxel: índice = x·SX + y·SY (Rust: por columnas; JS: por filas)
  let SX = 1, SY = 1, PXb = null, PYb = null, PZb = null;
  let RW = 0, RH = 0, PROJ = 1, low, lctx, img, glowC, gctx, gimg, g1, g1x, g2, g2x, buf, gbuf, mask, depth, AMB, NRM, LR, LG, LB, CONE;
  // resolución interna: base del preset × escala dinámica; ancho múltiplo de 32 y alto = ancho·5/8
  // (así cuadran los tiles de luz de 16 px, los bloques 4×4 del render 3D y la reducción del bloom)
  function resFor(q, s) { const w = Math.max(192, Math.round(QUALITIES[q][1] * s / 32) * 32); return [w, w * 5 / 8]; }
  function setQuality(q) { quality = q; CFG.graphics.quality = q; applyResolution(true); }
  function applyResolution(force) {
    const [w, h] = resFor(quality, CFG.graphics.dynamicRes ? resScale : 1);
    if (!force && w === RW && h === RH) return;
    RW = w; RH = h; PROJ = (RW / 2) / PL;
    low = mk(RW, RH); lctx = low.getContext('2d');
    glowC = mk(RW, RH); gctx = glowC.getContext('2d');
    g1 = mk(RW / 4 | 0, RH / 4 | 0); g1x = g1.getContext('2d'); g2 = mk(RW / 10 | 0, RH / 10 | 0); g2x = g2.getContext('2d');
    const N = RW * RH;
    if (gfx) { // los buffers viven en la memoria de WebAssembly: JS y Rust trabajan sobre los mismos bytes
      // Rust guarda los buffers por columnas (como los recorre el raycaster) y deja la imagen final, por filas, en OUT
      const B = gfx.memory.buffer;
      SX = RH; SY = 1;
      buf = new Uint32Array(B, gfx.p_buf(), N); gbuf = new Uint32Array(B, gfx.p_gbuf(), N);
      img = new ImageData(new Uint8ClampedArray(B, gfx.p_out(), N * 4), RW, RH); gimg = null;
      depth = new Float32Array(B, gfx.p_depth(), N); AMB = new Float32Array(B, gfx.p_amb(), N); NRM = new Uint8Array(B, gfx.p_nrm(), N);
      mask = PXb = PYb = PZb = LR = LG = LB = CONE = null;
      LIGHTSV = new Float32Array(B, gfx.p_lights(), 16 * 8); SHADV = new Float32Array(B, gfx.p_shad(), 64 * 5);
      g1img = gfx.p_gds ? new ImageData(new Uint8ClampedArray(B, gfx.p_gds(), g1.width * g1.height * 4), g1.width, g1.height) : null;
      SPRV = new Float32Array(B, gfx.p_spr(), gfx.spr_max() * 8);
      { const m = gfx.pt_max(); PTV = { max: m, x: new Float32Array(B, gfx.p_ptx(), m), y: new Float32Array(B, gfx.p_pty(), m), z: new Float32Array(B, gfx.p_ptz(), m), c: new Uint32Array(B, gfx.p_ptc(), m) }; }
      gfx.set_res(RW, RH);
      return;
    }
    SX = 1; SY = RW;
    img = lctx.createImageData(RW, RH); gimg = gctx.createImageData(RW, RH);
    buf = new Uint32Array(img.data.buffer); gbuf = new Uint32Array(gimg.data.buffer);
    mask = new Uint8Array(N); depth = new Float32Array(N);
    PXb = new Float32Array(N); PYb = new Float32Array(N); PZb = new Float32Array(N); AMB = new Float32Array(N); NRM = new Uint8Array(N);
    LR = new Float32Array(N); LG = new Float32Array(N); LB = new Float32Array(N); CONE = new Float32Array(N);
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { // cono de la linterna
      const r = Math.hypot((x - RW / 2) / (RW / 2), (y - RH * .52) / (RW / 2));
      CONE[y * RW + x] = r < .16 ? 1 : Math.max(0, 1 - (r - .16) / .5) ** 2;
    }
  }
  applyResolution(true);
