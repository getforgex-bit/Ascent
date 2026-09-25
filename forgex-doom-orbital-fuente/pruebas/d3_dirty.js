// pruebas/d3_dirty.js
// Validación de w_dirty() extendido a 6 elementos (chunks), reporte y reinicio.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const wasmPath = path.join(ROOT, 'rust-gfx/forgex_gfx.wasm');
const scalarPath = path.join(ROOT, 'rust-gfx/forgex_gfx_scalar.wasm');

console.log('=== TEST D3 DIRTY: w_dirty extendido a 6 elementos (chunks) ===\n');

const imports = {
  env: {
    now_import: () => 1000.0,
  },
};

function runDirtyTest(name, filePath) {
  console.log(`--- Probando variante ${name} (${path.basename(filePath)}) ---`);
  const bytes = fs.readFileSync(filePath);
  const mod = new WebAssembly.Module(bytes);
  const inst = new WebAssembly.Instance(mod, imports);
  const X = inst.exports;

  // 1. Inicializar mundo y verificar que w_dirty() devuelve 6 elementos
  X.w_reset();
  let ptr = X.w_dirty();
  let d = new Uint32Array(X.memory.buffer, ptr, 6);
  // Tras reset, d[4] == 0 y d[5] == N_CHUNKS (2312)
  assert.strictEqual(d[4], 0, 'Tras reset chunk_min debe ser 0');
  assert.strictEqual(d[5], 2312, 'Tras reset chunk_max debe ser N_CHUNKS (2312)');

  // 2. Tras consultar w_dirty(), los valores deben reiniciarse (vacío: min >= max)
  ptr = X.w_dirty();
  d = new Uint32Array(X.memory.buffer, ptr, 6);
  assert(d[4] >= d[5], `Tras drenar, chunk_min (${d[4]}) debe ser >= chunk_max (${d[5]})`);
  assert(d[0] >= d[1], `Tras drenar, cell_min (${d[0]}) debe ser >= cell_max (${d[1]})`);
  assert(d[2] >= d[3], `Tras drenar, block_min (${d[2]}) debe ser >= block_max (${d[3]})`);
  console.log(`[${name}] Reinicio y drenado correcto.`);

  // 3. Añadir bloque en (10, 10, 0) -> chunk_id(0, 0, 0) == 0
  // chunk_id = 0 * (17*17) + 0*17 + 0 = 0
  X.w_add(10, 10, 0.0, 2.0, 1, 0, 10.0, 10.0, 1.0, 1.0, 0, 0);
  ptr = X.w_dirty();
  d = new Uint32Array(X.memory.buffer, ptr, 6);
  assert.strictEqual(d[4], 0, `chunk_min debe ser 0 (obtenido ${d[4]})`);
  assert.strictEqual(d[5], 1, `chunk_max debe ser 1 (obtenido ${d[5]})`);
  console.log(`[${name}] Bloque en (10, 10, 0) reporta chunk [0, 1). OK.`);

  // 4. Verificar nuevo drenado tras consulta
  ptr = X.w_dirty();
  d = new Uint32Array(X.memory.buffer, ptr, 6);
  assert(d[4] >= d[5], 'w_dirty() drena correctamente');

  // 5. Añadir bloque en (100, 100, 20) -> cx=3, cy=3, cz=2
  // chunk_id = 2 * (17*17) + 3*17 + 3 = 2*289 + 51 + 3 = 578 + 54 = 632
  X.w_add(100, 100, 20.0, 22.0, 1, 0, 100.0, 100.0, 1.0, 1.0, 0, 0);
  ptr = X.w_dirty();
  d = new Uint32Array(X.memory.buffer, ptr, 6);
  assert.strictEqual(d[4], 632, `chunk_min debe ser 632 (obtenido ${d[4]})`);
  assert.strictEqual(d[5], 633, `chunk_max debe ser 633 (obtenido ${d[5]})`);
  console.log(`[${name}] Bloque en (100, 100, 20) reporta chunk [632, 633). OK.`);

  // 6. Añadir múltiples bloques en distintos chunks antes de consultar
  X.w_add(5, 5, 0.0, 1.0, 1, 0, 5.0, 5.0, 1.0, 1.0, 0, 0);       // chunk 0
  X.w_add(100, 100, 20.0, 22.0, 1, 0, 100.0, 100.0, 1.0, 1.0, 0, 0); // chunk 632
  ptr = X.w_dirty();
  d = new Uint32Array(X.memory.buffer, ptr, 6);
  assert.strictEqual(d[4], 0, `Rango combinado chunk_min debe ser 0 (obtenido ${d[4]})`);
  assert.strictEqual(d[5], 633, `Rango combinado chunk_max debe ser 633 (obtenido ${d[5]})`);
  console.log(`[${name}] Múltiples bloques engloban correctamente [0, 633). OK.`);

  // 7. Podar (w_prune) debe marcar los chunks de los bloques liberados
  X.w_dirty(); // limpiar
  X.w_prune(10.0); // libera el bloque en (5, 5, zt=1.0) que pertenece a chunk 0
  ptr = X.w_dirty();
  d = new Uint32Array(X.memory.buffer, ptr, 6);
  assert.strictEqual(d[4], 0, 'w_prune marca chunk_min = 0');
  assert(d[5] >= 1, 'w_prune marca chunk_max >= 1');
  console.log(`[${name}] w_prune marca chunks sucios correctamente. OK.`);

  console.log(`[${name}] PASS: Todos los tests de w_dirty() superados con éxito.\n`);
}

runDirtyTest('SIMD', wasmPath);
runDirtyTest('Scalar', scalarPath);

console.log('=================================================================');
console.log('PASS: d3_dirty.js completado exitosamente.');
console.log('=================================================================');
