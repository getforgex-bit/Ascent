// =========================================================================
// pruebas/sim_replay.js — Verificación de Reproducibilidad JS vs Rust
// =========================================================================
// Misión C3.2: Comparar simulación JS vs simulación Rust en 3600 pasos
// (1 minuto a 60 Hz) con entradas fijas (avanzar, mirar, saltar).
// Cada 30 pasos (120 checkpoints) se verifica identidad exacta de sim_hash().

const fs = require('fs');
const path = require('path');

const wasmPath = path.resolve(__dirname, '..', 'forgex_gfx.wasm');
const wasmBytes = fs.readFileSync(wasmPath);
const wasm = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), {
  env: { now_import: () => 0 }
}).exports;

// Constantes físicas
const C = 266.0;
const MOVE = 3.4;
const ROT = 2.4;
const GRAV = 20.0;
const JUMP = 7.2;
const R_EXPLORE = 260.0;

// Funciones trigonométricas y exponenciales float32 idénticas a Rust
function sinf(x) {
  const inv_tau = 0.15915494309189535;
  let r = Math.fround(x - 6.283185307179586 * Math.floor(x * inv_tau + 0.5));
  if (r > 1.5707963267948966) r = Math.fround(3.141592653589793 - r);
  else if (r < -1.5707963267948966) r = Math.fround(-3.141592653589793 - r);
  const x2 = Math.fround(r * r);
  return Math.fround(r * (1.0 + x2 * (-0.16666666666666666 + x2 * (0.008333333333333333 + x2 * (-0.0001984126984126984 + x2 * (0.000002755731922398589 + x2 * -0.0000000250521083854417))))));
}

function cosf(x) {
  return sinf(x + 1.5707963267948966);
}

function expf(x) {
  const x2 = Math.fround(x * x);
  const x3 = Math.fround(x2 * x);
  const x4 = Math.fround(x2 * x2);
  const x5 = Math.fround(x4 * x);
  const x6 = Math.fround(x3 * x3);
  return Math.fround(1.0 + x + Math.fround(x2 * 0.5) + Math.fround(x3 * (1.0 / 6.0)) + Math.fround(x4 * (1.0 / 24.0)) + Math.fround(x5 * (1.0 / 120.0)) + Math.fround(x6 * (1.0 / 720.0)));
}

// Entorno del mundo (plataforma amplia para prueba continua)
wasm.w_reset();
for (let y = C - 120; y <= C + 120; y++) {
  for (let x = C - 120; x <= C + 120; x++) {
    wasm.w_add(x, y, -1.0, 0.0, 1, 0, x, y, 1, 1, 0, 0);
  }
}

// Inicialización de simulación en Rust
wasm.sim_reset();
wasm.sim_reset_entities();
wasm.sim_reset_projectiles();
wasm.sim_reset_items();
wasm.sim_set_player(C + 0.5, C + 0.5, 0.0, 0.35, 0.0, 100.0, 30.0);

// Estado de simulación en JavaScript
const jsSt = {
  px: Math.fround(C + 0.5),
  py: Math.fround(C + 0.5),
  pz: 0.0,
  vz: 0.0,
  pa: Math.fround(0.35),
  look: 0.0,
  ground: true,
  jumps: 0,
  kx: 0.0,
  ky: 0.0,
  jumpMul: 1.0,
  enemies: []
};

function jsPhysicsStep(st, kMask, jReq, dt) {
  // Rotación y look con teclas de flecha
  if (kMask & 16) st.pa = Math.fround(st.pa - Math.fround(ROT * dt));
  if (kMask & 32) st.pa = Math.fround(st.pa + Math.fround(ROT * dt));
  if (kMask & 64) st.look = Math.fround(Math.min(1.54, st.look + Math.fround(1.3 * dt)));
  if (kMask & 128) st.look = Math.fround(Math.max(-1.54, st.look - Math.fround(1.5 * dt)));

  const dx = cosf(st.pa);
  const dy = sinf(st.pa);
  const fwd = (kMask & 1 ? 1 : 0) - (kMask & 4 ? 1 : 0);
  const str = (kMask & 8 ? 1 : 0) - (kMask & 2 ? 1 : 0);
  const mx = Math.fround(Math.fround((dx * fwd - dy * str) * MOVE * dt) + Math.fround(st.kx * dt));
  const my = Math.fround(Math.fround((dy * fwd + dx * str) * MOVE * dt) + Math.fround(st.ky * dt));
  const kd = expf(Math.fround((st.ground ? -7.0 : -1.1) * dt));
  st.kx = Math.fround(st.kx * kd);
  st.ky = Math.fround(st.ky * kd);

  st.px = Math.fround(st.px + mx);
  st.py = Math.fround(st.py + my);

  // Límite de exploración circular
  const ex = Math.fround(st.px - C);
  const ey = Math.fround(st.py - C);
  const rr = Math.fround(Math.sqrt(Math.fround(ex * ex + ey * ey)));
  if (rr > R_EXPLORE) {
    st.px = Math.fround(C + ex / rr * R_EXPLORE);
    st.py = Math.fround(C + ey / rr * R_EXPLORE);
    st.kx = 0.0;
    st.ky = 0.0;
  }

  // Salto
  if (jReq && st.jumps < 2) {
    st.vz = Math.fround(JUMP * st.jumpMul);
    st.jumps++;
    st.ground = false;
  }

  // Gravedad y colisión vertical
  st.vz = Math.fround(st.vz - Math.fround(GRAV * dt));
  let nz = Math.fround(st.pz + Math.fround(st.vz * dt));
  st.ground = false;
  if (st.vz <= 0 && st.pz >= -0.35 && nz <= 0.0) {
    nz = 0.0;
    st.vz = 0.0;
    st.ground = true;
    st.jumps = 0;
  }
  st.pz = nz;
}

