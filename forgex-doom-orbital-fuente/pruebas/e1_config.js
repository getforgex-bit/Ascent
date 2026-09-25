const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const wasmPath = path.join(ROOT, 'rust-gfx/forgex_gfx.wasm');
const scalarPath = path.join(ROOT, 'rust-gfx/forgex_gfx_scalar.wasm');

console.log('=== PLAN E1 TESTS: config.rs, prof.rs e importaciones WASM ===');

let nowMock = 1000.0;
const imports = {
  env: {
    now_import: () => nowMock,
  },
};

function createInstance(wasmFile) {
  const bytes = fs.readFileSync(wasmFile);
  const mod = new WebAssembly.Module(bytes);
  return new WebAssembly.Instance(mod, imports).exports;
}

// -------------------------------------------------------------
// Test 0: Tamaño y padding explícito de GraphicsConfig
// -------------------------------------------------------------
console.log('\n[Test 0] Verificando tamaño de estructuras C (padding explícito)');
for (const [name, file] of [['SIMD', wasmPath], ['Scalar', scalarPath]]) {
  const X = createInstance(file);
  const sizeGfx = X.size_of_gfx_cfg();
  const sizePerf = X.size_of_perf_cfg();
  console.log(`  ${name} -> size_of::<GraphicsConfig>(): ${sizeGfx} bytes, size_of::<PerformanceConfig>(): ${sizePerf} bytes`);
  assert.strictEqual(sizeGfx, 32 * 4, `GraphicsConfig debe tener 128 bytes (32 * 4)`);
  assert.strictEqual(sizePerf, 12 * 4, `PerformanceConfig debe tener 48 bytes (12 * 4)`);
}
console.log('  -> OK: Tamaños y paddings correctos.');

