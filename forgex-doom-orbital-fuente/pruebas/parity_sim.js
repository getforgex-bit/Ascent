// =========================================================================
// pruebas/parity_sim.js — Paridad SIMD vs Escalar en Simulación Completa
// =========================================================================
// Misión C3.3: Cargar forgex_gfx.wasm (SIMD 128-bit) y forgex_gfx_scalar.wasm (Escalar)
// en dos instancias separadas y ejecutar 3600 pasos (1 minuto a 60 Hz) con
// simulación integral (jugador, enemigos, proyectiles e ítems).
// Verificar igualdad bit a bit de sim_hash() cada 30 pasos (120 checkpoints).

const fs = require('fs');
const path = require('path');

const imports = {
  env: {
    now_import: () => 0
  }
};

const simdPath = path.resolve(__dirname, '..', 'forgex_gfx.wasm');
const scalarPath = path.resolve(__dirname, '..', 'forgex_gfx_scalar.wasm');

const simd = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(simdPath)), imports).exports;
const scalar = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(scalarPath)), imports).exports;

const C = 266.0;

console.log('=== Iniciando parity_sim.js (SIMD vs Escalar, 3600 pasos, dt = 1/60s) ===\n');

// 1. Configurar mundo idéntico en ambas instancias
for (const wasm of [simd, scalar]) {
  wasm.w_reset();
  // Plataforma principal
  for (let y = C - 60; y <= C + 60; y++) {
    for (let x = C - 60; x <= C + 60; x++) {
      wasm.w_add(x, y, -1.0, 0.0, 1, 0, x, y, 1, 1, 0, 0);
    }
  }
  // Obstáculos y pilares para probar oclusión y colisiones
  for (let p = 0; p < 8; p++) {
    const ox = C + (p - 4) * 6;
    const oy = C + ((p % 3) - 1) * 7;
    wasm.w_add(ox, oy, 0.0, 4.0, 1, 0, 0, 0, 1, 1, 0, 0);
  }

  // Reiniciar estado
  wasm.sim_reset();
  wasm.sim_reset_entities();
  wasm.sim_reset_projectiles();
  wasm.sim_reset_items();

  // Posicionar jugador
  wasm.sim_set_player(C + 0.5, C + 0.5, 0.0, 0.35, 0.0, 100.0, 30.0);

  // Generar conjunto de enemigos (Imps, Skulls, Cacos) para ejercitar SIMD
  // Imps
  for (let i = 0; i < 4; i++) {
    const id = wasm.sim_spawn(0, C + 8.0 + i * 2.0, C + 5.0, 0.0);
    if (id) wasm.sim_set_entity(id, 0, C + 8.0 + i * 2.0, C + 5.0, 0.0, 3.0);
  }
  // Skulls
  for (let i = 0; i < 4; i++) {
    const id = wasm.sim_spawn(1, C - 10.0 + i * 3.0, C + 12.0, 1.5);
    if (id) wasm.sim_set_entity(id, 1, C - 10.0 + i * 3.0, C + 12.0, 1.5, 2.0);
  }
  // Cacodemonios
  for (let i = 0; i < 4; i++) {
    const id = wasm.sim_spawn(2, C + (i - 2) * 5.0, C - 12.0, 3.0);
    if (id) wasm.sim_set_entity(id, 2, C + (i - 2) * 5.0, C - 12.0, 3.0, 8.0);
  }

  // Generar algunos ítems y proyectiles iniciales
  for (let i = 0; i < 5; i++) {
    wasm.sim_add_item(0, C + i * 2.0, C + 3.0, 2.0, 0.0, 0.0, 0.0);
  }
  for (let i = 0; i < 3; i++) {
    wasm.sim_spawn_projectile(0, C + 5.0, C + i * 2.0, 1.0, -2.0, 0.0, 0.0, 10.0, 3.0);
  }
}

// 2. Verificar estado inicial
const initHashSimd = simd.sim_hash() >>> 0;
const initHashScalar = scalar.sim_hash() >>> 0;
console.log(`Estado inicial: SIMD=0x${initHashSimd.toString(16)}, Escalar=0x${initHashScalar.toString(16)}`);
if (initHashSimd !== initHashScalar) {
  console.error('✗ ERROR: Estado inicial diferente entre SIMD y escalar');
  process.exit(1);
}

// 3. Ejecutar 3600 pasos con entradas variadas y comparar cada 30 pasos
const dt = Math.fround(1 / 60);
let matchedCheckpoints = 0;
let errors = 0;

for (let step = 0; step < 3600; step++) {
  let kMask = 0;
  // Desplazamiento periódico
  if (step % 180 < 100) kMask |= 1;       // Avanzar (W)
  else if (step % 180 < 140) kMask |= 4;  // Retroceder (S)

  if (step % 240 < 70) kMask |= 8;        // Strafe der (D)
  else if (step % 240 < 140) kMask |= 2;  // Strafe izq (A)

  // Giros de cámara
  if (step % 350 < 45) kMask |= 16;       // Flecha izq
  if (step % 450 < 40) kMask |= 32;       // Flecha der
  if (step % 550 < 30) kMask |= 64;       // Flecha arriba
  if (step % 650 < 25) kMask |= 128;      // Flecha abajo

  const jReq = (step % 90 === 0);         // Salto periódico
  const fireReq = (step % 45 < 10);       // Disparo periódico

  // Aplicar entradas en ambas instancias
  simd.sim_input(0, 0, kMask, jReq ? 1 : 0, fireReq ? 1 : 0);
  scalar.sim_input(0, 0, kMask, jReq ? 1 : 0, fireReq ? 1 : 0);

  // Ejecutar paso de simulación completo en ambas
  simd.sim_step(dt);
  scalar.sim_step(dt);

  // Verificación en cada checkpoint (cada 30 pasos)
  if (step % 30 === 0 || step === 3599) {
    const hSimd = simd.sim_hash() >>> 0;
    const hScalar = scalar.sim_hash() >>> 0;

    if (hSimd !== hScalar) {
      errors++;
      console.error(`✗ Mismatch en paso ${step}:`);
      console.error(`  Hash SIMD:    0x${hSimd.toString(16)} (${hSimd})`);
      console.error(`  Hash Escalar: 0x${hScalar.toString(16)} (${hScalar})`);

      const ptrSimd = simd.sim_state();
      const S_Simd = new Float32Array(simd.memory.buffer, ptrSimd, 6);
      const ptrScalar = scalar.sim_state();
      const S_Scalar = new Float32Array(scalar.memory.buffer, ptrScalar, 6);
      console.error(`  Posición SIMD:    px=${S_Simd[0]}, py=${S_Simd[1]}, pz=${S_Simd[2]}, pa=${S_Simd[4]}`);
      console.error(`  Posición Escalar: px=${S_Scalar[0]}, py=${S_Scalar[1]}, pz=${S_Scalar[2]}, pa=${S_Scalar[4]}`);
      break;
    } else {
      matchedCheckpoints++;
      if (matchedCheckpoints % 20 === 0 || step === 3599) {
        console.log(`  ✓ Checkpoint paso ${step.toString().padStart(4, ' ')}: hash 0x${hSimd.toString(16).padStart(8, '0')} idéntico`);
      }
    }
  }
}

console.log('\n========================================');
console.log(`Resultado parity_sim.js: ${matchedCheckpoints}/120 checkpoints idénticos, ${errors} fallos.`);
if (errors > 0) {
  process.exit(1);
} else {
  console.log('✓ Paridad bit a bit SIMD vs Escalar verificada al 100% (3600 pasos).');
}
