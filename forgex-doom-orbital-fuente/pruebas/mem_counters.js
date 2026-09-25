// Verificación de contadores de memoria estática y dinámica (Plan A3)
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const wasmPath = path.join(ROOT, 'rust-gfx/forgex_gfx.wasm');
const scalarPath = path.join(ROOT, 'rust-gfx/forgex_gfx_scalar.wasm');

console.log('=== TEST MEM_COUNTERS: Verificación de telemetría de memoria ===\n');

const imports = {
  env: {
    now_import: () => 1000.0,
  },
};

function runMemCountersTest(name, filePath) {
  console.log(`--- Probando variante ${name} (${path.basename(filePath)}) ---`);
  const bytes = fs.readFileSync(filePath);
  const mod = new WebAssembly.Module(bytes);
  const inst = new WebAssembly.Instance(mod, imports);
  const X = inst.exports;

  // 1. wasm_bytes_static() > 50 MB y debe ser coherente con ~61 MB
  const staticBytes1 = X.wasm_bytes_static();
  const staticMB = (staticBytes1 / (1024 * 1024)).toFixed(2);
  console.log(`[${name}] wasm_bytes_static: ${staticBytes1} bytes (~${staticMB} MB)`);
  assert(
    staticBytes1 > 50 * 1024 * 1024,
    `wasm_bytes_static() (${staticBytes1}) debe ser > 50 MB`
  );

  // 2. wasm_bytes_static() debe ser CONSTANTE durante toda la ejecución
  X.w_reset();
  for (let i = 0; i < 20; i++) {
    X.w_add(10 + i, 10, 0.0, 5.0, 1, 0, 10.0 + i, 10.0, 1.0, 1.0, 0, 0);
  }
  const staticBytes2 = X.wasm_bytes_static();
  assert.strictEqual(
    staticBytes1,
    staticBytes2,
    `wasm_bytes_static() cambió durante la ejecución: ${staticBytes1} !== ${staticBytes2}`
  );
  console.log(`[${name}] wasm_bytes_static() es estrictamente constante.`);

  // 3. wasm_bytes_live(): 0 tras w_reset(), sube tras w_add, baja tras w_prune
  X.w_reset();
  const liveInitial = X.wasm_bytes_live();
  assert.strictEqual(liveInitial, 0, `wasm_bytes_live() debe ser 0 tras w_reset()`);

  // Agregar 3 bloques con distintas alturas
  X.w_add(5, 5, 0.0, 10.0, 1, 0, 5.0, 5.0, 1.0, 1.0, 0, 0); // zt = 10.0
  const liveAfter1 = X.wasm_bytes_live();
  assert(liveAfter1 > 0, `wasm_bytes_live() debe subir tras w_add`);

  X.w_add(6, 6, 0.0, 2.0, 1, 0, 6.0, 6.0, 1.0, 1.0, 0, 0);  // zt = 2.0
  const liveAfter2 = X.wasm_bytes_live();
  assert(liveAfter2 > liveAfter1, `wasm_bytes_live() debe aumentar con el 2do bloque`);

  X.w_add(7, 7, 0.0, 8.0, 1, 0, 7.0, 7.0, 1.0, 1.0, 0, 0);  // zt = 8.0
  const liveAfter3 = X.wasm_bytes_live();
  assert(liveAfter3 > liveAfter2, `wasm_bytes_live() debe aumentar con el 3er bloque`);

  // Podar con minz = 3.0 (debe podar el bloque de zt = 2.0)
  X.w_prune(3.0);
  const liveAfterPrune1 = X.wasm_bytes_live();
  assert(
    liveAfterPrune1 < liveAfter3,
    `wasm_bytes_live() debe bajar tras podar bloques: ${liveAfterPrune1} < ${liveAfter3}`
  );
  assert.strictEqual(
    liveAfterPrune1,
    liveAfter1 * 2,
    `Deberían quedar exactamente 2 bloques vivos de igual tamaño`
  );

  // Podar todo con minz = 100.0
  X.w_prune(100.0);
  const liveAfterPruneAll = X.wasm_bytes_live();
  assert.strictEqual(
    liveAfterPruneAll,
    0,
    `wasm_bytes_live() debe ser 0 tras podar todos los bloques`
  );
  console.log(`[${name}] wasm_bytes_live() responde exactamente a ciclo w_reset/w_add/w_prune.`);

  // 4. w_ops_add() y w_ops_free() coinciden exactamente con el conteo de llamadas
  X.w_reset();
  assert.strictEqual(X.w_ops_add(), 0, 'w_ops_add debe ser 0 tras reset');
  assert.strictEqual(X.w_ops_free(), 0, 'w_ops_free debe ser 0 tras reset');

  const NUM_ADDS = 17;
  for (let i = 0; i < NUM_ADDS; i++) {
    X.w_add(20 + i, 20, 0.0, 1.0, 1, 0, 20.0 + i, 20.0, 1.0, 1.0, 0, 0);
  }
  assert.strictEqual(X.w_ops_add(), NUM_ADDS, `w_ops_add() debe ser ${NUM_ADDS}`);
  assert.strictEqual(X.w_ops_free(), 0, 'w_ops_free() debe seguir en 0');

  // Podar todos los bloques añadidos
  X.w_prune(10.0);
  assert.strictEqual(X.w_ops_free(), NUM_ADDS, `w_ops_free() debe ser ${NUM_ADDS}`);
  assert.strictEqual(X.w_ops_add(), NUM_ADDS, `w_ops_add() debe mantenerse en ${NUM_ADDS}`);

  console.log(`[${name}] w_ops_add() y w_ops_free() registraron exactamente ${NUM_ADDS} operaciones.`);
  console.log(`[${name}] PASS: Todos los contadores de memoria verificados.\n`);
}

runMemCountersTest('SIMD', wasmPath);
runMemCountersTest('Scalar', scalarPath);

console.log('=================================================================');
console.log('PASS: mem_counters.js completado exitosamente.');
console.log('=================================================================');