// Función FNV-1a (sim_hash)
function simHashJS(st) {
  let h = 2166136261 >>> 0;
  function mix(v) {
    const q = Math.floor(Math.fround(Math.fround(v * 10000) + 0.5)) | 0;
    h = (h ^ (q >>> 0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  mix(st.px);
  mix(st.py);
  mix(st.pz);
  mix(st.pa);
  mix(st.look);
  if (st.enemies) {
    for (const e of st.enemies) {
      if (e.dead) continue;
      mix(e.x);
      mix(e.y);
      mix(e.z);
      mix(e.hp);
    }
  }
  return h >>> 0;
}

console.log('=== Iniciando sim_replay.js (3600 pasos, dt = 1/60s, inputs fijos) ===\n');

const dt = Math.fround(1 / 60);
let matchedCheckpoints = 0;
let errors = 0;

for (let step = 0; step < 3600; step++) {
  let kMask = 0;
  // Secuencia fija y rica de entradas (avanzar, retroceder, strafe, girar cámara, mirar arriba/abajo)
  if (step % 200 < 120) kMask |= 1;       // Avanzar
  else if (step % 200 < 160) kMask |= 4;  // Retroceder
  if (step % 300 < 80) kMask |= 8;        // Strafe der
  else if (step % 300 < 160) kMask |= 2;  // Strafe izq

  if (step % 400 < 50) kMask |= 16;       // Girar izq
  if (step % 500 < 40) kMask |= 32;       // Girar der
  if (step % 600 < 30) kMask |= 64;       // Mirar arriba
  if (step % 700 < 25) kMask |= 128;      // Mirar abajo

  const jReq = (step % 95 === 0);         // Salto periódico

  // Paso en JS
  jsPhysicsStep(jsSt, kMask, jReq, dt);

  // Paso en Rust
  wasm.sim_input(0, 0, kMask, jReq ? 1 : 0, 0);
  wasm.sim_step(dt);

  // Verificación cada 30 pasos
  if (step % 30 === 0 || step === 3599) {
    const hJS = simHashJS(jsSt);
    const hRust = wasm.sim_hash() >>> 0;

    if (hJS !== hRust) {
      errors++;
      const ptr = wasm.sim_state();
      const S = new Float32Array(wasm.memory.buffer, ptr, 6);
      console.error(`✗ Mismatch en paso ${step}:`);
      console.error(`  Hash JS:   0x${hJS.toString(16)} (${hJS})`);
      console.error(`  Hash Rust: 0x${hRust.toString(16)} (${hRust})`);
      console.error(`  Posición JS:   px=${jsSt.px}, py=${jsSt.py}, pz=${jsSt.pz}, pa=${jsSt.pa}, look=${jsSt.look}`);
      console.error(`  Posición Rust: px=${S[0]}, py=${S[1]}, pz=${S[2]}, pa=${S[4]}, look=${S[5]}`);
      break;
    } else {
      matchedCheckpoints++;
      if (matchedCheckpoints % 20 === 0 || step === 3599) {
        console.log(`  ✓ Checkpoint paso ${step.toString().padStart(4, ' ')}: hash 0x${hRust.toString(16).padStart(8, '0')} idéntico`);
      }
    }
  }
}

console.log('\n========================================');
console.log(`Resultado sim_replay.js: ${matchedCheckpoints}/120 checkpoints idénticos, ${errors} fallos.`);
if (errors > 0) {
  process.exit(1);
} else {
  console.log('✓ Reproducibilidad JS vs Rust verificada al 100% (3600 pasos coincidentes).');
}
