// Director de Ritmo y acechador (052-director-de-ritmo.js, 080-enemigos.js), en Chromium con el motor Rust:
//  - acechador normal y cría: velocidad (1,1× y 1,5× la del jugador), vida, daño por contacto, escudo, se disipa, muere;
//  - Director: nunca pasan más de ~12 s sin que ocurra algo; tras una caída, recuperación sin presión ni acechadores;
//    quieto sin pelear más de 5 s → acechador en ~40 % de los casos; herido, un pico se convierte en recompensa;
//    decide el ritmo ~75 % de las veces y el azar el resto;
//  - ramas: nunca más de 8 plataformas seguidas sin nada.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('[SKIP] Playwright no está disponible en este entorno.'); process.exit(0); }
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

(async () => {
  console.log('=== TEST RITMO: Director de Ritmo y acechador ===\n');
  let browser;
  try { browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }); }
  catch (err) { console.log('[SKIP] No se pudo arrancar Chromium en este entorno:', err.message); process.exit(0); }
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('file://' + path.join(ROOT, 'dist', 'forgex-doom-orbital.html'));
  await page.waitForFunction(() => window.__doom && window.__doom.wasm, null, { timeout: 30000 });
  await page.click('#view'); await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const d = window.__doom; await d.setBackend('rust'); d.setOption('graphics', 'quality', 0);
    // Suelo propio bajo el de salida (el mundo es aleatorio) y el Director en calma salvo cuando la prueba lo pide
    window.__arena = () => { const z = -6, x0 = d.C - 60, y0 = d.C + 60; d.plat(x0, y0, 50, 12, z, .5, 5);
      const st = d.st; st.enemies = []; st.proj = []; st.items = []; st.hp = st.maxHp = 100; st.dead = false; d.tp(x0 + 2, y0 + 6, z, 0);
      Object.assign(d.director, { name: 'respiro', phaseT: 0, phaseLen: 1e9 }); return { x0, y0, z }; };
  });
  let allPassed = true;
  const check = (ok, good, bad) => { if (ok) console.log('✓ ' + good); else { allPassed = false; console.error('✗ FAIL ' + bad); } };

  // --- acechador ---
  for (const v of ['normal', 'small']) {
    const r = await page.evaluate(v => new Promise(res => {
      const d = window.__doom, st = d.st, D = d.director, A = window.__arena();
      const e = d.spawnChaser(v, A.x0 + 18, A.y0 + 6, A.z + 1), K = d.CHASER[v];
      let t0 = null, x0 = null, hp0 = st.hp;
      const iv = setInterval(() => {
        if (t0 === null) { t0 = D.t; x0 = e.x; }
        if (st.hp < hp0) { clearInterval(iv); res({ speed: (x0 - e.x) / (D.t - t0), dmg: hp0 - st.hp, hp: e.hp, life: e.life, K }); }
        if (D.t - t0 > 30) { clearInterval(iv); res({ timeout: true }); }
      }, 2);
    }), v);
    const want = v === 'normal' ? 3.74 : 5.1, dmg = v === 'normal' ? 8 : 6, hp = v === 'normal' ? 4 : 2;
    check(!r.timeout && Math.abs(r.speed - want) < .2 && r.dmg === dmg && r.hp === hp,
      `acechador ${v}: ${r.speed.toFixed(2)} u/s (objetivo ${want}), ${r.dmg} de daño por contacto, ${r.hp} de vida`,
      `acechador ${v}: ${JSON.stringify(r)}`);
  }
  const shield = await page.evaluate(() => new Promise(res => {
    const d = window.__doom, st = d.st, A = window.__arena(); d.spawnChaser('normal', A.x0 + 4, A.y0 + 6, A.z + .6);
    const iv = setInterval(() => { st.shieldT = .6; }, 5);
    setTimeout(() => { clearInterval(iv); res(100 - st.hp); }, 1500);
  }));
  check(shield === 0, 'con el escudo activo, el contacto no hace daño', `el escudo no protegió (${shield} de daño)`);
  const fade = await page.evaluate(() => new Promise(res => {
    const d = window.__doom, st = d.st, A = window.__arena(); const e = d.spawnChaser('small', A.x0 + 40, A.y0 + 6, A.z + 1); e.life = .4;
    setTimeout(() => res({ dead: e.dead, hp: st.hp }), 3000);
  }));
  check(fade.dead && fade.hp === 100, 'si se le acaba el tiempo sin alcanzarte, se disipa', `no se disipó: ${JSON.stringify(fade)}`);
  for (const v of ['normal', 'small']) {
    const k = await page.evaluate(v => new Promise(res => {
      const d = window.__doom, st = d.st, A = window.__arena(); st.hp = st.maxHp = 1e6;
      st.inv.push({ t: 'box', ammo: 'celdas', count: 32 });
      const e = d.spawnChaser(v, A.x0 + 12, A.y0 + 6, A.z + .6);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
      const t0 = performance.now();
      const iv = setInterval(() => { st.pa = Math.atan2(e.y - st.py, e.x - st.px);
        if (e.dead || performance.now() - t0 > 20000) { clearInterval(iv); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })); st.hp = st.maxHp = 100; res(e.dead); } }, 5);
    }), v);
    check(k, `el acechador ${v} muere a disparos`, `el acechador ${v} no murió disparándole 20 s`);
  }

  // --- Director ---
  const gap = await page.evaluate(() => new Promise(res => {
    const d = window.__doom, st = d.st, D = d.director, A = window.__arena();
    d.gen.tier = 1; Object.assign(D, { name: 'despertar', phase: 0, phaseT: 0, phaseLen: 5, sinceEvent: 0, sinceCombat: 0, sinceReward: 0, sinceFall: 999, sinceChase: 999, needCd: 0, highT: 0, pressure: 0 });
    const t0 = D.t; let maxGap = 0;
    const iv = setInterval(() => { st.hp = 100; maxGap = Math.max(maxGap, D.sinceEvent);
      for (const e of st.enemies) if (!e.dead && Math.hypot(e.x - st.px, e.y - st.py) < 3) { e.dead = true; e.deadT = 0; } // el jugador «gana» cada pelea
      if (D.t - t0 > 45) { clearInterval(iv); res({ maxGap, beats: D.beats.filter(b => b.t >= t0).length }); } }, 5);
  }));
  check(gap.maxGap <= 12.5, `quieto en una plataforma durante 45 s de juego: como mucho ${gap.maxGap.toFixed(1)} s seguidos sin que ocurra nada (${gap.beats} momentos)`,
    `pasaron ${gap.maxGap.toFixed(1)} s sin que ocurriera nada`);
  const fall = await page.evaluate(() => new Promise(res => {
    const d = window.__doom, st = d.st, D = d.director; window.__arena(); D.pressure = 8; d.directorNote('fall');
    const phase = D.name, press = D.pressure, t0 = D.t; let chasers = 0;
    const iv = setInterval(() => { if (st.enemies.some(e => e.type === 'chaser' && !e.dead)) chasers++;
      if (D.t - t0 > 20) { clearInterval(iv); res({ phase, press, chasers }); } }, 5);
  }));
  check(fall.phase === 'recuperacion' && fall.press === 0 && fall.chasers === 0, 'tras una caída: recuperación, presión 0 y ningún acechador en 20 s aunque se quede quieto',
    `tras la caída: ${JSON.stringify(fall)}`);
  const still = await page.evaluate(() => {
    const d = window.__doom, st = d.st, D = d.director; window.__arena(); d.gen.tier = 2; let got = 0, small = 0, blocked = 0;
    for (let k = 0; k < 400; k++) {
      st.enemies = []; Object.assign(D, { name: 'exploracion', phaseT: 0, phaseLen: 1e9, needCd: 1e9, stillT: 5.1, stillRolled: false, sinceFall: 999, sinceChase: 999, sinceHealed: 999, highT: 0 });
      d.directorTick(1e-4); const c = st.enemies.find(e => e.type === 'chaser'); if (c) { got++; if (c.variant === 'small') small++; }
      st.enemies = []; Object.assign(D, { stillT: 5.1, stillRolled: false, sinceFall: 10 }); d.directorTick(1e-4); if (st.enemies.length) blocked++;
    }
    st.enemies = []; return { rate: got / 400, small: small / Math.max(1, got), blocked };
  });
  check(still.rate > .32 && still.rate < .48 && still.small < .3 && still.blocked === 0,
    `quieto más de 5 s sin pelear: acechador en el ${Math.round(still.rate * 100)} % de los casos (cría en el ${Math.round(still.small * 100)} % de ellos); nunca en los 25 s tras una caída`,
    `regla de quietud: ${JSON.stringify(still)}`);
  const hyb = await page.evaluate(() => {
    const d = window.__doom, st = d.st, D = d.director; window.__arena(); D.decisions = { ritmo: 0, azar: 0 };
    for (let k = 0; k < 3000; k++) { d.directorBeat('exploracion', 'fase'); st.enemies = []; st.items = []; }
    return D.decisions.ritmo / 3000;
  });
  check(hyb > .72 && hyb < .78, `híbrido: el ritmo decide el ${Math.round(hyb * 100)} % de los momentos y el azar el resto`, `reparto ritmo/azar: ${hyb}`);
  const wounded = await page.evaluate(() => { const d = window.__doom, st = d.st, D = d.director; window.__arena(); st.hp = 20; let ok = 0;
    for (let k = 0; k < 40; k++) { d.directorBeat('pico', 'necesidad'); if (D.beats[D.beats.length - 1].kind === 'recompensa') ok++; st.enemies = []; st.items = []; }
    st.hp = 100; return ok; });
  check(wounded === 40, 'herido: el pico se convierte en recompensa (40/40)', `herido: ${wounded}/40 picos convertidos`);
  const quiet = await page.evaluate(() => { const d = window.__doom; let n = 0; while (d.gen.h < 200 && n++ < 3000) d.nextStep(); return { maxQuiet: d.gen.maxQuiet, branches: d.gen.branches }; });
  check(quiet.maxQuiet <= 7, `ramas: como mucho ${quiet.maxQuiet} plataformas seguidas sin nada (${quiet.branches} ramas generadas)`, `rama con ${quiet.maxQuiet} plataformas seguidas vacías`);

  if (errors.length) { allPassed = false; console.error('Errores de la página:', errors.slice(0, 5)); }
  await browser.close();
  if (!allPassed) { console.error('\nTEST RITMO FALLIDO.'); process.exit(1); }
  console.log('\n=== TEST RITMO: TODO CORRECTO ===');
  process.exit(0);
})();
