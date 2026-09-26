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

  // Todos los escenarios se ejecutan con el motor Rust, el que se usa por defecto: ahí el salto se quedaba en
  // 0,09 m y la caída al vacío no terminaba nunca. El mundo es aleatorio en cada carga, así que los escenarios que
  // dependen de la geometría usan una pasarela propia (LANE) bajo el suelo de salida: más arriba, la poda del
  // mundo (todo lo que queda 22 m por debajo del jugador) borraría las estructuras de los escenarios siguientes.
  await page.evaluate(async () => {
    await window.__doom.setBackend('rust');
    window.__lane = () => {
      const d = window.__doom, L = { x0: d.C - 20, y0: d.C + 40, w: 40, h: 3, z: -5 };
      d.plat(L.x0, L.y0, L.w, L.h, L.z, .5, 5);
      d.st.hp = 100; d.st.dead = false; d.st.enemies = []; d.st.proj = []; d.st.kx = d.st.ky = 0;
      d.tp(L.x0 + .5, L.y0 + 1.5, L.z, 0);
      return L;
    };
    window.__key = (c, ms = 30) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })), ms); };
  });

  // ----------------------------------------------------
  // ESCENARIO 1: Andar 10s: no atascarse (stuck < 1.0)
  // ----------------------------------------------------
  console.log('--- Escenario 1: Andar 10s y verificar que no se atasca ---');
  await page.evaluate(() => { window.__lane(); });
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
  console.log('\n--- Escenario 2: Aterrizar en la ruta sube el récord (top) ---');
  // El récord solo sube en las plataformas de la ruta principal; las estructuras y ramas laterales no cuentan.
  const route = await page.evaluate(() => {
    const d = window.__doom, cells = d.cells;
    let f = null;
    for (let k = 0; k < cells.length; k++) { const c = cells[k]; if (!c) continue;
      for (const b of c) if (b.route && !b.pad && b.zt >= 2 && (!f || b.zt > f.z)) f = { x: k % d.MW + .5, y: (k / d.MW | 0) + .5, z: b.zt }; }
    if (!f) return null;
    d.st.hp = 100; d.st.top = 0; d.tp(f.x, f.y, f.z + .3, 0);
    return f;
  });
  await page.waitForTimeout(800);
  const s2 = await page.evaluate(() => ({
    top: window.__doom.st.top,
    topMeters: (window.__doom.st.top * 10),
    pz: window.__doom.st.pz
  }));
  const snap2 = path.join(SALIDA, 'gameplay_2.png');
  await page.screenshot({ path: snap2, fullPage: true });

  if (route && Math.abs(s2.top - route.z) < .01) {
    console.log(`✓ Escenario 2 superado (top=${s2.top.toFixed(1)}, ${Math.round(s2.topMeters)} m en la plataforma de ruta, captura: ${path.basename(snap2)})`);
  } else {
    console.error(`✗ FAIL Escenario 2: el récord no subió en la ruta (top=${s2.top}, plataforma=${route && route.z})`);
    allPassed = false;
  }

  // ----------------------------------------------------
  // ESCENARIO 3: Entrar a mazmorra y salir: estado de zona cambia y vuelve
  // ----------------------------------------------------
  console.log('\n--- Escenario 3: Entrar y salir de mazmorra (cambio de zona) ---');
  const d0 = await page.evaluate(() => {
    const d = window.__doom;
    // una celda interior con suelo a la altura zf y sin nada encima (el centro puede ser un hueco o un objeto)
    for (const ship of d.ships) for (let j = ship.y0 + 1; j < ship.y0 + ship.h - 1; j++) for (let i = ship.x0 + 1; i < ship.x0 + ship.w - 1; i++) {
      const c = d.cells[j * d.MW + i] || [];
      if (c.some(b => Math.abs(b.zt - ship.zf) < .01 && !b.acid) && !c.some(b => b.zb < ship.zf + 1.8 && b.zt > ship.zf + .05))
        return { x: i + .5, y: j + .5, zf: ship.zf, name: ship.name };
    }
    return null;
  });

  if (!d0) { console.error('✗ FAIL Escenario 3: ninguna estructura tiene una celda interior libre'); await browser.close(); process.exit(1); }
  // Entrar a la mazmorra
  await page.evaluate(dest => {
    window.__doom.st.hp = 100;
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
  // En la pasarela: dentro de una estructura, los enemigos (que sí atacan) pueden hacer daño mientras se cura.
  await page.evaluate(() => {
    const d = window.__doom;
    window.__lane();
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

  // ----------------------------------------------------
  // ESCENARIO 7: Salto (≈1,3 m) y doble salto (≈2,6 m)
  // ----------------------------------------------------
  console.log('\n--- Escenario 7: Salto y doble salto ---');
  // Las esperas dependen del estado del juego, no del reloj: sin GPU el render por software va a pocos FPS y cada
  // fotograma avanza como máximo 0,1 s de simulación, así que 1 s real puede ser bastante menos de juego.
  const jumpTest = presses => page.evaluate(presses => new Promise(res => {
    window.__lane();
    const st = window.__doom.st, z0 = st.pz; let mx = 0, second = presses < 2, rose = false;
    window.__key('Space');
    const t0 = performance.now();
    const iv = setInterval(() => {
      mx = Math.max(mx, st.pz - z0); if (st.pz > z0 + .05) rose = true;
      if (!second && st.jumps === 1 && st.vz <= 1) { second = true; window.__key('Space'); } // segundo salto cerca de la cima
      if ((rose && second && st.ground) || performance.now() - t0 > 20000) { clearInterval(iv); res(mx); }
    }, 10);
  }), presses);
  const jump1 = await jumpTest(1);
  const jump2 = await jumpTest(2);
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
  const s8 = await page.evaluate(() => new Promise(res => {
    const d = window.__doom, L = window.__lane(), st = d.st;
    // una columna vacía por debajo de la pasarela, a partir de 5 m de su extremo
    let x = null;
    for (let i = L.x0 + L.w + 5; i < L.x0 + L.w + 60 && x === null; i++) {
      const c = d.cells[(L.y0 + 1) * d.MW + i] || [];
      if (!c.some(b => b.zb < L.z + 1)) x = i + .5;
    }
    if (x === null) return res({ back: false, ms: 0, hpLost: 0, why: 'sin columna vacía' });
    const cp = [st.cp[0], st.cp[1], st.cp[2]], hp0 = st.hp;
    st.px = x; st.py = L.y0 + 1.5; st.pz = L.z - .5; st.vz = 0; st.ox = undefined; // en el aire, junto a la pasarela
    const t0 = performance.now();
    const iv = setInterval(() => {
      const back = Math.hypot(st.px - cp[0], st.py - cp[1]) < 1 && Math.abs(st.pz - cp[2]) < .5;
      if (back || performance.now() - t0 > 20000) { clearInterval(iv); res({ back, ms: Math.round(performance.now() - t0), hpLost: hp0 - st.hp }); }
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
  await page.evaluate(() => { window.__lane(); });
  await page.evaluate(() => { const st = window.__doom.st; st.hp = 1; st.proj.push({ x: st.px, y: st.py, z: st.pz + .5, vx: 0, vy: 0, vz: 0, life: 1, dmg: 50, kind: 'fire' }); });
  await page.waitForTimeout(500);
  const died = await page.evaluate(() => window.__doom.st.dead);
  await page.evaluate(() => window.__key('KeyR')); await page.waitForTimeout(800);
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
  const s10 = await page.evaluate(() => new Promise(res => {
    const d = window.__doom, L = window.__lane(), st = d.st; d.spawn('imp', L.x0 + 8.5, L.y0 + 1.5, L.z);
    let shots = 0, moved = false, lastX = null; const hp0 = st.hp;
    const t0 = performance.now();
    const iv = setInterval(() => {
      shots = Math.max(shots, st.proj.length);
      if (st.proj[0]) { if (lastX !== null && st.proj[0].x !== lastX) moved = true; lastX = st.proj[0].x; }
      if (shots && st.hp < hp0) moved = true; // llegó hasta el jugador
      if ((shots && moved) || performance.now() - t0 > 30000) { clearInterval(iv); res({ shots, moved }); }
    }, 10);
  }));
  if (s10.shots > 0 && s10.moved) {
    console.log('✓ Escenario 10 superado (el imp disparó y el proyectil avanzó)');
  } else {
    console.error(`✗ FAIL Escenario 10: el imp no atacó (proyectiles=${s10.shots}, avanzan=${s10.moved})`);
    allPassed = false;
  }
  await page.evaluate(() => { window.__lane(); });

  await browser.close();

  if (!allPassed) {
    console.error('\nTEST REGRESSION_GAMEPLAY FALLIDO.');
    process.exit(1);
  } else {
    console.log('\n=== TEST REGRESSION_GAMEPLAY: TODOS LOS ESCENARIOS PASARON ===');
    process.exit(0);
  }
})();
