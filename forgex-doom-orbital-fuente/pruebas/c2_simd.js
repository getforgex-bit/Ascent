// pruebas/c2_simd.js
// Verificación exhaustiva de SIMD explícito de 128 bits, hitscan y paridad SIMD vs escalar.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FALLO: ${message}`);
  }
}

async function loadWasm(file) {
  const buf = fs.readFileSync(path.join(__dirname, '..', file));
  const imports = {
    env: {
      now_import: () => 0,
    }
  };
  const { instance } = await WebAssembly.instantiate(buf, imports);
  return instance.exports;
}

function allocF32(X, arr) {
  const ptr = X.sim_state ? X.sim_state() + 500 : 0x10000;
  const f32 = new Float32Array(X.memory.buffer, ptr, arr.length);
  f32.set(arr);
  return ptr;
}

async function run() {
  console.log('Cargando variantes WebAssembly (SIMD y Escalar)...');
  const simd = await loadWasm('rust-gfx/forgex_gfx.wasm');
  const scalar = await loadWasm('rust-gfx/forgex_gfx_scalar.wasm');

  // Direcciones estáticas de memoria para paso de parámetros de prueba
  // El buffer de salida de render o memoria libre de scratch
  const P_X = 0x40000;
  const P_Y = 0x40020;
  const P_Z = 0x40040;
  const P_OUT1 = 0x40060;
  const P_OUT2 = 0x40080;

  console.log('\n--- Test 1: sep4 SIMD vs Escalar (< 1e-6) ---');
  {
    let maxDiff = 0;
    for (let iter = 0; iter < 100; iter++) {
      const px = (Math.random() - 0.5) * 500;
      const py = (Math.random() - 0.5) * 500;
      const xs = [Math.random() * 500, Math.random() * 500, Math.random() * 500, Math.random() * 500];
      const ys = [Math.random() * 500, Math.random() * 500, Math.random() * 500, Math.random() * 500];

      // Escribir en memoria SIMD
      new Float32Array(simd.memory.buffer, P_X, 4).set(xs);
      new Float32Array(simd.memory.buffer, P_Y, 4).set(ys);
      simd.test_sep4(px, py, P_X, P_Y, P_OUT1);
      const outSimd = Array.from(new Float32Array(simd.memory.buffer, P_OUT1, 4));

      // Escribir en memoria Escalar
      new Float32Array(scalar.memory.buffer, P_X, 4).set(xs);
      new Float32Array(scalar.memory.buffer, P_Y, 4).set(ys);
      scalar.test_sep4(px, py, P_X, P_Y, P_OUT1);
      const outScalar = Array.from(new Float32Array(scalar.memory.buffer, P_OUT1, 4));

      for (let i = 0; i < 4; i++) {
        const diff = Math.abs(outSimd[i] - outScalar[i]);
        if (diff > maxDiff) maxDiff = diff;
        const expected = Math.fround(Math.hypot(xs[i] - px, ys[i] - py));
        assert(Math.abs(outSimd[i] - expected) < 1e-4, `sep4 incorrecto: ${outSimd[i]} vs ${expected}`);
      }
    }
    ok(maxDiff < 1e-6, `sep4 idéntico bit a bit entre SIMD y escalar (maxDiff = ${maxDiff.toExponential(3)})`);
  }

  console.log('\n--- Test 2: dist4 SIMD vs Escalar (< 1e-6) ---');
  {
    let maxDiff = 0;
    for (let iter = 0; iter < 100; iter++) {
      const px = (Math.random() - 0.5) * 500;
      const py = (Math.random() - 0.5) * 500;
      const pz = (Math.random() - 0.5) * 100;
      const xs = [Math.random() * 500, Math.random() * 500, Math.random() * 500, Math.random() * 500];
      const ys = [Math.random() * 500, Math.random() * 500, Math.random() * 500, Math.random() * 500];
      const zs = [Math.random() * 100, Math.random() * 100, Math.random() * 100, Math.random() * 100];

      new Float32Array(simd.memory.buffer, P_X, 4).set(xs);
      new Float32Array(simd.memory.buffer, P_Y, 4).set(ys);
      new Float32Array(simd.memory.buffer, P_Z, 4).set(zs);
      simd.test_dist4(px, py, pz, P_X, P_Y, P_Z, P_OUT1);
      const outSimd = Array.from(new Float32Array(simd.memory.buffer, P_OUT1, 4));

      new Float32Array(scalar.memory.buffer, P_X, 4).set(xs);
      new Float32Array(scalar.memory.buffer, P_Y, 4).set(ys);
      new Float32Array(scalar.memory.buffer, P_Z, 4).set(zs);
      scalar.test_dist4(px, py, pz, P_X, P_Y, P_Z, P_OUT1);
      const outScalar = Array.from(new Float32Array(scalar.memory.buffer, P_OUT1, 4));

      for (let i = 0; i < 4; i++) {
        const diff = Math.abs(outSimd[i] - outScalar[i]);
        if (diff > maxDiff) maxDiff = diff;
        const expected = Math.fround(Math.hypot(xs[i] - px, ys[i] - py, zs[i] - pz));
        assert(Math.abs(outSimd[i] - expected) < 1e-3, `dist4 incorrecto: ${outSimd[i]} vs ${expected}`);
      }
    }
    ok(maxDiff < 1e-6, `dist4 idéntico bit a bit entre SIMD y escalar (maxDiff = ${maxDiff.toExponential(3)})`);
  }

  console.log('\n--- Test 3: simd_los4 vs clear_path secuencial ---');
  {
    for (const X of [simd, scalar]) {
      X.w_reset();
      // Bloque sólido en (50, 50, zb=0, zt=4)
      X.w_add(50, 50, 0.0, 4.0, 1, 0, 0, 0, 1, 1, 0, 0);

      const px = 40.0, py = 50.0, pz = 1.0;
      // Ray 0: va a (45, 50, 1.0) -> libre (no llega al bloque)
      // Ray 1: va a (60, 50, 1.0) -> bloqueado por x=50
      // Ray 2: va a (40, 60, 1.0) -> libre en dirección Y
      // Ray 3: va a (60, 50, 10.0) -> pasa muy por encima del bloque (zt=4), libre
      const xs = [45.0, 60.0, 40.0, 60.0];
      const ys = [50.0, 50.0, 60.0, 50.0];
      const zs = [1.0, 1.0, 1.0, 10.0];

      new Float32Array(X.memory.buffer, P_X, 4).set(xs);
      new Float32Array(X.memory.buffer, P_Y, 4).set(ys);
      new Float32Array(X.memory.buffer, P_Z, 4).set(zs);

      X.test_simd_los4(px, py, pz, P_X, P_Y, P_Z, P_OUT1);
      const outU32 = Array.from(new Uint32Array(X.memory.buffer, P_OUT1, 4));

      for (let i = 0; i < 4; i++) {
        const seq = X.c_clear_path(px, py, pz, xs[i], ys[i], zs[i]) !== 0;
        const simdBool = outU32[i] === 0xFFFFFFFF;
        assert.strictEqual(simdBool, seq, `simd_los4 lane ${i} no coincide con c_clear_path`);
      }
    }
    ok(true, 'simd_los4 produce máscaras booleanas idénticas a clear_path secuencial');
  }

  console.log('\n--- Test 4: simd_damage4 cálculo de HP y máscara de muerte ---');
  {
    for (const X of [simd, scalar]) {
      const hps = [100.0, 25.0, 10.0, 5.0];
      const dmgs = [30.0, 25.0, 50.0, 0.0];

      new Float32Array(X.memory.buffer, P_X, 4).set(hps);
      new Float32Array(X.memory.buffer, P_Y, 4).set(dmgs);
      X.test_simd_damage4(P_X, P_Y, P_OUT1, P_OUT2);

      const newHps = Array.from(new Float32Array(X.memory.buffer, P_OUT1, 4));
      const dead = Array.from(new Uint32Array(X.memory.buffer, P_OUT2, 4));

      assert.strictEqual(Math.round(newHps[0]), 70, 'HP 100 - 30 = 70');
      assert.strictEqual(dead[0], 0, 'HP 70 vivo (dead = 0)');

      assert.strictEqual(Math.round(newHps[1]), 0, 'HP 25 - 25 = 0');
      assert.strictEqual(dead[1], 0xFFFFFFFF, 'HP 0 muerto (dead = 0xFFFFFFFF)');

      assert.strictEqual(Math.round(newHps[2]), -40, 'HP 10 - 50 = -40');
      assert.strictEqual(dead[2], 0xFFFFFFFF, 'HP -40 muerto (dead = 0xFFFFFFFF)');

      assert.strictEqual(Math.round(newHps[3]), 5, 'HP 5 - 0 = 5');
      assert.strictEqual(dead[3], 0, 'HP 5 vivo (dead = 0)');
    }
    ok(true, 'simd_damage4 calcula exactamente nuevo HP y máscara binaria de muerte');
  }

  console.log('\n--- Test 5: hitscan alineación, distancia y oclusión por paredes ---');
  {
    for (const [name, X] of [['SIMD', simd], ['Escalar', scalar]]) {
      X.w_reset();
      X.sim_reset();
      X.sim_reset_entities();

      // Jugador en (100.0, 100.0, z=0.0) mirando al este (pa = 0.0)
      X.sim_set_player(100.0, 100.0, 0.0, 0.0, 0.0, 100.0, 30.0);

      // Enemigo 1: Imp en (110.0, 100.0, 0.0) -> perfectamente alineado a 10m
      const id1 = X.sim_spawn(0, 110.0, 100.0, 0.0);

      // Enemigo 2: Imp en (130.0, 100.0, 0.0) detrás de una pared en x=120
      const id2 = X.sim_spawn(0, 130.0, 100.0, 0.0);
      X.w_add(120, 100, 0.0, 5.0, 1, 0, 0, 0, 1, 1, 0, 0);

      // Enemigo 3: Caco en (100.0, 120.0, 0.0) perpendicular a 90 grados
      const id3 = X.sim_spawn(2, 100.0, 120.0, 0.0);

      // Enemigo 4: Imp a 80m de distancia (fuera de rango 50m)
      const id4 = X.sim_spawn(0, 180.0, 100.0, 0.0);

      // Disparar rayo con rango 50.0m y daño 1.0 (arma sin penetración)
      const resPtr = X.test_hitscan(100.0, 100.0, 0.0, 0.0, 0.0, 1.0, 0, 50.0);
      const B = X.memory.buffer;
      const hitCount = new Uint32Array(B, resPtr, 1)[0];
      const hitIds = new Uint32Array(B, resPtr + 4, 64);
      const hitAlong = new Float32Array(B, resPtr + 4 + 256, 64);

      assert.strictEqual(hitCount, 1, `${name}: sólo 1 enemigo debe ser impactado`);
      assert.strictEqual(hitIds[0], id1, `${name}: el enemigo impactado debe ser id1`);
      assert(Math.abs(hitAlong[0] - 10.0) < 0.1, `${name}: distancia along esperada ~10m (obtenido ${hitAlong[0]})`);

      // Verificar que id1 recibió daño
      const entData = new Float32Array(9);
      X.sim_get_entity(id1, P_OUT1);
      entData.set(new Float32Array(B, P_OUT1, 9));
      assert.strictEqual(entData[5], 2.0, `${name}: HP de Imp bajó de 3 a 2`);
    }
    ok(true, 'hitscan detecta objetivo alineado a distancia, respeta paredes y rango máximo');
  }

  console.log('\n--- Test 6: hitscan shotgun con perdigones independientes ---');
  {
    for (const [name, X] of [['SIMD', simd], ['Escalar', scalar]]) {
      X.w_reset();
      X.sim_reset();
      X.sim_reset_entities();

      X.sim_set_player(100.0, 100.0, 0.0, 0.0, 0.0, 100.0, 30.0);

      // Crear varios enemigos en abanico
      const idCenter = X.sim_spawn(0, 110.0, 100.0, 0.0);    // ángulo 0
      const idLeft   = X.sim_spawn(0, 110.0, 100.8, 0.0);    // offset ~ +0.07 rad
      const idRight  = X.sim_spawn(0, 110.0, 99.2, 0.0);     // offset ~ -0.07 rad

      // Lote de 4 perdigones: centro, izquierda, derecha, y uno muy abierto
      const resPtr = X.sim_hitscan_batch4(0.0, 0.07, -0.07, 0.5, 0.75, 0, 14.0);
      const B = X.memory.buffer;
      const resSize = 4 + 256 + 256; // hit_count (4) + ids (256) + along (256) = 516 bytes

      // Perdigón 0 (centro)
      const count0 = new Uint32Array(B, resPtr, 1)[0];
      const idHit0 = new Uint32Array(B, resPtr + 4, 1)[0];
      assert.strictEqual(count0, 1, `${name}: perdigón 0 dio en el blanco`);
      assert.strictEqual(idHit0, idCenter, `${name}: perdigón 0 impactó al centro`);

      // Perdigón 1 (izquierda)
      const count1 = new Uint32Array(B, resPtr + resSize, 1)[0];
      const idHit1 = new Uint32Array(B, resPtr + resSize + 4, 1)[0];
      assert.strictEqual(count1, 1, `${name}: perdigón 1 dio en el blanco`);
      assert.strictEqual(idHit1, idLeft, `${name}: perdigón 1 impactó a la izquierda`);

      // Perdigón 2 (derecha)
      const count2 = new Uint32Array(B, resPtr + resSize * 2, 1)[0];
      const idHit2 = new Uint32Array(B, resPtr + resSize * 2 + 4, 1)[0];
      assert.strictEqual(count2, 1, `${name}: perdigón 2 dio en el blanco`);
      assert.strictEqual(idHit2, idRight, `${name}: perdigón 2 impactó a la derecha`);

      // Perdigón 3 (muy abierto: 0.5 rad = 28 grados -> fuera de blanco)
      const count3 = new Uint32Array(B, resPtr + resSize * 3, 1)[0];
      assert.strictEqual(count3, 0, `${name}: perdigón 3 no impactó a nadie`);
    }
    ok(true, 'hitscan shotgun con loteo SIMD genera impactos independientes por perdigón');
  }

  console.log('\n--- Test 7: Paridad exhaustiva SIMD vs Escalar en 1000 vectores ---');
  {
    let maxDiffSep = 0;
    let maxDiffDist = 0;
    for (let iter = 0; iter < 1000; iter++) {
      const px = (Math.random() - 0.5) * 400;
      const py = (Math.random() - 0.5) * 400;
      const pz = (Math.random() - 0.5) * 80;
      const xs = [Math.random() * 400, Math.random() * 400, Math.random() * 400, Math.random() * 400];
      const ys = [Math.random() * 400, Math.random() * 400, Math.random() * 400, Math.random() * 400];
      const zs = [Math.random() * 80, Math.random() * 80, Math.random() * 80, Math.random() * 80];

      // sep4
      new Float32Array(simd.memory.buffer, P_X, 4).set(xs);
      new Float32Array(simd.memory.buffer, P_Y, 4).set(ys);
      simd.test_sep4(px, py, P_X, P_Y, P_OUT1);
      const sOut = Array.from(new Float32Array(simd.memory.buffer, P_OUT1, 4));

      new Float32Array(scalar.memory.buffer, P_X, 4).set(xs);
      new Float32Array(scalar.memory.buffer, P_Y, 4).set(ys);
      scalar.test_sep4(px, py, P_X, P_Y, P_OUT1);
      const scOut = Array.from(new Float32Array(scalar.memory.buffer, P_OUT1, 4));

      for (let i = 0; i < 4; i++) {
        const d = Math.abs(sOut[i] - scOut[i]);
        if (d > maxDiffSep) maxDiffSep = d;
      }

      // dist4
      new Float32Array(simd.memory.buffer, P_Z, 4).set(zs);
      simd.test_dist4(px, py, pz, P_X, P_Y, P_Z, P_OUT1);
      const dOut = Array.from(new Float32Array(simd.memory.buffer, P_OUT1, 4));

      new Float32Array(scalar.memory.buffer, P_Z, 4).set(zs);
      scalar.test_dist4(px, py, pz, P_X, P_Y, P_Z, P_OUT1);
      const dcOut = Array.from(new Float32Array(scalar.memory.buffer, P_OUT1, 4));

      for (let i = 0; i < 4; i++) {
        const d = Math.abs(dOut[i] - dcOut[i]);
        if (d > maxDiffDist) maxDiffDist = d;
      }
    }
    ok(maxDiffSep < 1e-6 && maxDiffDist < 1e-6, `1000 iteraciones verificadas (maxDiffSep = ${maxDiffSep.toExponential(3)}, maxDiffDist = ${maxDiffDist.toExponential(3)})`);
  }

  console.log('\n========================================');
  console.log(`C2 SIMD: ${passed} pasados, ${failed} fallados.`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Error fatal en pruebas:', err);
  process.exit(1);
});
