// Hilo de render de FORGEX DOOM Orbital.
// Cada hilo tiene su propia instancia del motor Rust (WebAssembly) con una réplica del mundo, y dibuja una
// franja vertical de la imagen: raycast, sprites, chispas, luz con trazado de rayos y reducción del bloom.
// No usa memoria compartida (la página no puede pedir aislamiento entre orígenes): recibe los cambios del mundo
// como un diario y devuelve su franja en búferes transferibles (sin copia) que el hilo principal recicla.
let X = null, K = -1;
const T = 128, NL = 16, TT = T * T;
function applyJournal(J) {
  let i = 0;
  while (i < J.length) {
    const op = J[i++];
    if (op === 1) { X.w_add(J[i], J[i + 1], J[i + 2], J[i + 3], J[i + 4], J[i + 5], J[i + 6], J[i + 7], J[i + 8], J[i + 9], J[i + 10], J[i + 11]); i += 12; }
    else if (op === 2) { X.w_set_acid(J[i], J[i + 1], J[i + 2]); i += 3; }
    else if (op === 3) { X.w_prune(J[i]); i += 1; }
    else if (op === 4) X.w_reset();
    else throw new Error('diario del mundo corrupto');
  }
}
function applyAtlas(list) { for (const [off, data] of list) new Uint32Array(X.memory.buffer, X.p_atlas() + off * 4, data.length).set(data); }
onmessage = e => {
  const d = e.data;
  try {
    if (d.t === 'init') {
      K = d.k;
      X = new WebAssembly.Instance(d.module, { env: { now_import: () => performance.now() } }).exports;
      const B = X.memory.buffer;
      new Uint32Array(B, X.p_texlv(), 8 * NL * TT).set(d.texlv);
      new Uint8Array(B, X.p_texem(), 8 * TT).set(d.texem);
      new Uint32Array(B, X.p_texgl(), 8 * TT).set(d.texgl);
      new Uint32Array(B, X.p_rim(), 8 * NL).set(d.rim);
      new Uint32Array(B, X.p_rimg(), 8 * NL).set(d.rimg);
      new Uint32Array(B, X.p_sky(), d.sky.length).set(d.sky);
      X.set_consts(d.padg, d.dark);
      X.w_reset(); applyJournal(d.world); applyAtlas(d.atlas);
      postMessage({ t: 'ready', k: K });
      return;
    }
    if (d.t !== 'frame' || !X) return;
    const t0 = performance.now();
    if (d.journal) applyJournal(d.journal);
    if (d.atlas) applyAtlas(d.atlas);
    const B = X.memory.buffer, c = d.cam, rw = d.rw, rh = d.rh, x0 = d.x0, x1 = d.x1, sw = x1 - x0;
    if (d.mode3d) X.render3d(c[0], c[1], c[2], c[9], c[10], c[11], c[12], c[13], c[14], c[15], c[16], rw, rh, d.acid, d.maxd, d.pl, x0, x1);
    else X.render(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], rw, rh, d.acid, d.maxd, d.pl, x0, x1);
    const t1 = performance.now();
    if (d.sprN) { new Float32Array(B, X.p_spr(), d.sprN * 8).set(d.spr); X.sprite_pass(d.sprN, x0, x1); }
    const n = d.npt;
    if (n) {
      new Float32Array(B, X.p_ptx(), n).set(d.ptx); new Float32Array(B, X.p_pty(), n).set(d.pty);
      new Float32Array(B, X.p_ptz(), n).set(d.ptz); new Uint32Array(B, X.p_ptc(), n).set(d.ptc);
      X.particle_pass(n, c[9], c[10], c[11], c[12], c[13], c[14], c[15], c[16], c[17], x0, x1);
    }
    const t2 = performance.now();
    new Float32Array(B, X.p_lights(), d.nl * 8).set(d.lights); new Float32Array(B, X.p_shad(), d.ns * 5).set(d.shad);
    const rays = X.light_pass(rw, rh, d.nl, d.ns, d.lamp, d.rt, x0, x1, d.rtmax);
    if (d.bloom) X.bloom_down(rw, rh, x0, x1);
    const t3 = performance.now();
    // la franja sale por filas con el ancho de la franja; se reutiliza el búfer que devolvió el hilo principal
    const outN = sw * rh, gN = (sw >> 2) * (rh >> 2);
    const out = d.out && d.out.byteLength >= outN * 4 ? d.out : new ArrayBuffer(outN * 4);
    new Uint32Array(out, 0, outN).set(new Uint32Array(B, X.p_out(), outN));
    let gds = null;
    if (d.bloom) { gds = d.gds && d.gds.byteLength >= gN * 4 ? d.gds : new ArrayBuffer(gN * 4); new Uint32Array(gds, 0, gN).set(new Uint32Array(B, X.p_gds(), gN)); }
    const t4 = performance.now();
    postMessage({ t: 'done', k: K, id: d.id, rw, rh, x0, x1, out, gds, rays, ms: [t1 - t0, t2 - t1, t3 - t2, t4 - t3, t4 - t0], mem: B.byteLength },
      gds ? [out, gds] : [out]);
  } catch (err) { postMessage({ t: 'error', k: K, msg: String(err && err.message || err) }); }
};
