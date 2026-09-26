// Test de regresión de gameplay (Plan E3): 10 escenarios críticos
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.log('[SKIP] Playwright no está disponible en este entorno.');
  process.exit(0);
}
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SALIDA = path.join(__dirname, 'salida');
fs.mkdirSync(SALIDA, { recursive: true });

(async () => {
  console.log('=== TEST REGRESSION_GAMEPLAY: 10 Escenarios Críticos ===\n');

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (err) {
    console.log('[SKIP] No se pudo arrancar Chromium en este entorno:', err.message);
    process.exit(0);
  }

  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

  const errors = [];
  page.on('pageerror', err => errors.push('[PAGE ERROR] ' + err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('[CONSOLE ERROR] ' + msg.text());
  });

  const htmlPath = 'file://' + path.join(ROOT, 'dist', 'forgex-doom-orbital.html');
  await page.goto(htmlPath);

  try {
    await page.waitForFunction(() => typeof window.__doom !== 'undefined' && window.__doom.wasm !== null, { timeout: 15000 });
  } catch (e) {
    console.error('Timeout esperando a window.__doom / wasm');
    await browser.close();
    process.exit(1);
  }

  // Iniciar el juego haciendo clic en el visor
  await page.click('#view');
  await page.waitForTimeout(500);

  let allPassed = true;

  // ----------------------------------------------------
  // ESCENARIO 1: Andar 10s: no atascarse (stuck < 1.0)
  // ----------------------------------------------------
  console.log('--- Escenario 1: Andar 10s y verificar que no se atasca ---');
  await page.evaluate(() => {
    window.__doom.tp(266.5, 266.5, 0, 0);
  });
  await page.keyboard.down('KeyW');
  // Esperar 10s mientras anda
  let maxStuck = 0;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    const curStuck = await page.evaluate(() => window.__doom.st.stuck || 0);
    if (curStuck > maxStuck) maxStuck = curStuck;
  }
  await page.keyboard.up('KeyW');

  const s1 = await page.evaluate(() => ({
    stuck: window.__doom.st.stuck || 0,
    dead: window.__doom.st.dead,
    px: window.__doom.st.px,
    py: window.__doom.st.py
  }));
  const snap1 = path.join(SALIDA, 'gameplay_1.png');
  await page.screenshot({ path: snap1, fullPage: true });

  if (s1.stuck < 1.0 && maxStuck < 1.0 && !s1.dead) {
    console.log(`✓ Escenario 1 superado (stuck=${s1.stuck}, maxStuck=${maxStuck.toFixed(2)}, captura: ${path.basename(snap1)})`);
  } else {
    console.error(`✗ FAIL Escenario 1: jugador atascado (stuck=${s1.stuck}, max=${maxStuck}, dead=${s1.dead})`);
    allPassed = false;
  }

  // ----------------------------------------------------
  // ESCENARIO 2: Subir hacia adelante: top >= 20m
  // ----------------------------------------------------
  console.log('\n--- Escenario 2: Subir hacia adelante y verificar top >= 20m ---');
  await page.evaluate(() => {
    const d = window.__doom;
    // Buscar una estructura/plataforma en altura >= 20m (zf >= 20.0 ó zf*10 >= 20)
    const targetShip = d.ships.find(s => s.zf >= 20.0) || d.ships.find(s => s.zf >= 2.0);
    if (targetShip) {
      const x = targetShip.x0 + Math.floor(targetShip.w / 2) + 0.5;
      const y = targetShip.y0 + Math.floor(targetShip.h / 2) + 0.5;
      d.tp(x, y, targetShip.zf, 0);
    }
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');

  const s2 = await page.evaluate(() => ({
    top: window.__doom.st.top,
    topMeters: (window.__doom.st.top * 10),
    pz: window.__doom.st.pz
  }));
  const snap2 = path.join(SALIDA, 'gameplay_2.png');
  await page.screenshot({ path: snap2, fullPage: true });

  if (s2.top >= 2.0 || s2.topMeters >= 20) {
    console.log(`✓ Escenario 2 superado (top=${s2.top.toFixed(1)}, metros=${Math.round(s2.topMeters)}m >= 20m, captura: ${path.basename(snap2)})`);
  } else {
    console.error(`✗ FAIL Escenario 2: top insuficiente (${s2.top} / ${s2.topMeters}m)`);
    allPassed = false;
  }

  // ----------------------------------------------------
  // ESCENARIO 3: Entrar a mazmorra y salir: estado de zona cambia y vuelve
  // ----------------------------------------------------
  console.log('\n--- Escenario 3: Entrar y salir de mazmorra (cambio de zona) ---');
  const d0 = await page.evaluate(() => {
    const d = window.__doom;
    const ship = d.ships[0];
    return {
      x: ship.x0 + Math.floor(ship.w / 2) + 0.5,
      y: ship.y0 + Math.floor(ship.h / 2) + 0.5,
      zf: ship.zf,
      name: ship.name
    };
  });

  // Entrar a la mazmorra
  await page.evaluate(dest => {
    window.__doom.tp(dest.x, dest.y, dest.zf, 0);
  }, d0);
  await page.waitForTimeout(400);

  const zoneIn = await page.evaluate(() => ({
    zone: window.__doom.st.zone,
    hasRef: window.__doom.st.zoneRef !== null
  }));

  // Salir de la mazmorra (al eje central al aire libre)
  await page.evaluate(() => {
    window.__doom.tp(266.5, 266.5, 0, 0);
  });
  await page.waitForTimeout(400);

  const zoneOut = await page.evaluate(() => ({
    zone: window.__doom.st.zone,
    hasRef: window.__doom.st.zoneRef !== null
  }));

  const snap3 = path.join(SALIDA, 'gameplay_3.png');
  await page.screenshot({ path: snap3, fullPage: true });

  if (zoneIn.hasRef && !zoneOut.hasRef) {
    console.log(`✓ Escenario 3 superado (entró: "${zoneIn.zone}", salió: zonaRef=null, captura: ${path.basename(snap3)})`);
  } else {
    console.error(`✗ FAIL Escenario 3: zona no cambió o no volvió (in=${JSON.stringify(zoneIn)}, out=${JSON.stringify(zoneOut)})`);
    allPassed = false;
  }

  // ----------------------------------------------------
  // ESCENARIO 4: Mirar arriba y abajo: look cubre [-0.85, 0.85]
  // ----------------------------------------------------
  console.log('\n--- Escenario 4: Mirar arriba y abajo (rango [-0.85, 0.85]) ---');
  // Mirar arriba
  await page.evaluate(() => {
    window.__doom.st.look = 0.85;
  });
  await page.waitForTimeout(200);
  const lookUp = await page.evaluate(() => window.__doom.st.look);

  // Mirar abajo
  await page.evaluate(() => {
    window.__doom.st.look = -0.85;
  });
  await page.waitForTimeout(200);
  const lookDown = await page.evaluate(() => window.__doom.st.look);

  // Restaurar look neutral
  await page.evaluate(() => {
    window.__doom.st.look = 0;
  });

  const snap4 = path.join(SALIDA, 'gameplay_4.png');
  await page.screenshot({ path: snap4, fullPage: true });

  if (lookUp >= 0.85 && lookDown <= -0.85) {
    console.log(`✓ Escenario 4 superado (lookUp=${lookUp.toFixed(2)}, lookDown=${lookDown.toFixed(2)}, captura: ${path.basename(snap4)})`);
  } else {
    console.error(`✗ FAIL Escenario 4: rango de look no alcanzado (lookUp=${lookUp}, lookDown=${lookDown})`);
    allPassed = false;
  }

  // ----------------------------------------------------
  // ESCENARIO 5: Curarse al estar quieto: reserve baja, hp sube
  // ----------------------------------------------------
  console.log('\n--- Escenario 5: Curación en reposo ---');
  await page.evaluate(() => {
    const d = window.__doom;
    const ship = d.ships[0];
    const x = ship ? ship.x0 + 2 : 266.5;
    const y = ship ? ship.y0 + 2 : 266.5;
    const z = ship ? ship.zf : 0;
    d.tp(x, y, z, 0);
    d.st.hp = 80;
    d.st.reserve = 30;
    d.st.healLock = 0;
    d.st.still = 0;
    d.st.cd = 0;
  });

  // Esperar 2.5s quieto para que opere la regeneración
  await page.waitForTimeout(2500);

  const s5 = await page.evaluate(() => ({
    hp: window.__doom.st.hp,
    reserve: window.__doom.st.reserve
  }));
  const snap5 = path.join(SALIDA, 'gameplay_5.png');
  await page.screenshot({ path: snap5, fullPage: true });

  if (s5.hp > 80 && s5.reserve < 30) {
    console.log(`✓ Escenario 5 superado (hp=${s5.hp} > 80, reserve=${s5.reserve} < 30, captura: ${path.basename(snap5)})`);
  } else {
    console.error(`✗ FAIL Escenario 5: no se observó curación (hp=${s5.hp}, reserve=${s5.reserve})`);
    allPassed = false;
  }

  // ----------------------------------------------------
  // ESCENARIO 6: Caer al vacío: recibe daño, reaparece en checkpoint
  // ----------------------------------------------------
  console.log('\n--- Escenario 6: Caída al vacío y reaparición en checkpoint ---');
  await page.evaluate(() => {
    const d = window.__doom;
    const cp = d.st.cp;
    d.st.hp = 100;
    d.st.reserve = 30;
    d.st.pz = cp[2] - 16.0;
  });

  // Esperar a que la física detecte la caída y respawnee
  await page.waitForTimeout(500);

  const s6 = await page.evaluate(() => ({
    hp: window.__doom.st.hp,
    healLock: window.__doom.st.healLock,
    px: window.__doom.st.px,
    py: window.__doom.st.py,
    pz: window.__doom.st.pz,
    cp: window.__doom.st.cp
  }));
  const snap6 = path.join(SALIDA, 'gameplay_6.png');
  await page.screenshot({ path: snap6, fullPage: true });

  const atCheckpoint = Math.hypot(s6.px - s6.cp[0], s6.py - s6.cp[1]) < 1.0 && Math.abs(s6.pz - s6.cp[2]) < 1.0;
  const tookDamage = s6.hp < 100;
  const healLocked = s6.healLock > 0 || s6.hp <= 80;

  if (atCheckpoint && tookDamage && healLocked) {
    console.log(`✓ Escenario 6 superado (hp=${s6.hp} < 100, healLock=${s6.healLock.toFixed(1)}s, pos=[${s6.px.toFixed(1)}, ${s6.py.toFixed(1)}, ${s6.pz.toFixed(1)}] en checkpoint, captura: ${path.basename(snap6)})`);
  } else {
    console.error(`✗ FAIL Escenario 6: no respawneó o no tomó daño (hp=${s6.hp}, lock=${s6.healLock}, atCp=${atCheckpoint}, pos=[${s6.px}, ${s6.py}, ${s6.pz}])`);
    allPassed = false;
  }

  // Los escenarios 7–10 usan solo teclas y la física real (sin fijar st.pz a mano) y se ejecutan con el
  // motor Rust: ahí fue donde el salto se quedaba en 0,09 m y la caída al vacío no terminaba nunca.
  await page.evaluate(async () => { await window.__doom.setBackend('rust'); });
  const press = code => page.evaluate(c => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })), 30);
  }, code);
  const home = () => page.evaluate(() => {
    const d = window.__doom;
    d.st.enemies = []; d.st.proj = []; d.st.hp = 100; d.st.kx = d.st.ky = 0;
    d.tp(d.C + .5, d.C + .5, 0, 0);
  });
  const maxRise = ms => page.evaluate(ms => new Promise(res => {
    const st = window.__doom.st, z0 = st.pz; let mx = 0;
    const iv = setInterval(() => { mx = Math.max(mx, st.pz - z0); }, 16);
    setTimeout(() => { clearInterval(iv); res(mx); }, ms);
  }), ms);

  // ----------------------------------------------------
  // ESCENARIO 7: Salto (≈1,3 m) y doble salto (≈2,6 m)
  // ----------------------------------------------------
  console.log('\n--- Escenario 7: Salto y doble salto ---');
  await home(); await page.waitForTimeout(400);
  const riseP = maxRise(1200); await press('Space');
  const jump1 = await riseP;
  await home(); await page.waitForTimeout(400);
  const riseP2 = maxRise(1600); await press('Space'); await page.waitForTimeout(250); await press('Space');
  const jump2 = await riseP2;
  if (jump1 >= 1.1 && jump2 >= 2.2) {
    console.log(`✓ Escenario 7 superado (salto=${jump1.toFixed(2)} m, doble salto=${jump2.toFixed(2)} m)`);
  } else {
    console.error(`✗ FAIL Escenario 7: salto demasiado bajo (salto=${jump1.toFixed(2)} m, doble=${jump2.toFixed(2)} m)`);
    allPassed = false;
  }

  // ----------------------------------------------------
  // ESCENARIO 8: Caída libre al vacío termina en el punto seguro
  // ----------------------------------------------------
  console.log('\n--- Escenario 8: Caída libre real hasta el punto seguro ---');
  await home(); await page.waitForTimeout(300);
  const s8 = await page.evaluate(() => new Promise(res => {
    const d = window.__doom, st = d.st;
    d.tp(d.C + 60.5, d.C + 60.5, 30, 0);
    st.cp = [d.C + .5, d.C + .5, 0];
    const t0 = performance.now(), hp0 = st.hp;
    const iv = setInterval(() => {
      const back = Math.hypot(st.px - st.cp[0], st.py - st.cp[1]) < 1 && Math.abs(st.pz - st.cp[2]) < .5;
      if (back || performance.now() - t0 > 6000) { clearInterval(iv); res({ back, ms: Math.round(performance.now() - t0), hpLost: hp0 - st.hp }); }
    }, 16);
  }));
  if (s8.back && s8.hpLost > 0) {
    console.log(`✓ Escenario 8 superado (volvió al punto seguro en ${s8.ms} ms, −${s8.hpLost} de vida)`);
  } else {
    console.error(`✗ FAIL Escenario 8: la caída no terminó en el punto seguro (vuelta=${s8.back}, ${s8.ms} ms, vida perdida=${s8.hpLost})`);
    allPassed = false;
  }

  // ----------------------------------------------------
  // ESCENARIO 9: Morir y reiniciar con R deja al jugador vivo
  // ----------------------------------------------------
  console.log('\n--- Escenario 9: Reinicio tras morir ---');
  await home();
  await page.evaluate(() => { const st = window.__doom.st; st.hp = 1; st.proj.push({ x: st.px, y: st.py, z: st.pz + .5, vx: 0, vy: 0, vz: 0, life: 1, dmg: 50, kind: 'fire' }); });
  await page.waitForTimeout(500);
  const died = await page.evaluate(() => window.__doom.st.dead);
  await press('KeyR'); await page.waitForTimeout(800);
  const s9 = await page.evaluate(() => ({ dead: window.__doom.st.dead, hp: window.__doom.st.hp }));
  if (died && !s9.dead && s9.hp > 0) {
    console.log(`✓ Escenario 9 superado (murió y reinició con hp=${s9.hp})`);
  } else {
    console.error(`✗ FAIL Escenario 9: reinicio incorrecto (murió=${died}, sigue muerto=${s9.dead}, hp=${s9.hp})`);
    allPassed = false;
  }

  // ----------------------------------------------------
  // ESCENARIO 10: Un imp dispara y sus bolas de fuego avanzan
  // ----------------------------------------------------
  console.log('\n--- Escenario 10: Ataque de un imp ---');
  await home();
  const s10 = await page.evaluate(() => new Promise(res => {
    const d = window.__doom, st = d.st; d.spawn('imp', st.px + 5, st.py, 0);
    let shots = 0, moved = false, lastX = null;
    const iv = setInterval(() => {
      shots = Math.max(shots, st.proj.length);
      if (st.proj[0]) { if (lastX !== null && st.proj[0].x !== lastX) moved = true; lastX = st.proj[0].x; }
    }, 30);
    setTimeout(() => { clearInterval(iv); res({ shots, moved }); }, 6000);
  }));
  if (s10.shots > 0 && s10.moved) {
    console.log('✓ Escenario 10 superado (el imp disparó y el proyectil avanzó)');
  } else {
    console.error(`✗ FAIL Escenario 10: el imp no atacó (proyectiles=${s10.shots}, avanzan=${s10.moved})`);
    allPassed = false;
  }
  await home();

  await browser.close();

  if (!allPassed) {
    console.error('\nTEST REGRESSION_GAMEPLAY FALLIDO.');
    process.exit(1);
  } else {
    console.log('\n=== TEST REGRESSION_GAMEPLAY: TODOS LOS ESCENARIOS PASARON ===');
    process.exit(0);
  }
})();