// -------------------------------------------------------------
// Test 1: set_gfx_cfg y set_perf_cfg con valores fuera de rango los recorta
// -------------------------------------------------------------
console.log('\n[Test 1] Recorte de valores fuera de rango en set_gfx_cfg y set_perf_cfg');
for (const [name, file] of [['SIMD', wasmPath], ['Scalar', scalarPath]]) {
  const X = createInstance(file);
  const B = X.memory.buffer;
  const gfxPtr = X.get_gfx_cfg();
  const u32g = new Uint32Array(B, gfxPtr, 32);
  const f32g = new Float32Array(B, gfxPtr, 32);

  // Escribir valores fuera de rango
  u32g[0] = 99; // backend > 3
  u32g[1] = 99; // quality > 3
  u32g[2] = 42; // dynamic_res != 0 -> 1
  f32g[3] = 999.0; // draw_distance > 64.0
  u32g[4] = 10; // lighting > 2
  u32g[5] = 10; // particles > 2
  u32g[6] = 5;  // bloom != 0 -> 1
  u32g[7] = 5;  // grain != 0 -> 1
  u32g[8] = 5;  // cam3d != 0 -> 1
  u32g[9] = 99; // rt_mode > 3
  f32g[10] = 0.01; // rt_max_dist < 1.0
  u32g[11] = 100; // rt_rays > 4
  u32g[12] = 2; // rt_temporal != 0 -> 1
  u32g[13] = 99; // rt_denoise > 3
  u32g[14] = 9; // rt_indirect != 0 -> 1
  u32g[15] = 1; // chunk_size_x < 4 -> 4
  u32g[16] = 200; // chunk_size_y > 64 -> 64
  u32g[17] = 2; // chunk_size_z < 4 -> 4
  f32g[18] = 0.5; // stream_radius < 2.0 -> 2.0
  u32g[19] = 8; // allow_software_gpu != 0 -> 1

  X.set_gfx_cfg(gfxPtr);

  // Comprobar recortes en G_CFG
  assert.strictEqual(u32g[0], 3, 'backend debe recortarse a 3');
  assert.strictEqual(u32g[1], 3, 'quality debe recortarse a 3');
  assert.strictEqual(u32g[2], 1, 'dynamic_res debe ser 1');
  assert.strictEqual(f32g[3], 64.0, 'draw_distance debe recortarse a 64.0');
  assert.strictEqual(u32g[4], 2, 'lighting debe recortarse a 2');
  assert.strictEqual(u32g[5], 2, 'particles debe recortarse a 2');
  assert.strictEqual(u32g[6], 1, 'bloom debe ser 1');
  assert.strictEqual(u32g[7], 1, 'grain debe ser 1');
  assert.strictEqual(u32g[8], 1, 'cam3d debe ser 1');
  assert.strictEqual(u32g[9], 3, 'rt_mode debe recortarse a 3');
  assert.strictEqual(f32g[10], 1.0, 'rt_max_dist debe recortarse a 1.0');
  assert.strictEqual(u32g[11], 4, 'rt_rays debe recortarse a 4');
  assert.strictEqual(u32g[12], 1, 'rt_temporal debe ser 1');
  assert.strictEqual(u32g[13], 3, 'rt_denoise debe recortarse a 3');
  assert.strictEqual(u32g[14], 1, 'rt_indirect debe ser 1');
  assert.strictEqual(u32g[15], 4, 'chunk_size_x debe ser al menos 4');
  assert.strictEqual(u32g[16], 64, 'chunk_size_y debe recortarse a 64');
  assert.strictEqual(u32g[17], 4, 'chunk_size_z debe ser al menos 4');
  assert.strictEqual(f32g[18], 2.0, 'stream_radius debe ser al menos 2.0');
  assert.strictEqual(u32g[19], 1, 'allow_software_gpu debe ser 1');

  // PerformanceConfig recortes
  const perfPtr = X.get_perf_cfg();
  const u32p = new Uint32Array(B, perfPtr, 12);
  u32p[0] = 7; // auto -> 1
  u32p[1] = 1000; // target_fps -> 360
  u32p[2] = 2; // sim_hz -> 10
  u32p[3] = 0; // ai_hz -> 1
  u32p[4] = 9; // interpolate -> 1
  u32p[5] = 9; // lod -> 1
  u32p[6] = 9; // culling -> 1
  u32p[7] = 999; // stats_hz -> 60
  u32p[8] = 10; // frames_in_flight -> 4
  u32p[9] = 99; // workers -> 16
  u32p[10] = 8; // simd_on -> 1

  X.set_perf_cfg(perfPtr);

  assert.strictEqual(u32p[0], 1, 'auto debe ser 1');
  assert.strictEqual(u32p[1], 360, 'target_fps debe recortarse a 360');
  assert.strictEqual(u32p[2], 10, 'sim_hz debe recortarse a 10');
  assert.strictEqual(u32p[3], 1, 'ai_hz debe recortarse a 1');
  assert.strictEqual(u32p[4], 1, 'interpolate debe ser 1');
  assert.strictEqual(u32p[5], 1, 'lod debe ser 1');
  assert.strictEqual(u32p[6], 1, 'culling debe ser 1');
  assert.strictEqual(u32p[7], 60, 'stats_hz debe recortarse a 60');
  assert.strictEqual(u32p[8], 4, 'frames_in_flight debe recortarse a 4');
  assert.strictEqual(u32p[9], 16, 'workers debe recortarse a 16');
  assert.strictEqual(u32p[10], 1, 'simd_on debe ser 1');
  console.log(`  ${name} -> OK: Recortes validados.`);
}

// -------------------------------------------------------------
// Test 2: syncConfigToRust mapea todos los campos
// -------------------------------------------------------------
console.log('\n[Test 2] syncConfigToRust mapea todos los campos');
const configJsCode = fs.readFileSync(path.join(ROOT, 'forgex/src/js/001-config.js'), 'utf-8');
const vm = require('vm');
const context = {
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  performance: globalThis.performance || { now: () => Date.now() },
  console,
};
vm.createContext(context);
const exp1 = vm.runInContext(configJsCode + '\n;({ CFG, syncConfigToRust, defaultConfig });', context);

const CFG = exp1.CFG;
const syncConfigToRust = exp1.syncConfigToRust;

// Modificar CFG con valores específicos
CFG.graphics.backend = 'rust';
CFG.graphics.quality = 1;
CFG.graphics.dynamicRes = false;
CFG.graphics.drawDistance = 32;
CFG.graphics.lighting = 1;
CFG.graphics.particles = 0;
CFG.graphics.bloom = false;
CFG.graphics.grain = true;
CFG.graphics.cam3d = true;
CFG.graphics.allowSoftwareGpu = false;
CFG.rt.mode = 2;
CFG.rt.maxDist = 10;
CFG.rt.rays = 2;
CFG.rt.temporal = true;
CFG.rt.denoise = 1;
CFG.rt.indirect = true;
CFG.chunks = { sizeX: 32, sizeY: 32, sizeZ: 16, streamRadius: 18 };
CFG.perf.auto = false;
CFG.perf.targetFps = 90;
CFG.perf.simHz = 120;
CFG.perf.aiHz = 30;
CFG.perf.interpolate = false;
CFG.perf.lod = false;
CFG.perf.culling = false;
CFG.perf.statsHz = 30;
CFG.memory = { framesInFlight: 3 };
CFG.threads = { workers: 3 };
CFG.cpu = { simd: false };

