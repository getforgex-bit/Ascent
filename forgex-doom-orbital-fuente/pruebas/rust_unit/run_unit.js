// Runner unificado de pruebas unitarias de Rust para Node.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RUST_UNIT_DIR = __dirname;
const ROOT_DIR = path.resolve(RUST_UNIT_DIR, '../..');

function getRustcPath() {
  const cargoRustc = path.join(process.env.USERPROFILE || '', '.cargo', 'bin', 'rustc.exe');
  if (fs.existsSync(cargoRustc)) return `"${cargoRustc}"`;
  return 'rustc';
}

function compileWasmTest(sourceFile, outFile) {
  const rustc = getRustcPath();
  const cmd = `${rustc} --target wasm32-unknown-unknown --crate-type cdylib -O "${sourceFile}" -o "${outFile}"`;
  console.log(`[BUILD] Compilando ${path.basename(sourceFile)} -> ${path.basename(outFile)}...`);
  execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit' });
}

function runWasmSuite(name, wasmPath) {
  console.log(`\n--- Ejecutando ${name} (${path.basename(wasmPath)}) ---`);
  const buf = fs.readFileSync(wasmPath);
  const mod = new WebAssembly.Module(buf);
  const inst = new WebAssembly.Instance(mod, {});
  
  if (typeof inst.exports.run_tests !== 'function') {
    throw new Error(`El módulo ${wasmPath} no exporta run_tests()`);
  }
  
  const code = inst.exports.run_tests();
  if (code !== 0) {
    throw new Error(`Fallo en las pruebas de ${name} con código de salida ${code}`);
  }
  console.log(`[PASS] ${name}: Todos los tests pasaron exitosamente.`);
}

function main() {
  console.log('====================================================');
  console.log('  EJECUTANDO TESTS UNITARIOS DE RUST (WASM RUNNER)  ');
  console.log('====================================================');

  const suites = [
    {
      name: 'Pool<T, N> (pool.rs)',
      src: path.join(RUST_UNIT_DIR, 'pool.rs'),
      wasm: path.join(RUST_UNIT_DIR, 'pool_test.wasm')
    },
    {
      name: 'ECS SoA (ecs.rs)',
      src: path.join(RUST_UNIT_DIR, 'ecs.rs'),
      wasm: path.join(RUST_UNIT_DIR, 'ecs_test.wasm')
    }
  ];

  for (const s of suites) {
    compileWasmTest(s.src, s.wasm);
    runWasmSuite(s.name, s.wasm);
  }

  console.log('\n====================================================');
  console.log('  TODO OK: 100% DE TESTS UNITARIOS DE RUST PASARON  ');
  console.log('====================================================');
}

main();
