// Verificación del layout modular del WebAssembly:
// - Comprueba que los dos .wasm contienen todos los símbolos requeridos por la referencia y por el plan A2.
// - Comprueba que dims() y sky_dims() devuelven los valores esperados.
// - Comprueba el ciclo básico de mundo: w_reset(), w_add(), w_live() == 1.
// - Comprueba los punteros SoA de A2: ents_ptr, prjs_ptr, flashes_ptr, parts_ptr.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const refPath = path.join(__dirname, 'referencia', 'exports_antes.json');

if (!fs.existsSync(refPath)) {
  console.error('ERROR: No se encontró pruebas/referencia/exports_antes.json');
  process.exit(1);
}

const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
const files = [
  { name: 'SIMD', file: path.join(ROOT, 'rust-gfx', 'forgex_gfx.wasm'), refKey: 'forgex_gfx' },
  { name: 'Scalar', file: path.join(ROOT, 'rust-gfx', 'forgex_gfx_scalar.wasm'), refKey: 'forgex_gfx_scalar' }
];

let failed = false;

for (const { name, file, refKey } of files) {
  if (!fs.existsSync(file)) {
    console.error(`ERROR: No se encontró el binario ${file}`);
    failed = true;
    continue;
  }

  const bytes = fs.readFileSync(file);
  const mod = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(mod, {});
  const exp = instance.exports;

  // 1. Verificar que no falte ningún export de la referencia base
  const expectedExports = ref[refKey].map(e => e.name);
  const missing = expectedExports.filter(e => !(e in exp));

  if (missing.length > 0) {
    console.error(`ERROR en ${name}: Faltan exports requeridos (${missing.length}):`, missing);
    failed = true;
  } else {
    console.log(`[${name}] Todos los exports de la referencia base están presentes (${expectedExports.length})`);
  }

  // 2. Verificar los nuevos exports de ECS SoA (Plan A2)
  const a2Exports = ['ents_ptr', 'prjs_ptr', 'flashes_ptr', 'parts_ptr'];
  for (const ep of a2Exports) {
    if (typeof exp[ep] !== 'function') {
      console.error(`ERROR en ${name}: falta el export de A2 '${ep}'`);
      failed = true;
    } else {
      const ptr = exp[ep]();
      if (ptr === 0 || ptr === undefined) {
        console.error(`ERROR en ${name}: ${ep}() devolvió puntero nulo o indefinido (${ptr})`);
        failed = true;
      }
    }
  }
  console.log(`[${name}] Punteros SoA de A2 verificados (ents, prjs, flashes, parts)`);

  // 3. Verificar los nuevos exports de Telemetría y Memoria (Plan A3)
  const a3Exports = [
    'wasm_alloc_count',
    'wasm_reset_alloc_count',
    'wasm_bytes_static',
    'wasm_bytes_live',
    'w_ops_add',
    'w_ops_free',
    'ents_ops_spawn',
    'ents_ops_destroy'
  ];
  for (const ep of a3Exports) {
    if (typeof exp[ep] !== 'function') {
      console.error(`ERROR en ${name}: falta el export de A3 '${ep}'`);
      failed = true;
    }
  }
  console.log(`[${name}] Exports de memoria y telemetría de A3 verificados`);

  // 3. Verificar dims() y sky_dims()
  const MW = 532, T = 128, SKW = 1536, SKH = 768;
  const expectedDims = MW * 10000 + T;
  const expectedSkyDims = SKW * 10000 + SKH;

  const actualDims = exp.dims();
  const actualSkyDims = exp.sky_dims();

  if (actualDims !== expectedDims) {
    console.error(`ERROR en ${name}: dims() devolvió ${actualDims}, se esperaba ${expectedDims}`);
    failed = true;
  }
  if (actualSkyDims !== expectedSkyDims) {
    console.error(`ERROR en ${name}: sky_dims() devolvió ${actualSkyDims}, se esperaba ${expectedSkyDims}`);
    failed = true;
  }

  // 4. Probar ciclo básico de mundo
  exp.w_reset();
  if (exp.w_live() !== 0) {
    console.error(`ERROR en ${name}: w_live() tras w_reset() no es 0`);
    failed = true;
  }

  const added = exp.w_add(1, 1, 0.0, 1.0, 1, 0, 0.0, 0.0, 1.0, 1.0, 0, 0);
  if (added !== 1) {
    console.error(`ERROR en ${name}: w_add() devolvió ${added}, se esperaba 1`);
    failed = true;
  }

  const live = exp.w_live();
  if (live !== 1) {
    console.error(`ERROR en ${name}: w_live() devolvió ${live}, se esperaba 1`);
    failed = true;
  }

  console.log(`[${name}] dims=${actualDims}, sky_dims=${actualSkyDims}, test w_add/w_live OK`);
}

if (failed) {
  console.error('\nFAIL: modules_layout.js falló en una o más comprobaciones.');
  process.exit(1);
} else {
  console.log('\nPASS: modules_layout.js completado exitosamente.');
  process.exit(0);
}