const X = createInstance(wasmPath);
syncConfigToRust(X);

const B = X.memory.buffer;
const gfxPtr = X.get_gfx_cfg();
const u32g = new Uint32Array(B, gfxPtr, 32);
const f32g = new Float32Array(B, gfxPtr, 32);
const perfPtr = X.get_perf_cfg();
const u32p = new Uint32Array(B, perfPtr, 12);

assert.strictEqual(u32g[0], 2, 'backend rust = 2');
assert.strictEqual(u32g[1], 1, 'quality = 1');
assert.strictEqual(u32g[2], 0, 'dynamicRes = 0');
assert.strictEqual(f32g[3], 32.0, 'drawDistance = 32.0');
assert.strictEqual(u32g[4], 1, 'lighting = 1');
assert.strictEqual(u32g[5], 0, 'particles = 0');
assert.strictEqual(u32g[6], 0, 'bloom = 0');
assert.strictEqual(u32g[7], 1, 'grain = 1');
assert.strictEqual(u32g[8], 1, 'cam3d = 1');
assert.strictEqual(u32g[9], 2, 'rt_mode = 2');
assert.strictEqual(f32g[10], 10.0, 'rt_maxDist = 10.0');
assert.strictEqual(u32g[11], 2, 'rt_rays = 2');
assert.strictEqual(u32g[12], 1, 'rt_temporal = 1');
assert.strictEqual(u32g[13], 1, 'rt_denoise = 1');
assert.strictEqual(u32g[14], 1, 'rt_indirect = 1');
assert.strictEqual(u32g[15], 32, 'chunk_size_x = 32');
assert.strictEqual(u32g[16], 32, 'chunk_size_y = 32');
assert.strictEqual(u32g[17], 16, 'chunk_size_z = 16');
assert.strictEqual(f32g[18], 18.0, 'stream_radius = 18.0');
assert.strictEqual(u32g[19], 0, 'allowSoftwareGpu = 0');

assert.strictEqual(u32p[0], 0, 'auto = 0');
assert.strictEqual(u32p[1], 90, 'target_fps = 90');
assert.strictEqual(u32p[2], 120, 'sim_hz = 120');
assert.strictEqual(u32p[3], 30, 'ai_hz = 30');
assert.strictEqual(u32p[4], 0, 'interpolate = 0');
assert.strictEqual(u32p[5], 0, 'lod = 0');
assert.strictEqual(u32p[6], 0, 'culling = 0');
assert.strictEqual(u32p[7], 30, 'stats_hz = 30');
assert.strictEqual(u32p[8], 3, 'frames_in_flight = 3');
assert.strictEqual(u32p[9], 3, 'workers = 3');
assert.strictEqual(u32p[10], 0, 'simd_on = 0');
console.log('  -> OK: syncConfigToRust mapea todos los campos correctamente.');

// -------------------------------------------------------------
// Test 3: Cargar forgex-doom-cfg2 y forgex-doom-cfg antiguo
// -------------------------------------------------------------
console.log('\n[Test 3] Migración de configuración antigua (forgex-doom-cfg2 y forgex-doom-cfg)');
const oldCfg2 = {
  preset: 'custom',
  graphics: {
    backend: 'webgpu',
    quality: 3,
    dynamicRes: false,
    drawDistance: 24,
    lighting: 0,
    particles: 1,
    bloom: false,
    grain: false,
    cam3d: true,
  },
  rt: {
    mode: 3,
    maxDist: 6,
    rays: 4,
    temporal: false,
    denoise: 3,
    indirect: true,
  },
  perf: {
    auto: false,
    targetFps: 144,
    simHz: 30,
    aiHz: 10,
    interpolate: false,
    lod: false,
    culling: false,
    statsHz: 5,
  },
  memory: { framesInFlight: 3 },
  threads: { workers: 4 },
  cpu: { simd: true },
};

const store = { 'forgex-doom-cfg2': JSON.stringify(oldCfg2) };
const context2 = {
  localStorage: {
    getItem: k => store[k] || null,
    setItem: (k, v) => { store[k] = v; },
  },
  console,
};
vm.createContext(context2);
const exp2 = vm.runInContext(configJsCode + '\n;({ CFG, syncConfigToRust, defaultConfig });', context2);

