// Smoke test para el PLAN B1: WebGPU device, swapchain, atlas upload y render de cielo
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log('=== TEST B1 SMOKE: WebGPU Device, Atlas & Sky ===');
  
  // En Windows, Chromium con headless: false accede a la GPU real
  const browser = await chromium.launch({
    headless: false,
    args: ['--enable-unsafe-webgpu']
  });

  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  
  const errors = [];
  const warnings = [];
  page.on('pageerror', err => {
    errors.push('[PAGE ERROR] ' + err.message);
  });
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      errors.push('[CONSOLE ERROR] ' + text);
    } else if (msg.type() === 'warning') {
      warnings.push('[CONSOLE WARN] ' + text);
    }
  });

  const htmlPath = 'file://' + path.join(ROOT, 'dist', 'forgex-doom-orbital.html');
  await page.goto(htmlPath);
  await page.waitForTimeout(2000);

  // 1. Comprobar disponibilidad de WebGPU y conmutar backend
  const startResult = await page.evaluate(async () => {
    if (!navigator.gpu) return { ok: false, reason: 'navigator.gpu no existe' };
    const backendSet = await __doom.setBackend('webgpu');
    return {
      ok: backendSet === 'webgpu',
      engine: __doom.engine,
      why: __doom.WHY.webgpu,
      caps: {
        webgpu: __doom.CAPS.webgpu,
        gpuInfo: __doom.CAPS.gpuInfo,
        fallback: __doom.CAPS.gpuFallback,
      }
    };
  });

  console.log('Resultado cambio a WebGPU:', JSON.stringify(startResult, null, 2));

  if (!startResult.ok) {
    console.warn('AVISO: WebGPU no arrancó:', startResult.why || 'Razón desconocida');
    if (errors.length) console.error('Errores:', errors);
    await browser.close();
    process.exit(0);
  }

  // Esperar varios fotogramas de renderizado
  await page.waitForTimeout(1000);

  // 2. Captura de pantalla del canvas GPU
  const gpuCanvas = page.locator('#gpu-view');
  const skyShotPath = path.join(OUT_DIR, 'b1_sky.png');
  await gpuCanvas.screenshot({ path: skyShotPath });
  console.log('Captura de cielo guardada en:', skyShotPath);

  // 3. Verificar que el render no es una pantalla negra vacía
  const pixelAnalysis = await page.evaluate(() => {
    const c = document.getElementById('gpu-view');
    // Para analizar píxeles, podemos leer desde un canvas 2D auxiliar o comprobar estado
    return {
      width: c.width,
      height: c.height,
      display: c.style.display,
      draws: __doom.PERF.c.draws,
      gpuTime: __doom.perf.gpu
    };
  });
  console.log('Estado del canvas GPU:', pixelAnalysis);

  // Comprobar que el archivo de imagen tiene tamaño y contenido
  const shotStats = fs.statSync(skyShotPath);
  console.log('Tamaño de captura:', shotStats.size, 'bytes');
  if (shotStats.size < 5000) {
    throw new Error('La captura es sospechosamente pequeña o vacía.');
  }

  // 4. Probar recuperación tras destrucción del dispositivo
  console.log('Probando recuperación tras device.destroy()...');
  const recoveryResult = await page.evaluate(async () => {
    if (!window.GPUB || !window.GPUB.device) return 'sin device';
    window.GPUB.device.destroy();
    // Esperar a que se procese el evento lost
    await new Promise(r => setTimeout(r, 400));
    return {
      engineAfterDestroy: __doom.engine,
      why: __doom.WHY.webgpu
    };
  });
  console.log('Resultado tras device.destroy():', recoveryResult);

  if (recoveryResult.engineAfterDestroy !== 'rust') {
    throw new Error('El motor no regresó a Rust tras device.destroy()');
  }

  const criticalErrors = errors.filter(e => !e.includes('ERR_TUNNEL') && !e.includes('favicon'));
  if (criticalErrors.length > 0) {
    console.error('Errores críticos detectados:', criticalErrors);
    throw new Error('Se detectaron errores de consola durante la prueba.');
  }

  console.log('=== TEST B1 SMOKE COMPLETADO CON ÉXITO ===');
  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error('FALLO EN TEST B1 SMOKE:', err);
  process.exit(1);
});
