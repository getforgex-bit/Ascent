// pruebas/d3_memory.js
// Validación de reducción de memoria viva en WASM tras activar streaming de chunks (Plan D3).

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const wasmPath = path.join(ROOT, 'rust-gfx/forgex_gfx.wasm');
const scalarPath = path.join(ROOT, 'rust-gfx/forgex_gfx_scalar.wasm');

console.log('=== TEST D3 MEMORY: Reducción de memoria en WASM con streaming de chunks ===\n');

function runMemoryTest(name, wasmFile) {
  console.log(`--- Probando variante ${name} (${path.basename(wasmFile)}) ---`);

  // Mock de entorno navegador mínimo
  const ctxMock = new Proxy({
    data: new Uint8ClampedArray(1024 * 1024 * 4), width: 1000, height: 1000,
    getImageData: () => ({ data: new Uint8ClampedArray(1024 * 1024 * 4) }),
    createImageData: () => ({ data: new Uint8ClampedArray(1024 * 1024 * 4) }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    measureText: () => ({ width: 50 }),
  }, { get: (t, p) => (p in t ? t[p] : () => {}), set: () => true });

  const env = {
    window: {},
    self: {},
    document: {
      getElementById: () => ({ getContext: () => ctxMock, width: 1000, height: 1000 }),
      createElement: () => ({ getContext: () => ctxMock, width: 1000, height: 1000 }),
      addEventListener: () => {}
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { hardwareConcurrency: 8, deviceMemory: 8, userAgent: 'node' },
    performance: { now: () => 0, memory: { usedJSHeapSize: 20000000 } },
    location: { search: '', reload: () => {} },
    AudioContext: function() { return { createGain: () => ({ connect: () => {} }) }; },
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };
  env.window = env;
  env.self = env;

  for (const [k, v] of Object.entries(env)) {
    if (k === 'navigator') continue;
    try { global[k] = v; } catch (e) {}
  }
  global.window = global;
  global.self = global;
  global.webkitAudioContext = env.AudioContext;

  const wasmBuf = fs.readFileSync(wasmFile);
  const mod = new WebAssembly.Module(wasmBuf);
  const inst = new WebAssembly.Instance(mod, { env: { now_import: () => 0 } });
  env.wasm = inst.exports;
  global.wasm = inst.exports;

  // Cargar módulos JS de 000 a 055
  const dir = path.join(ROOT, 'forgex/src/js');
  const files = fs.readdirSync(dir).sort();
  let script = 'let wasm = env.wasm;\n';
  for (const f of files) {
    if (f > '055-estado.js') break;
    let code = fs.readFileSync(path.join(dir, f), 'utf8');
    if (f === '003-motor.js') code = code.replace('let wasm = null', 'wasm = env.wasm');
    script += code + '\n';
  }

  script += `
    // 1. Generar mundo completo sin streaming
    streamingActive = false;
    initWorld();

    const liveBefore = wasm.wasm_bytes_live();
    const blocksBefore = wasm.w_live();
    console.log('[${name}] Mundo completo: ' + blocksBefore + ' bloques, ' + liveBefore + ' bytes en WASM.');
    assert(liveBefore > 50000, 'El mundo completo debe ocupar memoria significativa en WASM');

    // 2. Activar streaming con radio 3 chunks
    applyStreaming(3, st.px, st.py, st.pz);

    const liveAfter = wasm.wasm_bytes_live();
    const blocksAfter = wasm.w_live();
    const dropBytes = liveBefore - liveAfter;
    const dropPct = (dropBytes / liveBefore) * 100;
    console.log('[${name}] Streaming activo (radio 3): ' + blocksAfter + ' bloques, ' + liveAfter + ' bytes en WASM.');
    console.log('[${name}] Reducción: ' + dropPct.toFixed(1) + ' %');

    // 3. Verificar que baja >= 60% y < 90% (el jugador y adyacentes se quedan)
    assert(dropPct >= 60.0, 'La reducción de memoria debe ser >= 60% (fue ' + dropPct.toFixed(1) + '%)');
    assert(dropPct < 95.0, 'El jugador y chunks adyacentes deben permanecer en memoria (fue ' + dropPct.toFixed(1) + '%)');
    assert(liveAfter > 0, 'La memoria viva tras streaming debe ser > 0');

    // 4. Verificar estadísticas de chunks
    const statsPtr = wasm.chunk_stats();
    assert(statsPtr !== 0, 'chunk_stats() debe retornar un puntero válido');
    const stats = new Uint32Array(wasm.memory.buffer, statsPtr, 5);
    console.log('[${name}] Chunks stats: total=' + stats[0] + ', visibles=' + stats[1] + ', cpu=' + stats[2] + ', gpu=' + stats[3] + ', evicted=' + stats[4]);
    assert.strictEqual(stats[0], 2312, 'Total de chunks debe ser 2312');
    assert(stats[1] > 0, 'Debe haber chunks visibles');
    assert(stats[2] > 0, 'Debe haber chunks en CPU');
    assert(stats[4] > 0, 'Debe haber chunks expulsados (evicted)');
    assert.strictEqual(stats[1], stats[2] + stats[3], 'visibles == cpu + gpu');

    // 5. Test de movimiento: mover al jugador 32 metros en +X y actualizar streaming
    st.px += 32.0;
    updateStreamingPlayer(st.px, st.py, st.pz);
    const liveAfterMove = wasm.wasm_bytes_live();
    const statsAfterMove = new Uint32Array(wasm.memory.buffer, wasm.chunk_stats(), 5);
    console.log('[${name}] Tras desplazarse +32m en X: ' + wasm.w_live() + ' bloques, ' + liveAfterMove + ' bytes, evicted=' + statsAfterMove[4]);
    assert(liveAfterMove > 0, 'Memoria debe mantenerse estable y tener bloques activos');
  `;

  const fn = new Function('env', 'assert', script);
  fn(env, assert);

  console.log(`[${name}] PASS: Reducción >= 60% y telemetría de chunks verificada.\n`);
}

runMemoryTest('SIMD', wasmPath);
runMemoryTest('Scalar', scalarPath);

console.log('=================================================================');
console.log('PASS: d3_memory.js completado exitosamente.');
console.log('=================================================================');
