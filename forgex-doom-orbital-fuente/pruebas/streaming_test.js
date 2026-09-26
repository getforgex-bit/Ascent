// =========================================================================
// pruebas/streaming_test.js — Expulsión de chunks en el mundo de Rust (w_remove_box), sin navegador
// =========================================================================
// El juego (025-mundo.js) decide qué chunks están cargados y expulsa uno con w_remove_box(x0, y0, x1, y1, z0, z1):
// quita de las celdas [x0, x1) × [y0, y1) los bloques cuya base zb está en [z0, z1). Aquí se comprueba en las dos
// variantes que quita justo esos bloques, deja las listas enlazadas y el rango de alturas por celda (CZ) correctos,
// marca los rangos modificados y usa el índice vertical en anillo (capa = floor(z / 8) mód 8, sin tope en z = 56).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const MW = 532, CX = 17, CY = 17;
const chunkId = (x, y, z) => (((Math.floor(z / 8) % 8) + 8) % 8) * CX * CY + Math.floor(y / 32) * CX + Math.floor(x / 32);

function run(file) {
  const X = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(path.join(ROOT, file))), { env: { now_import: () => 0 } }).exports;
  const B = () => X.memory.buffer;
  // bloques de una celda en orden de la lista: [zb, zt]
  const cell = (x, y) => { const head = new Uint32Array(B(), X.p_head(), MW * MW), F = new Float32Array(B(), X.p_bl()), U = new Uint32Array(B(), X.p_bl());
    const out = []; for (let n = head[y * MW + x]; n; n = U[(n - 1) * 8 + 6]) out.push([F[(n - 1) * 8], F[(n - 1) * 8 + 1]]); return out; };
  const cz = (x, y) => Array.from(new Float32Array(B(), X.p_cz() + (y * MW + x) * 8, 2));
  const add = (x, y, zb, zt) => X.w_add(x, y, zb, zt, 1, 0, x, y, 1, 1, 0, 0);

  X.w_reset(); X.w_dirty();
  // Una celda con bloques en varias capas (una por debajo de 0 y otras por encima de 56) y otra celda en otro chunk
  for (const [zb, zt] of [[-3, -2], [2, 3], [9, 10], [15.5, 17], [60, 61], [100, 101]]) add(40, 40, zb, zt);
  add(41, 40, 10, 11); add(100, 40, 10, 11);
  assert.strictEqual(X.w_live(), 8);

  // Expulsar la capa [8, 16) del chunk horizontal (1, 1): celdas [32, 64) × [32, 64)
  X.w_dirty();
  const n = X.w_remove_box(32, 32, 64, 64, 8, 16);
  assert.strictEqual(n, 3, 'debe quitar los 3 bloques con base en [8, 16) de ese chunk (9, 15.5 y el de la celda vecina)');
  assert.deepStrictEqual(cell(40, 40), [[-3, -2], [2, 3], [60, 61], [100, 101]], 'la lista de la celda queda enlazada y ordenada');
  assert.deepStrictEqual(cell(41, 40), [], 'la celda vecina del mismo chunk queda vacía');
  assert.deepStrictEqual(cell(100, 40), [[10, 11]], 'otro chunk horizontal no se toca');
  assert.deepStrictEqual(cz(40, 40), [-3, 101], 'CZ se recalcula con lo que queda');
  assert.strictEqual(X.w_live(), 5);
  const d = new Uint32Array(B(), X.w_dirty(), 6);
  const cellMin = 40 * MW + 40, cellMax = 40 * MW + 41;
  assert(d[0] <= cellMin && d[1] >= cellMax + 1, `rango de celdas modificadas [${d[0]}, ${d[1]})`);
  assert(d[2] < d[3], 'rango de bloques modificados');
  assert(d[4] <= chunkId(40, 40, 9) && d[5] > chunkId(40, 40, 9), `chunk modificado en el anillo vertical: ${chunkId(40, 40, 9)} dentro de [${d[4]}, ${d[5]})`);
  console.log(`  [${file}] w_remove_box quita solo la capa pedida, reenlaza listas y recalcula CZ ✓`);

  // Capas altas y negativas: cada una en su posición del anillo (antes todo lo de z ≥ 56 caía en la capa 7)
  for (const [zb, zt] of [[100, 101], [-3, -2], [60, 61]]) {
    X.w_dirty(); X.w_remove_box(32, 32, 64, 64, Math.floor(zb / 8) * 8, Math.floor(zb / 8) * 8 + 8);
    const dd = new Uint32Array(B(), X.w_dirty(), 6), id = chunkId(40, 40, zb);
    assert(dd[4] <= id && dd[5] === id + 1, `z = ${zb}: chunk ${id} (capa ${((Math.floor(zb / 8) % 8) + 8) % 8} del anillo), obtenido [${dd[4]}, ${dd[5]})`);
  }
  assert.deepStrictEqual(cell(40, 40), [[2, 3]]);
  assert.deepStrictEqual(cz(40, 40), [2, 3]);
  console.log(`  [${file}] capas negativas y por encima de 56 van a su capa del anillo ✓`);

  // Quitar y volver a cargar deja el mundo igual; los huecos del pool se reutilizan
  X.w_remove_box(0, 0, MW, MW, -1e9, 1e9);
  assert.strictEqual(X.w_live(), 0);
  const used = X.w_used();
  for (let k = 0; k < 5; k++) add(40, 40, k * 2, k * 2 + 1);
  assert.strictEqual(X.w_used(), used, 'reutiliza los bloques liberados');
  assert.deepStrictEqual(cz(40, 40), [0, 9]);
  // Límites: cajas fuera del mapa o vacías no fallan
  assert.strictEqual(X.w_remove_box(-50, -50, -1, -1, 0, 100), 0);
  assert.strictEqual(X.w_remove_box(600, 600, 700, 700, 0, 100), 0);
  assert.strictEqual(X.w_remove_box(40, 40, 41, 41, 50, 50), 0);
  console.log(`  [${file}] recarga, reutilización del pool y cajas fuera del mapa ✓`);
}

console.log('=== Iniciando streaming_test.js ===\n');
for (const f of ['rust-gfx/forgex_gfx.wasm', 'rust-gfx/forgex_gfx_scalar.wasm']) run(f);
console.log('\nPASS: streaming_test.js completado exitosamente.');
