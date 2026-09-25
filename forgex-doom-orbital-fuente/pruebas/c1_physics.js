// Test de verificación C1: SimState, world queries y física del jugador en Rust
// Ejecuta la suite tanto en la variante SIMD como en la variante escalar
const fs = require('fs');
const path = require('path'), ROOT = path.resolve(__dirname, '..');

const imports = {
  env: {
    now_import: () => 0,
  }
};

const load = f => new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(f)), imports).exports;

const C = 266;
const MW = 532;
const MH = 532;
const MOVE = 3.4;
const GRAV = 20.0;
const JUMP = 7.2;
const FALL_DMG = 20.0;
const FALL_LOCK = 33.0;

function setupWorld(wasm) {
  wasm.w_reset();
  for (let y = C - 20; y <= C + 20; y++) {
    for (let x = C - 20; x <= C + 20; x++) {
      wasm.w_add(x, y, -1.0, 0.0, 1, 0, x, y, 1, 1, 0, 0);
    }
  }
}

function readSim(wasm) {
  const ptr = wasm.sim_state();
  const S = new Float32Array(wasm.memory.buffer, ptr, 30);
  const U = new Uint32Array(wasm.memory.buffer, ptr, 30);
  return {
    px: S[0], py: S[1], pz: S[2],
    vz: S[3], pa: S[4], look: S[5],
    ground: U[6] !== 0, jumps: U[7], stuck: S[8],
    kx: S[9], ky: S[10],
    hp: S[11], reserve: S[12], healLock: S[13],
    regenN: U[14], regenT: S[15], regenIdle: S[16],
    regenPend: U[17], regenDrip: S[18],
    cp: [S[19], S[20], S[21]],
    top: S[22], dead: U[23] !== 0,
    shieldT: S[24], shieldCd: S[25]
  };
}

