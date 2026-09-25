// =========================================================================
// pruebas/chunk_test.js — Pruebas unitarias de chunk.rs (WASM)
// =========================================================================
const fs = require('fs');
const path = require('path');

const wasmPath = path.join(__dirname, 'chunk_test.wasm');
const buf = fs.readFileSync(wasmPath);
const mod = new WebAssembly.Module(buf);
const inst = new WebAssembly.Instance(mod, {});

if (typeof inst.exports.run_tests !== 'function') {
  console.error('Error: chunk_test.wasm no exporta run_tests()');
  process.exit(1);
}

const ret = inst.exports.run_tests();
if (ret === 0) {
  console.log('PASS: chunk_test.js completado exitosamente (6/6 tests de chunk.rs pasaron).');
  process.exit(0);
} else {
  console.error('FAIL: chunk_test.js falló con código:', ret);
  process.exit(ret);
}
