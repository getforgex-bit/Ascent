// Test de verificación E2: Overlay extendido de 8 líneas y telemetría de rendimiento
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SALIDA = path.join(__dirname, 'salida');
fs.mkdirSync(SALIDA, { recursive: true });

(async () => {
  console.log('=== TEST E2: Verificación del Overlay Extendido (8 líneas) ===\n');

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (err) {
    console.error('Error al arrancar Chromium:', err);
    process.exit(1);
  }

  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

  const errors = [];
  page.on('pageerror', err => errors.push('[PAGE ERROR] ' + err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('[CONSOLE ERROR] ' + msg.text());
  });

  const htmlPath = 'file://' + path.join(ROOT, 'dist', 'forgex-doom-orbital.html');
  console.log('Cargando:', htmlPath);
  await page.goto(htmlPath);

  // Esperar a que __doom esté inicializado
  try {
    await page.waitForFunction(() => typeof window.__doom !== 'undefined', { timeout: 10000 });
  } catch (e) {
    console.error('Timeout esperando a window.__doom');
    if (errors.length) console.error('Errores en página:', errors);
    await browser.close();
    process.exit(1);
  }

  // Activar overlay
  await page.evaluate(() => {
    window.__doom.cfg.debug.overlay = true;
  });
  console.log('Overlay activado en cfg.debug.overlay = true');

  // Esperar al menos 1.5s para que corran frames y perfStats se invoque
  await page.waitForTimeout(2000);

  // Forzar una llamada a perfStats para asegurar actualización inmediata si hiciera falta
  await page.evaluate(() => {
    if (window.__doom.perfStats) window.__doom.perfStats();
  });

  // Capturar pantalla completa a salida/e2_overlay.png
  const screenshotPath = path.join(SALIDA, 'e2_overlay.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Captura de pantalla guardada en:', screenshotPath);

  // Evaluar datos de PERF.lines
  const perfData = await page.evaluate(() => {
    const P = window.__doom.PERF;
    if (!P) return { ok: false, error: 'window.__doom.PERF no encontrado' };
    if (!P.lines) return { ok: false, error: 'PERF.lines es nulo' };
    return {
      ok: true,
      numLines: P.lines.length,
      lines: P.lines.map(l => ({ color: l[0], text: l[1] })),
      overlayW: P.overlayW,
      hasWasm: !!window.__doom.wasm
    };
  });

  if (!perfData.ok) {
    console.error('FAIL: No se obtuvieron las líneas de PERF:', perfData.error);
    await browser.close();
    process.exit(1);
  }

  console.log(`\nLíneas obtenidas del overlay (${perfData.numLines} líneas, ancho cacheado: ${perfData.overlayW}px):`);
  perfData.lines.forEach((l, idx) => {
    console.log(`  [Línea ${idx + 1}] (${l.color}): ${l.text}`);
  });

  // Validaciones
  let failed = false;

  // 1. Debe haber exactamente 8 líneas
  if (perfData.numLines === 8) {
    console.log('\n✓ Validación 1: PERF.lines tiene exactamente 8 líneas.');
  } else {
    console.error(`\n✗ FAIL Validación 1: Se esperaban 8 líneas, se encontraron ${perfData.numLines}.`);
    failed = true;
  }

  // 2. Línea 3 (CPU Rust) debe contener 7 números o '(inactivo)'
  const line3Text = perfData.lines[2] ? perfData.lines[2].text : '';
  const isInactive = line3Text.includes('(inactivo)');
  // Extraer números (incluyendo floats como 0.0)
  const numbersInLine3 = line3Text.match(/[-+]?\d*\.?\d+/g) || [];

  if (isInactive) {
    console.log('✓ Validación 2: Línea 3 indica CPU Rust inactivo correctamente.');
  } else if (numbersInLine3.length === 7) {
    console.log(`✓ Validación 2: Línea 3 contiene exactamente 7 números de profiling (${numbersInLine3.join(', ')}).`);
  } else {
    console.error(`✗ FAIL Validación 2: Línea 3 no contiene 7 números ni '(inactivo)': "${line3Text}" (números encontrados: ${numbersInLine3.length})`);
    failed = true;
  }

  // 3. Comprobar que overlayW fue calculado y es > 0
  if (perfData.overlayW > 0) {
    console.log(`✓ Validación 3: overlayW cacheado correctamente (${perfData.overlayW}px).`);
  } else {
    console.error('✗ FAIL Validación 3: overlayW no es mayor a 0.');
    failed = true;
  }

  if (errors.length) {
    console.warn('Avisos/errores registrados en consola:', errors);
  }

  await browser.close();

  if (failed) {
    console.error('\nTEST E2 FALLIDO.');
    process.exit(1);
  } else {
    console.log('\n=== TEST E2 COMPLETADO CON ÉXITO ===');
    process.exit(0);
  }
})();
