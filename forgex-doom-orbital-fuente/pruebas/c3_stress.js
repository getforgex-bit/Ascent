// =========================================================================
// pruebas/c3_stress.js — Tests C3.5 y C3.6 (Estrés de 10.000 pasos y 5 min)
// =========================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const wasmBytes = fs.readFileSync(path.resolve(__dirname, '..', 'forgex_gfx.wasm'));
const wasm = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), {
  env: { now_import: () => 0 }
}).exports;

const C = 266.0;

function setupWorld(w) {
  w.w_reset();
  for (let y = C - 80; y <= C + 80; y++) {
    for (let x = C - 80; x <= C + 80; x++) {
      w.w_add(x, y, -1.0, 0.0, 1, 0, x, y, 1, 1, 0, 0);
    }
  }
}

// PRNG determinista
let seed = 123456789;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

console.log('=== Test C3.5: Estrés de 10.000 pasos deterministas ===');
{
  setupWorld(wasm);
  wasm.sim_reset();
  wasm.sim_reset_entities();
  wasm.sim_reset_projectiles();
  wasm.sim_reset_items();
  wasm.sim_set_player(C + 0.5, C + 0.5, 0.0, 0.35, 0.0, 100.0, 30.0);

  // Spawns
  for (let i = 0; i < 6; i++) wasm.sim_spawn(0, C + 5 + i * 2, C + 5, 0.0);
  for (let i = 0; i < 6; i++) wasm.sim_spawn(1, C - 5 - i * 2, C + 10, 1.5);
  for (let i = 0; i < 4; i++) wasm.sim_spawn(2, C + (i - 2) * 4, C - 10, 3.0);

  const hashes = new Set();
  let repeatedHashCount = 0;
  const dt = Math.fround(1 / 60);

  for (let step = 0; step < 10000; step++) {
    const r = rand();
    let kMask = 0;
    if (r < 0.4) kMask |= 1;
    else if (r < 0.6) kMask |= 4;
    if (r > 0.2 && r < 0.5) kMask |= 8;
    else if (r > 0.7) kMask |= 2;

    const jReq = (rand() < 0.04);
    const fireReq = (rand() < 0.1);
    const mx = (rand() - 0.5) * 10;
    const my = (rand() - 0.5) * 6;

    wasm.sim_input(mx, my, kMask, jReq ? 1 : 0, fireReq ? 1 : 0);
    wasm.sim_step(dt);

    if (step % 20 === 0) {
      const h = wasm.sim_hash() >>> 0;
      if (hashes.has(h)) {
        repeatedHashCount++;
      } else {
        hashes.add(h);
      }
    }

    const ptr = wasm.sim_state();
    const S = new Float32Array(wasm.memory.buffer, ptr, 30);
    assert(!Number.isNaN(S[0]) && !Number.isNaN(S[1]) && !Number.isNaN(S[2]), `NaN detectado en paso ${step}`);
    assert(S[0] > 0 && S[0] < 600 && S[1] > 0 && S[1] < 600, `Posición divergente en paso ${step}: ${S[0]}, ${S[1]}`);
  }

  console.log(`  ✓ 10.000 pasos completados sin diverger. Hashes únicos muestreados: ${hashes.size} / 500`);
  assert(hashes.size > 450, `Demasiados hashes repetidos: solo ${hashes.size} únicos`);
}

console.log('\n=== Test C3.6: 5 minutos de simulación continua (18.000 pasos a 60 Hz) ===');
{
  setupWorld(wasm);
  wasm.sim_reset();
  wasm.sim_reset_entities();
  wasm.sim_reset_projectiles();
  wasm.sim_reset_items();
  wasm.sim_set_player(C + 0.5, C + 0.5, 0.0, 0.35, 0.0, 100.0, 30.0);

  // Enemigos dinámicos
  for (let i = 0; i < 5; i++) wasm.sim_spawn(0, C + 6 + i * 2, C + 4, 0.0);
  for (let i = 0; i < 5; i++) wasm.sim_spawn(1, C - 6 - i * 2, C + 8, 1.5);
  for (let i = 0; i < 4; i++) wasm.sim_spawn(2, C + (i - 2) * 5, C - 8, 3.0);

  const dt = Math.fround(1 / 60);
  const totalSteps = 5 * 60 * 60; // 18.000 pasos

  for (let step = 0; step < totalSteps; step++) {
    // Entradas de gameplay realistas
    let kMask = 0;
    if (step % 300 < 180) kMask |= 1;
    else if (step % 300 < 220) kMask |= 4;
    if (step % 400 < 120) kMask |= 8;
    else if (step % 400 < 240) kMask |= 2;

    const jReq = (step % 110 === 0);
    const fireReq = (step % 60 < 15);
    const mx = Math.sin(step * 0.02) * 5;
    const my = Math.cos(step * 0.015) * 2;

    wasm.sim_input(mx, my, kMask, jReq ? 1 : 0, fireReq ? 1 : 0);
    wasm.sim_step(dt);

    if (step % 300 === 0) {
      const ptr = wasm.sim_state();
      const S = new Float32Array(wasm.memory.buffer, ptr, 30);
      const U = new Uint32Array(wasm.memory.buffer, ptr, 30);

      // Verificaciones C3.6
      for (let i = 0; i < 30; i++) {
        assert(!Number.isNaN(S[i]), `NaN encontrado en campo ${i} en paso ${step}`);
      }

      const hp = S[11];
      const dead = U[23] !== 0;
      if (hp <= 0.0) {
        assert(dead, `Violación de invariante: hp <= 0 (${hp}) pero dead es falso en paso ${step}`);
      }
    }
  }

  console.log(`  ✓ 18.000 pasos (5 minutos a 60 FPS) completados sin errores, sin NaNs y respetando todos los invariantes de estado.`);
}

console.log('\n========================================');
console.log('Tests C3.5 y C3.6 completados con éxito.');
