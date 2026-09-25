// Paridad SIMD vs escalar: mismo mundo, misma cámara, mismas luces → la imagen final debe ser idéntica bit a bit.
const fs = require('fs');
const path = require('path'), ROOT = path.resolve(__dirname, '..');

const imports = { env: { now_import: () => 0 } };
const load = f => new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(f)), imports).exports;
const A = load(path.join(ROOT, 'rust-gfx/forgex_gfx.wasm')), B = load(path.join(ROOT, 'rust-gfx/forgex_gfx_scalar.wasm'));
const T = A.dims() % 10000, MW = Math.floor(A.dims() / 10000), SK = A.sky_dims(), SKW = Math.floor(SK / 10000), SKH = SK % 10000, NL = 8;
function rng(s) { return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function setup(X) {
  const r = rng(7), M = X.memory.buffer, TT = T * T;
  const lv = new Uint32Array(M, X.p_texlv(), 8 * NL * TT); for (let i = 0; i < lv.length; i++) lv[i] = 0xff000000 | (r() * 0xffffff);
  const em = new Uint8Array(M, X.p_texem(), 8 * TT); for (let i = 0; i < em.length; i++) em[i] = r() < .05 ? 1 : 0;
  const gl = new Uint32Array(M, X.p_texgl(), 8 * TT); for (let i = 0; i < gl.length; i++) gl[i] = 0xff000000 | (r() * 0xffffff);
  const rim = new Uint32Array(M, X.p_rim(), 8 * NL); for (let i = 0; i < rim.length; i++) rim[i] = 0xff00ffff;
  const sky = new Uint32Array(M, X.p_sky(), SKW * SKH); for (let i = 0; i < sky.length; i++) sky[i] = 0xff000000 | (r() * 0xffffff);
  X.set_consts(0xff00ff00, 0xff120810); X.w_reset();
  const C = 266;
  for (let n = 0; n < 1400; n++) { const x = C - 20 + (r() * 40 | 0), y = C - 20 + (r() * 40 | 0), zb = r() * 8 - 2, zt = zb + .2 + r() * 3;
    X.w_add(x, y, zb, zt, 1 + (r() * 7 | 0), (r() < .5 ? 1 : 0) | (r() < .3 ? 2 : 0) | (r() < .05 ? 4 : 0) | (r() < .05 ? 8 : 0), x, y, 1, 1, r() * 16 | 0, 0); }
}
setup(A); setup(B);
const views = X => ({ out: new Uint32Array(X.memory.buffer, X.p_out(), 800 * 500), gds: new Uint32Array(X.memory.buffer, X.p_gds(), 200 * 125), L: new Float32Array(X.memory.buffer, X.p_lights(), 16 * 8), S: new Float32Array(X.memory.buffer, X.p_shad(), 64 * 5) });
const va = views(A), vb = views(B);
let ok = 0, bad = 0;
for (const [rw, rh] of [[640, 400], [480, 300], [800, 500]]) for (let cam = 0; cam < 6; cam++) for (const rt of [0, 1, 2, 3]) for (const three of [false, true]) {
  const r = rng(100 + cam), px = 266 + r() * 6 - 3, py = 266 + r() * 6 - 3, camz = r() * 4, pa = r() * 6.28, look = (r() - .5) * 2.8;
  const dirx = Math.cos(pa), diry = Math.sin(pa), PL = .66, plx = -diry * PL, ply = dirx * PL, PROJ = rw / 2 / PL;
  const nl = 12, ns = 6;
  for (const v of [va, vb]) { const q = rng(55 + cam); for (let i = 0; i < nl * 8; i++) v.L[i] = [px + q() * 16 - 8, py + q() * 16 - 8, camz + q() * 4 - 2, q(), q(), q(), 2 + q() * 6, .5 + q()][i % 8]; for (let i = 0; i < ns * 5; i++) v.S[i] = [px + q() * 8 - 4, py + q() * 8 - 4, q() * 3, .3 + q() * .5, .5][i % 5]; }
  for (const X of [A, B]) {
    if (three) { const cp = Math.cos(look), sp = Math.sin(look); X.render3d(px, py, camz, cp * dirx, cp * diry, sp, -diry, dirx, -sp * dirx, -sp * diry, cp, rw, rh, 3, 40, PL, 0, rw); }
    else X.render(px, py, camz, dirx, diry, plx, ply, pa, rh / 2 + Math.tan(Math.max(-.9, Math.min(.9, look))) * PROJ, rw, rh, 3, 40, PL, 0, rw);
    X.light_pass(rw, rh, nl, ns, 1, rt, 0, rw, 40);
    X.bloom_down(rw, rh, 0, rw);
  }
  let diff = 0; for (let i = 0; i < rw * rh; i++) if (va.out[i] !== vb.out[i]) diff++;
  let gd = 0; for (let i = 0; i < (rw / 4) * (rh / 4); i++) if (va.gds[i] !== vb.gds[i]) gd++;
  if (diff || gd) { bad++; if (bad < 6) console.log(`DIFERENCIA ${rw}x${rh} cam${cam} rt${rt} ${three ? '3D' : 'columnas'}: ${diff} píxeles, bloom ${gd}`); } else ok++;
}
{ const s = new Set(va.out.subarray(0, 800*500)); console.log("colores distintos en la última imagen:", s.size); }
console.log(`casos idénticos: ${ok}, con diferencias: ${bad}`);
