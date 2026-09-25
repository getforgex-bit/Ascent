// Verificación de CERO ALLOCS en la ruta caliente de renderizado (Plan A3)
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const wasmPath = path.join(ROOT, 'rust-gfx/forgex_gfx.wasm');
const scalarPath = path.join(ROOT, 'rust-gfx/forgex_gfx_scalar.wasm');

console.log('=== TEST ZERO_ALLOC: Cero allocs en caliente durante 600 frames ===\n');

const imports = {
  env: {
    now_import: () => 1000.0,
  },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function simulateUploadAssets(X) {
  const r = rng(12345);
  const M = X.memory.buffer;
  const T = X.dims() % 10000;
  const TT = T * T;
  const NL = 16;
  const SK = X.sky_dims();
  const SKW = Math.floor(SK / 10000);
  const SKH = SK % 10000;

  // Llenar texturas y buffers estáticos a través de punteros C-ABI
  const lv = new Uint32Array(M, X.p_texlv(), 8 * NL * TT);
  for (let i = 0; i < lv.length; i++) lv[i] = 0xff000000 | (r() * 0xffffff);

  const em = new Uint8Array(M, X.p_texem(), 8 * TT);
  for (let i = 0; i < em.length; i++) em[i] = r() < 0.05 ? 1 : 0;

  const gl = new Uint32Array(M, X.p_texgl(), 8 * TT);
  for (let i = 0; i < gl.length; i++) gl[i] = 0xff000000 | (r() * 0xffffff);

  const rim = new Uint32Array(M, X.p_rim(), 8 * NL);
  for (let i = 0; i < rim.length; i++) rim[i] = 0xff00ffff;

  const rimg = new Uint32Array(M, X.p_rimg(), 8 * NL);
  for (let i = 0; i < rimg.length; i++) rimg[i] = 0xff00ff00;

  const sky = new Uint32Array(M, X.p_sky(), SKW * SKH);
  for (let i = 0; i < sky.length; i++) sky[i] = 0xff000000 | (r() * 0xffffff);

  // Atlas y Sprites
  const atlas = new Uint32Array(M, X.p_atlas(), 1024 * 1024);
  for (let i = 0; i < 4096; i++) atlas[i] = 0xffffffff;

  const spri = new Float32Array(M, X.p_spr(), 512 * 8);
  for (let k = 0; k < 16; k++) {
    const o = k * 8;
    spri[o] = 0;       // offset
    spri[o + 1] = 16;  // nn
    spri[o + 2] = 100 + k * 10; // x0
    spri[o + 3] = 116 + k * 10; // x1
    spri[o + 4] = 100;          // y0
    spri[o + 5] = 116;          // y1
    spri[o + 6] = 5.0;          // ty (profundidad)
    spri[o + 7] = 0.8;          // amb
  }

  // Partículas
  const ptx = new Float32Array(M, X.p_ptx(), 512);
  const pty = new Float32Array(M, X.p_pty(), 512);
  const ptz = new Float32Array(M, X.p_ptz(), 512);
  const ptc = new Uint32Array(M, X.p_ptc(), 512);
  for (let i = 0; i < 64; i++) {
    ptx[i] = 266 + (r() * 10 - 5);
    pty[i] = 266 + (r() * 10 - 5);
    ptz[i] = 1.0 + r() * 2;
    ptc[i] = 0xffff5500;
  }

  // Luces y Sombras
  const lights = new Float32Array(M, X.p_lights(), 16 * 8);
  for (let i = 0; i < 8 * 8; i += 8) {
    lights[i] = 266.0;     // x
    lights[i + 1] = 266.0; // y
    lights[i + 2] = 2.0;   // z
    lights[i + 3] = 1.0;   // r
    lights[i + 4] = 0.8;   // g
    lights[i + 5] = 0.6;   // b
    lights[i + 6] = 8.0;   // radio
    lights[i + 7] = 1.0;   // intensidad
  }

  const shad = new Float32Array(M, X.p_shad(), 64 * 5);
  for (let i = 0; i < 4 * 5; i += 5) {
    shad[i] = 266.0;
    shad[i + 1] = 266.0;
    shad[i + 2] = 1.0;
    shad[i + 3] = 0.5;
    shad[i + 4] = 0.5;
  }

  X.set_consts(0xff00ff00, 0xff120810);
  X.w_reset();

  const C = 266;
  for (let n = 0; n < 200; n++) {
    const x = C - 15 + (r() * 30 | 0);
    const y = C - 15 + (r() * 30 | 0);
    const zb = r() * 4;
    const zt = zb + 1.0 + r() * 2;
    X.w_add(x, y, zb, zt, 1 + (r() * 6 | 0), 0, x, y, 1, 1, 0, 0);
  }
}

function runZeroAllocTest(name, filePath) {
  console.log(`[${name}] Cargando ${path.basename(filePath)}...`);
  const bytes = fs.readFileSync(filePath);
  const mod = new WebAssembly.Module(bytes);
  const inst = new WebAssembly.Instance(mod, imports);
  const X = inst.exports;

  // 1. Simular subida de assets y configuración
  simulateUploadAssets(X);

  // 2. Reiniciar contador de allocs
  X.wasm_reset_alloc_count();
  const initialAllocs = X.wasm_alloc_count();
  assert.strictEqual(initialAllocs, 0, 'El contador de allocs debe ser 0 tras reset');

  // 3. Ejecutar 600 ciclos completos de renderizado
  const FRAMES = 600;
  const rw = 480;
  const rh = 300;
  const PL = 0.66;
  const px = 266.0;
  const py = 266.0;
  const camz = 1.5;

  console.log(`[${name}] Ejecutando ${FRAMES} frames de render + light_pass + sprite_pass + particle_pass + bloom_down...`);

  for (let frame = 0; frame < FRAMES; frame++) {
    const pa = frame * 0.01;
    const dirx = Math.cos(pa);
    const diry = Math.sin(pa);
    const plx = -diry * PL;
    const ply = dirx * PL;

    // Pase 1: Raycasting de columnas
    X.render(px, py, camz, dirx, diry, plx, ply, pa, rh / 2, rw, rh, 0, 40.0, PL, 0, rw);

    // Pase 2: Iluminación diferida
    X.light_pass(rw, rh, 8, 4, 1, 0, 0, rw, 40.0);

    // Pase 3: Sprites
    X.sprite_pass(16, 0, rw);

    // Pase 4: Partículas
    X.particle_pass(64, dirx, diry, 0.0, plx, ply, 0.0, 0.0, 0.0, 1.0, rh / 2, 0, rw);

    // Pase 5: Bloom downsample
    X.bloom_down(rw, rh, 0, rw);
  }

  // 4. Verificar que se hicieron exactamente 0 allocs
  const finalAllocs = X.wasm_alloc_count();
  if (finalAllocs !== 0) {
    console.error(`FAIL [${name}]: Se detectaron ${finalAllocs} allocs durante los ${FRAMES} frames!`);
    process.exit(1);
  }

  console.log(`[${name}] PASS: 0 allocs detectados en ${FRAMES} frames.`);
}

runZeroAllocTest('SIMD', wasmPath);
runZeroAllocTest('Scalar', scalarPath);

console.log('\n=================================================================');
console.log('PASS: zero_alloc.js completado exitosamente (0 allocs en 600 frames).');
console.log('=================================================================');
