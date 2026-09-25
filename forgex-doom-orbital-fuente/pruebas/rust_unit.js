// Wrapper para ejecutar la suite de tests unitarios de Rust desde pruebas/
const { spawnSync } = require('child_process');
const path = require('path');

const target = path.join(__dirname, 'rust_unit', 'run_unit.js');
console.log(`[RUST_UNIT] Lanzando runner: ${target}\n`);

const res = spawnSync(process.execPath, [target], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..')
});

process.exit(res.status || 0);
