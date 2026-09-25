// Franjas: renderizar la imagen en N franjas (cada una en su propia instancia, como los hilos) debe dar
// exactamente la misma imagen que el render completo, incluidos sprites, chispas y bloom.
const fs = require('fs');
const path = require('path'), ROOT = path.resolve(__dirname, '..');

const src = fs.readFileSync(process.argv[2] || path.join(ROOT, 'rust-gfx/forgex_gfx.wasm'));
const mod = new WebAssembly.Module(src);
const mk = () => new WebAssembly.Instance(mod, { env: { now_import: () => 0 } }).exports;
const T = 128, NL = 16;
function rng(s) { return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function setup(X) {
  const r = rng(7), M = X.memory.buffer, TT = T * T;
  const f = (p, n, g) => { const a = new Uint32Array(M, p, n); for (let i = 0; i < n; i++) a[i] = g(); };
  f(X.p_texlv(), 8 * NL * TT, () => 0xff000000 | (r() * 0xffffff));
  const em = new Uint8Array(M, X.p_texem(), 8 * TT); for (let i = 0; i < em.length; i++) em[i] = r() < .05 ? 1 : 0;
  f(X.p_texgl(), 8 * TT, () => 0xff000000 | (r() * 0xffffff));
  f(X.p_rim(), 8 * NL, () => 0xff00ffff);
  f(X.p_sky(), 1536 * 768, () => 0xff000000 | (r() * 0xffffff));
  X.set_consts(0xff00ff00, 0xff120810); X.w_reset();
  for (let n = 0; n < 1400; n++) { const x = 246 + (r() * 40 | 0), y = 246 + (r() * 40 | 0), zb = r() * 8 - 2, zt = zb + .2 + r() * 3;
    X.w_add(x, y, zb, zt, 1 + (r() * 7 | 0), (r() < .5 ? 1 : 0) | (r() < .3 ? 2 : 0) | (r() < .05 ? 4 : 0) | (r() < .05 ? 8 : 0), x, y, 1, 1, r() * 16 | 0, 0); }
  // atlas: 3 sprites de 64 px con transparencia y brillo propio
  const at = new Uint32Array(M, X.p_atlas(), 3 * 4096); for (let i = 0; i < at.length; i++) { const v = r(); at[i] = v < .3 ? 0 : v < .35 ? 0xfe0080ff : 0xff000000 | (r() * 0xffffff); }
}
function frame(X, rw, rh, cam, three, cx0, cx1) {
  const r = rng(100 + cam), px = 266 + r() * 6 - 3, py = 266 + r() * 6 - 3, camz = r() * 4, pa = r() * 6.28, look = (r() - .5) * 2.8;
  const dirx = Math.cos(pa), diry = Math.sin(pa), PL = .66, plx = -diry * PL, ply = dirx * PL, PROJ = rw / 2 / PL;
  const M = X.memory.buffer, L = new Float32Array(M, X.p_lights(), 128), S = new Float32Array(M, X.p_shad(), 320);
  const q = rng(55 + cam); for (let i = 0; i < 96; i++) L[i] = [px + q() * 16 - 8, py + q() * 16 - 8, camz + q() * 4 - 2, q(), q(), q(), 2 + q() * 6, .5 + q()][i % 8];
  for (let i = 0; i < 30; i++) S[i] = [px + q() * 8 - 4, py + q() * 8 - 4, q() * 3, .3 + q() * .5, .5][i % 5];
  let F; if (three) { const cp = Math.cos(look), sp = Math.sin(look); F = [cp * dirx, cp * diry, sp, -diry, dirx, -sp * dirx, -sp * diry, cp, rh / 2];
    X.render3d(px, py, camz, F[0], F[1], F[2], F[3], F[4], F[5], F[6], F[7], rw, rh, 3, 40, PL, cx0, cx1); }
  else { const hor = rh / 2 + Math.tan(Math.max(-.9, Math.min(.9, look))) * PROJ; F = [dirx, diry, 0, -diry, dirx, 0, 0, 1, hor];
    X.render(px, py, camz, dirx, diry, plx, ply, pa, hor, rw, rh, 3, 40, PL, cx0, cx1); }
  // sprites: rectángulos que cruzan las fronteras de las franjas
  const SP = new Float32Array(M, X.p_spr(), 8 * 8), w = rng(9 + cam);
  for (let k = 0; k < 8; k++) { const x0 = w() * rw - 40, y0 = w() * rh - 40, s = 30 + w() * 200; SP.set([(k % 3) * 4096, 64, x0, x0 + s, y0, y0 + s * 1.1, 1 + w() * 8, .4 + w() * .5], k * 8); }
  X.sprite_pass(8, cx0, cx1);
  const n = 600, PX = new Float32Array(M, X.p_ptx(), n), PY = new Float32Array(M, X.p_pty(), n), PZ = new Float32Array(M, X.p_ptz(), n), PC = new Uint32Array(M, X.p_ptc(), n);
  for (let k = 0; k < n; k++) { PX[k] = px + (w() - .5) * 10; PY[k] = py + (w() - .5) * 10; PZ[k] = camz + (w() - .5) * 4; PC[k] = 0xff000000 | (w() * 0xffffff); }
  X.particle_pass(n, F[0], F[1], F[2], F[3], F[4], F[5], F[6], F[7], F[8], cx0, cx1);
  X.light_pass(rw, rh, 12, 6, 1, cam % 4, cx0, cx1, 40);
  X.bloom_down(rw, rh, cx0, cx1);
}
const full = mk(); setup(full);
const parts = [mk(), mk(), mk()]; parts.forEach(setup);
let ok = 0, bad = 0;
for (const [rw, rh] of [[640, 400], [480, 300], [800, 500], [576, 360]]) for (let cam = 0; cam < 8; cam++) for (const three of [false, true]) {
  frame(full, rw, rh, cam, three, 0, rw);
  const A = new Uint32Array(full.memory.buffer, full.p_out(), rw * rh).slice(), GA = new Uint32Array(full.memory.buffer, full.p_gds(), (rw / 4) * (rh / 4)).slice();
  // 3 franjas de ancho múltiplo de 16
  const cut = [0, Math.round(rw / 3 / 16) * 16, Math.round(2 * rw / 3 / 16) * 16, rw];
  let diff = 0, gdiff = 0;
  for (let s = 0; s < 3; s++) {
    const X = parts[s], a = cut[s], b = cut[s + 1], sw = b - a;
    frame(X, rw, rh, cam, three, a, b);
    const O = new Uint32Array(X.memory.buffer, X.p_out(), sw * rh), G = new Uint32Array(X.memory.buffer, X.p_gds(), (sw / 4) * (rh / 4));
    for (let y = 0; y < rh; y++) for (let x = 0; x < sw; x++) if (O[y * sw + x] !== A[y * rw + a + x]) diff++;
    for (let y = 0; y < rh / 4; y++) for (let x = 0; x < sw / 4; x++) if (G[y * (sw / 4) + x] !== GA[y * (rw / 4) + a / 4 + x]) gdiff++;
  }
  if (diff || gdiff) { bad++; if (bad < 8) console.log(`${rw}x${rh} cam${cam} ${three ? '3D' : 'col'}: ${diff} píxeles distintos, bloom ${gdiff}`); } else ok++;
}
console.log(`franjas idénticas al render completo: ${ok}, con diferencias: ${bad}`);
