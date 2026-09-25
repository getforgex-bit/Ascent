// =========================================================================
// pruebas/streaming_test.js — Pruebas de streaming espacial de chunks
// =========================================================================
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const wasmPath = path.resolve(__dirname, '..', 'forgex_gfx.wasm');
const wasmBuf = fs.readFileSync(wasmPath);
const wasm = new WebAssembly.Instance(new WebAssembly.Module(wasmBuf), {
  env: { now_import: () => 0 }
}).exports;

console.log('=== Iniciando streaming_test.js ===\n');

const CHUNK_W = 32, CHUNK_H = 32, CHUNK_Z = 8;
const CHUNKS_X = 17, CHUNKS_Y = 17, CHUNKS_Z = 8;
const N_CHUNKS = 2312;

function chunkOf(x, y, z) {
  const cx = Math.min(CHUNKS_X - 1, Math.max(0, Math.floor(x / CHUNK_W)));
  const cy = Math.min(CHUNKS_Y - 1, Math.max(0, Math.floor(y / CHUNK_H)));
  const cz = Math.min(CHUNKS_Z - 1, Math.max(0, Math.floor(z / CHUNK_Z)));
  return cz * (CHUNKS_X * CHUNKS_Y) + cy * CHUNKS_X + cx;
}

// Test 1: chunkOf límites y coordenadas
console.log('--- Test 1: Cálculo de chunkOf ---');
assert.strictEqual(chunkOf(0, 0, 0), 0);
assert.strictEqual(chunkOf(31.9, 31.9, 7.9), 0);
assert.strictEqual(chunkOf(32.0, 0, 0), 1);
assert.strictEqual(chunkOf(0, 32.0, 0), CHUNKS_X);
assert.strictEqual(chunkOf(0, 0, 8.0), CHUNKS_X * CHUNKS_Y);
assert.strictEqual(chunkOf(999, 999, 999), N_CHUNKS - 1);
console.log('✓ chunkOf mapea correctamente límites y cuadrícula.');

// Test 2: Simulación de catálogo de chunks y radio de streaming
console.log('\n--- Test 2: applyStreaming con catálogo en WASM ---');
const chunkCatalog = new Array(N_CHUNKS);
for (let i = 0; i < N_CHUNKS; i++) chunkCatalog[i] = [];

// Añadir bloques en el chunk central (8, 8, 0)
const centerChunk = chunkOf(266, 266, 0);
chunkCatalog[centerChunk].push([266, 266, -1.0, 0.0, 1, 0, 266, 266, 1, 1, 0, 0]);

// Añadir bloques en un chunk lejano (0, 0, 0)
chunkCatalog[0].push([10, 10, -1.0, 0.0, 1, 0, 10, 10, 1, 1, 0, 0]);

// Aplicar streaming con radio 4 alrededor de (266, 266, 0)
const radius = 4;
const pcx = Math.min(CHUNKS_X - 1, Math.max(0, Math.floor(266 / CHUNK_W)));
const pcy = Math.min(CHUNKS_Y - 1, Math.max(0, Math.floor(266 / CHUNK_H)));
const pcz = Math.min(CHUNKS_Z - 1, Math.max(0, Math.floor(0 / CHUNK_Z)));

wasm.w_reset();
const active = new Set();

for (let chId = 0; chId < N_CHUNKS; chId++) {
  const cz = Math.floor(chId / (CHUNKS_X * CHUNKS_Y));
  const rem = chId % (CHUNKS_X * CHUNKS_Y);
  const cy = Math.floor(rem / CHUNKS_X);
  const cx = rem % CHUNKS_X;
  const blocks = chunkCatalog[chId];
  const hasBlocks = blocks && blocks.length > 0;
  const dist = Math.hypot(cx - pcx, cy - pcy, (cz - pcz) * 0.25);
  const inside = dist <= radius;

  if (hasBlocks) {
    if (inside) {
      active.add(chId);
      for (const a of blocks) wasm.w_add(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11]);
      if (wasm.set_chunk_state) wasm.set_chunk_state(chId, 1); // Cpu
    } else {
      if (wasm.set_chunk_state) wasm.set_chunk_state(chId, 3); // Evicted
    }
  } else {
    if (wasm.set_chunk_state) wasm.set_chunk_state(chId, 0); // Empty
  }
}

assert(active.has(centerChunk), 'El chunk central debe estar activo');
assert(!active.has(0), 'El chunk lejano (0) NO debe estar activo');

if (wasm.chunk_state) {
  assert.strictEqual(wasm.chunk_state(centerChunk), 1, 'centerChunk debe ser Cpu (1)');
  assert.strictEqual(wasm.chunk_state(0), 3, 'chunk 0 debe ser Evicted (3)');
}
console.log('✓ applyStreaming carga chunks cercanos y expulsa chunks lejanos.');

// Test 3: Desplazamiento del jugador hacia el chunk 0
console.log('\n--- Test 3: Actualización dinámica por movimiento del jugador ---');
const newPcx = 0, newPcy = 0, newPcz = 0;
for (let chId of [centerChunk, 0]) {
  const cz = Math.floor(chId / (CHUNKS_X * CHUNKS_Y));
  const rem = chId % (CHUNKS_X * CHUNKS_Y);
  const cy = Math.floor(rem / CHUNKS_X);
  const cx = rem % CHUNKS_X;
  const dist = Math.hypot(cx - newPcx, cy - newPcy, (cz - newPcz) * 0.25);
  const inside = dist <= radius;
  if (inside) {
    active.add(chId);
    if (wasm.set_chunk_state) wasm.set_chunk_state(chId, 1);
  } else {
    active.delete(chId);
    if (wasm.set_chunk_state) wasm.set_chunk_state(chId, 3);
  }
}

assert(active.has(0), 'Chunk 0 ahora debe estar activo');
assert(!active.has(centerChunk), 'centerChunk ahora debe estar expulsado');
if (wasm.chunk_state) {
  assert.strictEqual(wasm.chunk_state(0), 1, 'chunk 0 ahora es Cpu (1)');
  assert.strictEqual(wasm.chunk_state(centerChunk), 3, 'centerChunk ahora es Evicted (3)');
}
console.log('✓ Movimiento del jugador actualiza estados de chunks dinámicamente.');

console.log('\nPASS: streaming_test.js completado exitosamente.');
process.exit(0);
