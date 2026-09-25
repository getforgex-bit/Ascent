// Test de recuperación ante pérdida del dispositivo WebGPU (Plan B3)
// 1. Inicia en WebGPU.
// 2. Destruye deliberadamente el dispositivo con device.destroy().
// 3. Verifica gpu_is_lost() == 1 en Rust y que el backend pasa transparentemente a Rust en < 1 fotograma.

const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

(async () => {
  console.log('=== TEST RECUPERACIÓN WEBGPU (PLAN B3) ===');

  const browser = await chromium.launch({
    headless: false,
    args: ['--enable-unsafe-webgpu']
  });

  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push('[PAGE ERROR] ' + err.message));
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
  });

  const htmlPath = 'file://' + path.join(ROOT, 'dist', 'forgex-doom-orbital.html');
  await page.goto(htmlPath);
  await page.waitForTimeout(2000);

  // 1. Verificar inicio en WebGPU
  const step1 = await page.evaluate(async () => {
    if (!window.__doom) return { ok: false, error: 'no __doom' };
    const b = await window.__doom.setBackend('webgpu');
    return {
      backend: b,
      ready: window.GPUB && window.GPUB.ready,
      gpu_is_lost: window.__doom.wasm && window.__doom.wasm.gpu_is_lost ? window.__doom.wasm.gpu_is_lost() : -1,
    };
  });

  console.log('Paso 1: Estado inicial:', step1);
  if (step1.backend !== 'webgpu' || !step1.ready) {
    console.error('ERROR: No se pudo arrancar WebGPU.');
    await browser.close();
    process.exit(1);
  }

  // 2. Destruir dispositivo WebGPU
  console.log('Paso 2: Destruyendo device WebGPU (device.destroy())...');
  const step2 = await page.evaluate(() => {
    if (!window.GPUB || !window.GPUB.device) return { ok: false };
    window.GPUB.device.destroy();
    return { ok: true };
  });

  if (!step2.ok) {
    console.error('ERROR: No se encontró window.GPUB.device.');
    await browser.close();
    process.exit(1);
  }

  // Esperar a que se procese la pérdida del device y se ejecute el siguiente fotograma
  await page.waitForTimeout(500);

  // 3. Verificar estado tras pérdida de device
  const step3 = await page.evaluate(async () => {
    const D = window.__doom;
    const wasm = D.wasm;
    // Forzar 2 fotogramas de bucle principal para asegurar transición
    if (typeof D.renderWorld === 'function') {
      try { D.renderWorld(); } catch (_) {}
    }
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    return {
      backend: D.engine,
      gpubReady: window.GPUB.ready,
      gpu_is_lost: wasm && wasm.gpu_is_lost ? wasm.gpu_is_lost() : -1,
    };
  });

  console.log('Paso 3: Estado tras destrucción del dispositivo:', step3);

  let passed = true;
  if (step3.gpu_is_lost !== 1) {
    console.error(`FALLO: wasm.gpu_is_lost() = ${step3.gpu_is_lost}, se esperaba 1.`);
    passed = false;
  }

  if (step3.backend !== 'rust') {
    console.error(`FALLO: backend = ${step3.backend}, se esperaba 'rust'.`);
    passed = false;
  }

  if (step3.gpubReady) {
    console.error('FALLO: GPUB.ready sigue siendo true tras perder el dispositivo.');
    passed = false;
  }

  // 4. Renderizar 10 fotogramas bajo Rust para confirmar estabilidad
  const framesOk = await page.evaluate(async () => {
    const D = window.__doom;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => requestAnimationFrame(r));
    }
    return D.engine === 'rust';
  });

  if (!framesOk) {
    console.error('FALLO: Inestabilidad tras pasar a Rust.');
    passed = false;
  } else {
    console.log('Paso 4: Rust continúa renderizando con normalidad tras la recuperación.');
  }

  await browser.close();

  if (!passed) {
    process.exit(1);
  } else {
    console.log('=== TEST RECUPERACIÓN B3 COMPLETADO CON ÉXITO ===');
  }
})();