const loadedCfg = exp2.CFG;
assert.strictEqual(loadedCfg.graphics.backend, 'webgpu');
assert.strictEqual(loadedCfg.graphics.quality, 3);
assert.strictEqual(loadedCfg.graphics.drawDistance, 24);
assert.strictEqual(loadedCfg.graphics.bloom, false);
assert.strictEqual(loadedCfg.rt.mode, 3);
assert.strictEqual(loadedCfg.rt.maxDist, 6);
assert.strictEqual(loadedCfg.rt.rays, 4);
assert.strictEqual(loadedCfg.perf.targetFps, 144);
assert.strictEqual(loadedCfg.perf.simHz, 30);
assert.strictEqual(loadedCfg.threads.workers, 4);

// Sincronizar hacia Rust y comprobar que se preservan
exp2.syncConfigToRust(X);
assert.strictEqual(u32g[0], 1, 'backend webgpu = 1');
assert.strictEqual(u32g[1], 3, 'quality = 3');
assert.strictEqual(f32g[3], 24.0, 'drawDistance = 24.0');
assert.strictEqual(u32g[9], 3, 'rt.mode = 3');
assert.strictEqual(f32g[10], 6.0, 'rt.maxDist = 6.0');
assert.strictEqual(u32p[1], 144, 'perf.targetFps = 144');
assert.strictEqual(u32p[2], 30, 'perf.simHz = 30');
assert.strictEqual(u32p[9], 4, 'threads.workers = 4');

// También probar migración desde versión v17 (forgex-doom-cfg)
const oldV17 = {
  q: 0,
  dist: 24,
  bloom: false,
  grain: false,
  cam3d: true,
  engine: 'js',
  rt: 0,
  auto: false,
  perf: true,
};
const storeV17 = { 'forgex-doom-cfg': JSON.stringify(oldV17) };
const contextV17 = {
  localStorage: {
    getItem: k => storeV17[k] || null,
    setItem: (k, v) => { storeV17[k] = v; },
  },
  console,
};
vm.createContext(contextV17);
const expV17 = vm.runInContext(configJsCode + '\n;({ CFG, syncConfigToRust, defaultConfig });', contextV17);
assert.strictEqual(expV17.CFG.graphics.quality, 0);
assert.strictEqual(expV17.CFG.graphics.backend, 'js');
assert.strictEqual(expV17.CFG.graphics.drawDistance, 24);
assert.strictEqual(expV17.CFG.rt.mode, 0);
console.log('  -> OK: Migración de forgex-doom-cfg2 y forgex-doom-cfg exitosa sin pérdida.');

// -------------------------------------------------------------
// Test 4: prof_drain y medición de profiling
// -------------------------------------------------------------
console.log('\n[Test 4] prof_drain y macros de profiling');
const profOutPtr = X.p_out ? X.p_out() : X.get_gfx_cfg();
X.test_prof_record(0, 4.25); // PROF_WORLD
X.test_prof_record(1, 10.5); // PROF_LIGHT
X.test_prof_record(4, 1.75); // PROF_SPRITES

const drained = new Float32Array(B, profOutPtr, 7);
const count = X.prof_drain(profOutPtr, 7);
assert.strictEqual(count, 7, 'prof_drain debe devolver 7 slots');
assert(Math.abs(drained[0] - 4.25) < 0.001, `PROF_WORLD debe ser ~4.25, es ${drained[0]}`);
assert(Math.abs(drained[1] - 10.5) < 0.001, `PROF_LIGHT debe ser ~10.5, es ${drained[1]}`);
assert(Math.abs(drained[4] - 1.75) < 0.001, `PROF_SPRITES debe ser ~1.75, es ${drained[4]}`);

// Tras prof_drain, los acumuladores deben estar a 0
const count2 = X.prof_drain(profOutPtr, 7);
assert.strictEqual(count2, 7);
assert.strictEqual(drained[0], 0.0, 'Acumulador 0 debe resetearse a 0.0');
assert.strictEqual(drained[1], 0.0, 'Acumulador 1 debe resetearse a 0.0');
assert.strictEqual(drained[4], 0.0, 'Acumulador 4 debe resetearse a 0.0');
console.log('  -> OK: prof_drain acumula, entrega y resetea a cero.');

console.log('\n=== TODOS LOS TESTS DE PLAN E1 PASARON CORRECTAMENTE ===\n');