let passed = 0;
let failed = 0;
function assert(cond, name, details = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name} ${details}`);
    failed++;
  }
}

function runSuiteForWasm(wasmName) {
  console.log(`\n=== Probando ${wasmName} ===`);
  const X = load(path.join(ROOT, 'rust-gfx', wasmName));
  setupWorld(X);

  const dt = 1 / 60;

  // ----------------------------------------------------
  // TEST 1: Caminar 5 s en línea recta desde (C, C, 0)
  // ----------------------------------------------------
  console.log('Test 1: Caminar 5 s en línea recta (+X)');
  X.sim_reset();
  X.sim_set_player(C + 0.5, C + 0.5, 0.0, 0.0, 0.0, 100.0, 30.0);

  for (let step = 0; step < 300; step++) {
    X.sim_input(0, 0, 1, 0, 0);
    X.sim_step(dt);
  }

  const s1 = readSim(X);
  assert(Math.abs(s1.pz - 0.0) < 1e-4, 'pz se mantiene en el suelo (0.0)', `pz=${s1.pz}`);
  assert(s1.px > C + 0.5 + 15.0 && s1.px < C + 0.5 + 18.0, 'px avanzó ~17 metros', `px=${s1.px}`);
  assert(Math.abs(s1.py - (C + 0.5)) < 1e-4, 'py no cambió', `py=${s1.py}`);
  assert(s1.ground === true, 'el jugador permanece en el suelo');

  // ----------------------------------------------------
  // TEST 2: Saltar y verificar parábola de vz
  // ----------------------------------------------------
  console.log('Test 2: Salto y parábola de vz');
  X.sim_reset();
  X.sim_set_player(C + 0.5, C + 0.5, 0.0, 0.0, 0.0, 100.0, 30.0);

  X.sim_input(0, 0, 0, 1, 0);
  X.sim_step(dt);
  let s2 = readSim(X);
  assert(Math.abs(s2.vz - (JUMP - GRAV * dt)) < 1e-4, 'primer paso de salto aplica JUMP y resta GRAV*dt', `vz=${s2.vz}`);
  assert(s2.pz > 0.0, 'pz asciende', `pz=${s2.pz}`);
  assert(s2.ground === false, 'despegó del suelo');

  let maxZ = s2.pz;
  let reachedApex = false;
  for (let step = 0; step < 50; step++) {
    X.sim_input(0, 0, 0, 0, 0);
    X.sim_step(dt);
    s2 = readSim(X);
    if (s2.pz > maxZ) maxZ = s2.pz;
    if (s2.vz < 0 && !reachedApex) reachedApex = true;
    if (s2.ground) break;
  }
  assert(reachedApex, 'alcanzó el ápice de la parábola y comenzó a descender');
  assert(maxZ > 1.0 && maxZ < 1.5, `altura máxima del salto esperada ~1.29m (maxZ=${maxZ})`);
  assert(s2.ground === true, 'aterrizó nuevamente en el suelo');
  assert(Math.abs(s2.pz - 0.0) < 1e-4, 'pz final es exactamente el suelo 0.0', `pz=${s2.pz}`);

  // ----------------------------------------------------
  // TEST 3: Caer al vacío, verificar hp -= 20 y heal_lock = 33
  // ----------------------------------------------------
  console.log('Test 3: Caída al vacío');
  X.sim_reset();
  X.sim_set_player(C + 0.5, C + 0.5, 0.0, 0.0, 0.0, 100.0, 30.0);

  const ptr = X.sim_state();
  const F = new Float32Array(X.memory.buffer, ptr, 30);
  F[2] = -15.0; // SIM.pz = -15.0 (cp_z es 0.0)

  X.sim_input(0, 0, 0, 0, 0);
  X.sim_step(dt);

  const s3 = readSim(X);
  assert(Math.abs(s3.pz - 0.0) < 1e-4, 'teletransportado de vuelta al checkpoint z=0', `pz=${s3.pz}`);
  assert(Math.abs(s3.px - (C + 0.5)) < 1e-4, 'teletransportado a cp_x', `px=${s3.px}`);
  assert(s3.hp === 100 - FALL_DMG, `vida reducida en ${FALL_DMG} puntos`, `hp=${s3.hp}`);
  assert(Math.abs(s3.healLock - (FALL_LOCK - dt)) < 1e-4, `curación bloqueada durante ${FALL_LOCK} s (menos dt del fotograma)`, `healLock=${s3.healLock}`);

  // ----------------------------------------------------
  // TEST 4: Quedarse quieto y verificar regeneración
  // ----------------------------------------------------
  console.log('Test 4: Regeneración y curación en reposo');
  X.sim_reset();
  X.sim_set_player(C + 0.5, C + 0.5, 0.0, 0.0, 0.0, 80.0, 30.0);

  for (let step = 0; step < 90; step++) {
    X.sim_input(0, 0, 0, 0, 0);
    X.sim_step(dt);
  }

  const s4 = readSim(X);
  assert(s4.hp > 80.0, `la vida subió por regeneración (hp=${s4.hp})`);
  assert(s4.reserve < 30.0, `la reserva bajó por curación (reserve=${s4.reserve})`);
  assert(Math.abs((s4.hp + s4.reserve) - 110.0) < 1e-4, 'la suma de vida + reserva se conserva perfectamente', `total=${s4.hp + s4.reserve}`);

  // ----------------------------------------------------
  // TEST 5: Reproducibilidad exacta JS vs Rust
  // ----------------------------------------------------
  console.log('Test 5: Reproducibilidad exacta JS vs Rust');

  function jsPhysicsStep(st, kMask, j, dt) {
    const dx = Math.fround(Math.cos(st.pa)), dy = Math.fround(Math.sin(st.pa));
    const fwd = (kMask & 1 ? 1 : 0) - (kMask & 4 ? 1 : 0);
    const str = (kMask & 8 ? 1 : 0) - (kMask & 2 ? 1 : 0);
    const mx = Math.fround(Math.fround((dx * fwd - dy * str) * MOVE * dt) + Math.fround(st.kx * dt));
    const my = Math.fround(Math.fround((dy * fwd + dx * str) * MOVE * dt) + Math.fround(st.ky * dt));
    const kd = Math.fround(Math.exp((st.ground ? -7 : -1.1) * dt));
    st.kx = Math.fround(st.kx * kd); st.ky = Math.fround(st.ky * kd);
    st.px = Math.fround(st.px + mx); st.py = Math.fround(st.py + my);
    if (j && st.jumps < 2) { st.vz = Math.fround(JUMP * st.jumpMul); st.jumps++; st.ground = false; }
    st.vz = Math.fround(st.vz - GRAV * dt);
    let nz = Math.fround(st.pz + st.vz * dt);
    st.ground = false;
    if (st.vz <= 0 && st.pz >= -0.35 && nz <= 0.0) { nz = 0.0; st.vz = 0; st.ground = true; st.jumps = 0; }
    st.pz = nz;
  }

  const jsSt = {
    px: Math.fround(C + 0.5), py: Math.fround(C + 0.5), pz: 0.0,
    vz: 0.0, pa: 0.35, look: 0.0,
    ground: true, jumps: 0, kx: 0.0, ky: 0.0,
    jumpMul: 1.0,
  };

  X.sim_reset();
  X.sim_set_player(C + 0.5, C + 0.5, 0.0, 0.35, 0.0, 100.0, 30.0);

  let maxDiff = 0;
  for (let step = 0; step < 200; step++) {
    const w = (step >= 10 && step < 100) || (step >= 120 && step < 180);
    const d = (step >= 30 && step < 70);
    const j = (step === 20 || step === 140);
    let kMask = 0;
    if (w) kMask |= 1;
    if (d) kMask |= 8;

    jsPhysicsStep(jsSt, kMask, j, dt);
    X.sim_input(0, 0, kMask, j ? 1 : 0, 0);
    X.sim_step(dt);

    const rSt = readSim(X);
    const diffX = Math.abs(jsSt.px - rSt.px);
    const diffY = Math.abs(jsSt.py - rSt.py);
    const diffZ = Math.abs(jsSt.pz - rSt.pz);
    const diff = Math.max(diffX, diffY, diffZ);
    if (diff > maxDiff) maxDiff = diff;
  }

  assert(maxDiff <= 1e-4, `reproducibilidad idéntica (diferencia máxima = ${maxDiff.toExponential(3)} <= 1e-4)`);
}

runSuiteForWasm('forgex_gfx.wasm');
runSuiteForWasm('forgex_gfx_scalar.wasm');

console.log(`\n========================================`);
console.log(`Total: ${passed} pasados, ${failed} fallados.`);
if (failed > 0) process.exit(1);
