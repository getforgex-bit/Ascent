  // ================= DIRECTOR DE RITMO =================
  // Encima de la generación: en vez de decidir la partida solo con tiradas independientes, el Director recuerda qué ha
  // pasado (combate, recompensa, descubrimiento, caída, persecución, descanso) y decide qué TIPO de momento hace falta.
  // El contenido concreto sigue siendo aleatorio (qué enemigo, qué objeto, dónde), y una parte de los momentos se deja
  // al azar puro: el ritmo predomina, pero no lo decide todo.
  //   micro (6–12 s): nunca pasa mucho tiempo sin algo que obligue a mirar, decidir o reaccionar;
  //   ciclo (35–60 s): despertar → presión → encuentro → recompensa → exploración → pico → respiro;
  //   macro (2–4 min): un momento grande (encuentro fuerte + gran recompensa).
  // Nunca castiga una caída: después viene recuperación (sin presión ni acechadores).
  const RHYTHM = [['despertar', 4, 8], ['presion', 4, 8], ['encuentro', 5, 12], ['recompensa', 3, 7], ['exploracion', 6, 15], ['pico', 6, 15], ['respiro', 5, 10]];
  const PHASE_NAME = { despertar: 'despertar', presion: 'presión', encuentro: 'encuentro', recompensa: 'recompensa', exploracion: 'exploración', pico: 'pico', respiro: 'respiro', recuperacion: 'recuperación' };
  const RHYTHM_SHARE = .75;   // parte de los momentos que decide el ritmo; el resto, el azar
  const ROUTE_RANDOM = .4;    // las tiradas de enemigos de la ruta central quedan al 40 %: el resto lo pone el Director
  const CALM = { respiro: 1, recuperacion: 1 };
  let DIR;
  function directorReset() {
    DIR = { t: 0, phase: 0, name: 'despertar', phaseT: 0, phaseLen: rnd(4, 8), pressure: 0, highT: 0,
      sinceEvent: 0, sinceCombat: 0, sinceReward: 0, sinceDiscovery: 0, sinceFall: 999, sinceChase: 999, sinceHealed: 999,
      sinceBig: 0, bigAt: rnd(120, 240), stillT: 0, stillRolled: false, branchT: 0, needCd: 0, combatStreak: 0, rewardT: 0, lastHp: 100,
      time: { travesia: 0, combate: 0, persecucion: 0, recompensa: 0, recuperacion: 0 }, ema: { combate: 0, persecucion: 0 }, combatNow: false,
      decisions: { ritmo: 0, azar: 0 }, beats: [] };
  }
  directorReset();

  // Lo que pasa en la partida alimenta la memoria del Director
  function directorNote(kind) {
    if (!DIR) return;
    const D = DIR;
    if (kind === 'hurt' || kind === 'hit') { D.sinceCombat = 0; D.sinceEvent = 0; D.pressure = Math.min(10, D.pressure + (kind === 'hurt' ? .8 : .15)); }
    else if (kind === 'kill') { D.combatStreak++; D.sinceEvent = 0; }
    else if (kind === 'reward') { D.sinceReward = 0; D.sinceEvent = 0; D.rewardT = 3; D.pressure = Math.max(0, D.pressure - 1.5); }
    else if (kind === 'discovery') { D.sinceDiscovery = 0; D.sinceEvent = 0; }
    else if (kind === 'fall') { // recuperación: sin presión, sin acechadores y un recurso pequeño cerca
      D.sinceFall = 0; D.pressure = 0; D.combatStreak = 0;
      for (const e of st.enemies) if (e.type === 'chaser' && !e.dead) { e.dead = true; e.deadT = 0; }
      directorPhase('recuperacion', rnd(5, 8));
      if (Math.random() < .5) { const s = directorSpot(1.5, 4, -.2, .2, false); if (s) addItem('ammo', s[0], s[1], s[2], { ammo: 'celdas', count: randi(1, 2) }); }
    }
  }
  function directorPhase(name, len) {
    const D = DIR; D.name = name; D.phaseT = 0; D.phaseLen = len;
    const k = RHYTHM.findIndex(r => r[0] === name); if (k >= 0) D.phase = k;
    if (!CALM[name]) directorBeat(name, 'fase');
  }

  // ---- dónde poner las cosas ----
  // Plataforma de la ruta central por delante (encima) del jugador: lo que se pone ahí se encuentra al seguir subiendo.
  function routeAhead() {
    let best = null;
    for (const R of gen.route) {
      if (R.pad || R.zt < st.pz + 1.2 || R.zt > st.pz + 9) continue;
      const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
      if (Math.hypot(cx - st.px, cy - st.py) > 16) continue;
      if (st.enemies.some(e => !e.dead && Math.hypot(e.x - cx, e.y - cy) < 1.5 && Math.abs(e.z - R.zt) < 3)) continue;
      if (!standable(Math.floor(cx), Math.floor(cy), R.zt)) continue;
      if (!best || R.zt < best[2]) best = [cx, cy, R.zt];
    }
    return best;
  }
  // Suelo cercano (ramas, estructuras): una celda en la que se pueda estar de pie a dmin–dmax del jugador y
  // dz0–dz1 de altura. Si `hidden`, fuera de la vista o lejos: que aparezca sin materializarse en la cara del jugador.
  function directorSpot(dmin, dmax, dz0, dz1, hidden) {
    for (let k = 0; k < 40; k++) {
      const a = rnd(0, TAU), r = rnd(dmin, dmax), i = Math.floor(st.px + Math.cos(a) * r), j = Math.floor(st.py + Math.sin(a) * r);
      for (const b of cells[j * MW + i] || NONE) {
        if (b.zt < st.pz + dz0 || b.zt > st.pz + dz1 || !standable(i, j, b.zt)) continue;
        const x = i + .5, y = j + .5, rel = Math.atan2(y - st.py, x - st.px) - st.pa, ang = Math.abs(rel - TAU * Math.round(rel / TAU));
        if (hidden && r < 9 && ang < FOV / 2 + .2) continue;
        return [x, y, b.zt];
      }
    }
    return null;
  }
  // Aire libre para un acechador: detrás o a los lados del jugador (fuera de la vista), a 12–16, con camino directo.
  function chaserSpot() {
    for (let k = 0; k < 40; k++) {
      const a = st.pa + Math.PI + rnd(-1.2, 1.2), r = rnd(12, 16), x = st.px + Math.cos(a) * r, y = st.py + Math.sin(a) * r, z = st.pz + rnd(.5, 2.5);
      if (Math.hypot(x - C, y - C) > R_EXPLORE - 2 || solidAt(x, y, z) || solidAt(x, y, z + .5)) continue;
      if (k < 30 && !clearPath(x, y, z, st.px, st.py, st.pz + .6)) continue;
      return [x, y, z];
    }
    return null;
  }
  const nearEnemies = () => st.enemies.filter(e => !e.dead && Math.hypot(e.x - st.px, e.y - st.py) < 20 && Math.abs(e.z - st.pz) < 8).length;
  const chaserActive = () => st.enemies.some(e => e.type === 'chaser' && !e.dead);

  // ---- los momentos (beats) ----
  function placeEnemy(type) {
    const s = routeAhead() || directorSpot(6, 13, -1.5, 5, true);
    if (!s) return false;
    const z = type === 'skull' ? s[2] + 1.5 : type === 'caco' ? s[2] + 2.2 : s[2];
    if (type !== 'imp' && solidAt(s[0], s[1], z)) return false;
    spawn(type, s[0], s[1], z); st.enemies[st.enemies.length - 1].dir = true;
    return true;
  }
  function placeChaser(variant) {
    const D = DIR;
    if (D.sinceFall < 25 || chaserActive()) return false;
    const s = chaserSpot(); if (!s) return false;
    spawnChaser(variant, s[0], s[1], s[2]); D.sinceChase = 0; D.sinceEvent = 0; D.pressure = Math.min(10, D.pressure + 2);
    msg(variant === 'small' ? '¡Una cría de acechador! Es más rápida que tú.' : 'Algo te ha olido. No te quedes quieto.', variant === 'small' ? '#ff7ad8' : '#b49aff');
    return true;
  }
  function rewardFor() { // lo que más falta ahora; si no falta nada, lo que toque
    if (st.reserve < 15 && st.healLock <= 0) return { kind: 'heal' };
    const w = st.weapon && WEAP[st.weapon.w];
    if (w && ammoOf(w.ammo) < 6) return { kind: 'ammo', ammo: w.ammo, count: w.ammo === 'nucleos' ? randi(2, 3) : randi(4, 7) };
    return rollType('normal');
  }
  function placeReward(big) {
    const s = routeAhead() || directorSpot(3, 10, -1, 4, false) || directorSpot(1.5, 6, -.3, .3, false); if (!s) return false;
    const it = big ? (Math.random() < .5 ? { kind: 'upgrade', up: pick(Object.keys(UPG)) } : { kind: 'weapon', w: Math.random() < .65 ? 'escopeta' : 'riel' }) : rewardFor();
    placeContent(s[0], s[1], s[2], it, big ? 1 : .4);
    return true;
  }
  // Encuentros según la altura (tier): la intensidad media sube, pero siempre con respiro entre picos
  const ENCOUNTERS = [
    [['imp']],
    [['imp'], ['imp', 'skull'], ['chaser']],
    [['imp', 'skull'], ['caco'], ['imp', 'chaser']],
    [['imp', 'skull', 'caco'], ['caco', 'skull'], ['imp', 'imp', 'chaser']],
  ];
  const PEAKS = [
    [['imp', 'imp']],
    [['imp', 'chaser'], ['imp', 'imp', 'skull']],
    [['imp', 'skull', 'chaser'], ['caco', 'skull']],
    [['caco', 'imp', 'skull'], ['caco', 'imp', 'smallchaser'], ['imp', 'skull', 'skull', 'chaser']],
  ];
  function runGroup(group) {
    let n = 0;
    const cap = gen.tier >= 3 ? 5 : 4;
    for (const t of group) {
      if (nearEnemies() >= cap) break;
      if (t === 'chaser' || t === 'smallchaser') n += placeChaser(t === 'chaser' ? 'normal' : 'small') ? 1 : 0;
      else n += placeEnemy(t) ? 1 : 0;
    }
    return n > 0;
  }
  const tierOf = () => Math.min(3, gen.tier);
  function directorBeat(kind, why) {
    why = why || 'fase';
    const D = DIR, wounded = st.hp < st.maxHp * .35;
    // Híbrido: casi siempre decide el ritmo; a veces el azar cambia el momento por otro (o por nada)
    let source = 'ritmo';
    if (why !== 'necesidad' && Math.random() > RHYTHM_SHARE) { source = 'azar'; kind = pick(['presion', 'encuentro', 'recompensa', 'nada', 'nada']); }
    D.decisions[source]++;
    if (wounded && (kind === 'pico' || kind === 'encuentro')) kind = 'recompensa'; // herido: bajar la presión y dar una oportunidad
    // Presupuesto de combate: si en el último minuto ya hubo mucha pelea (más del 40 % del tiempo) o hay una en curso
    // con varios enemigos, no se añaden más: la partida es una onda, no un tiroteo continuo.
    const saturated = D.ema.combate + D.ema.persecucion > .4 || (D.combatNow && nearEnemies() >= 2);
    if (saturated && (kind === 'presion' || kind === 'encuentro' || kind === 'pico')) { kind = D.sinceReward > 12 ? 'recompensa' : 'nada'; why += ' (saturado)'; }
    let done = false;
    if (kind === 'despertar') { SFX.distant(); if (Math.random() < .5) done = placeReward(false); else done = true; }
    else if (kind === 'presion') {
      const t = tierOf();
      const opts = t === 0 ? [['imp', 1]] : [['imp', 3], ['skull', 1], ['chaser', D.sinceChase > 20 ? 2 : 0]];
      const pickT = wpick(opts)[0];
      done = pickT === 'chaser' ? placeChaser('normal') : placeEnemy(pickT);
    }
    else if (kind === 'encuentro') done = runGroup(pick(ENCOUNTERS[tierOf()]));
    else if (kind === 'pico') done = runGroup(pick(PEAKS[tierOf()]));
    else if (kind === 'recompensa') done = placeReward(false);
    else if (kind === 'grande') { if (!saturated) runGroup(pick(PEAKS[tierOf()])); done = placeReward(true); msg('La torre se agita: algo grande espera más arriba.', '#ffcc40'); }
    else done = true; // exploración / nada: se deja respirar a la generación
    // lo colocado salda su deuda aunque el jugador tarde en llegar: así no se amontonan encuentros esperándolo
    if (done && kind !== 'nada' && kind !== 'exploracion') {
      D.sinceEvent = 0;
      if (kind === 'encuentro' || kind === 'pico' || kind === 'grande') D.sinceCombat = 0;
      if (kind === 'recompensa' || kind === 'grande') D.sinceReward = 0;
    }
    D.beats.push({ t: +D.t.toFixed(1), kind, why, source, done });
    if (D.beats.length > 40) D.beats.shift();
    return done;
  }

  // ---- cada paso de simulación ----
  function directorTick(dt) {
    const D = DIR; D.t += dt;
    for (const k of ['sinceEvent', 'sinceCombat', 'sinceReward', 'sinceDiscovery', 'sinceFall', 'sinceChase', 'sinceHealed', 'sinceBig']) D[k] += dt;
    D.phaseT += dt; D.needCd -= dt; D.rewardT -= dt;
    // combate en curso: enemigos cerca que ya van a por el jugador
    let combat = false, chase = false;
    for (const e of st.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - st.px, e.y - st.py), dz = Math.abs(e.z - st.pz);
      if (e.type === 'chaser') { if (d < 20) chase = true; continue; }
      if (!combat && d < 12 && dz < 5 && (e.wind > 0 || e.moving || (e.type === 'skull' && e.state !== 'idle') || e.type === 'caco')
        && clearPath(e.x, e.y, e.z + .3, st.px, st.py, st.pz + .6)) combat = true; // combate percibido: con línea de visión
    }
    if (combat) { D.sinceCombat = 0; D.sinceEvent = 0; D.pressure = Math.min(10, D.pressure + dt * .25); }
    if (chase) { D.sinceEvent = 0; D.pressure = Math.min(10, D.pressure + dt * .15); }
    // tiempo percibido de la partida (objetivo aproximado: 45 % travesía, 25 % combate, 10 % cada uno del resto)
    const cat = chase ? 'persecucion' : combat ? 'combate' : D.rewardT > 0 ? 'recompensa' : CALM[D.name] ? 'recuperacion' : 'travesia';
    D.time[cat] += dt; D.combatNow = combat;
    const k = Math.min(1, dt / 45); D.ema.combate += ((cat === 'combate') - D.ema.combate) * k; D.ema.persecucion += ((cat === 'persecucion') - D.ema.persecucion) * k;
    D.pressure = Math.max(0, D.pressure - dt * (CALM[D.name] ? .6 : .12));
    D.highT = D.pressure >= 7 ? D.highT + dt : 0;
    if (D.lastHp < st.maxHp && st.hp >= st.maxHp) D.sinceHealed = 0;
    D.lastHp = st.hp;
    // quieto y rama larga sin nada
    const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
    if (!moving && st.ground && !fireHeld && !combat) D.stillT += dt; else { D.stillT = 0; D.stillRolled = false; } // quieto sin pelear
    D.branchT = Math.hypot(st.px - C, st.py - C) > 11 ? D.branchT + dt : 0;

    // 1) protecciones que el azar nunca se salta
    if (D.highT > 20 && !CALM[D.name]) { directorPhase('respiro', rnd(6, 10)); return; } // demasiada presión seguida
    if (CALM[D.name]) { if (D.phaseT >= D.phaseLen) directorPhase('despertar', rnd(4, 8)); return; }
    // 2) el ciclo de fases
    if (D.phaseT >= D.phaseLen) {
      let k = (D.phase + 1) % RHYTHM.length;
      if (RHYTHM[k][0] === 'pico' && st.hp < st.maxHp * .35) k = RHYTHM.findIndex(r => r[0] === 'respiro'); // herido: sin pico
      directorPhase(RHYTHM[k][0], rnd(RHYTHM[k][1], RHYTHM[k][2]));
      return;
    }
    // 3) comportamiento del jugador: quieto demasiado tiempo → posible acechador (no justo después de curarse ni de caer)
    if (D.stillT > 5 && !D.stillRolled && D.sinceFall > 25 && D.sinceChase > 30 && D.sinceHealed > 6) {
      D.stillRolled = true;
      if (Math.random() < .4 && placeChaser(gen.tier >= 1 && Math.random() < .15 ? 'small' : 'normal')) return;
    }
    // 4) necesidades: el centro no se puede quedar vacío
    if (D.needCd > 0) return;
    let need = null;
    if (D.sinceBig > D.bigAt) { need = 'grande'; D.sinceBig = 0; D.bigAt = rnd(120, 240); }
    else if (D.sinceReward > 25) need = 'recompensa';
    else if (D.sinceCombat > 12 && st.hp >= st.maxHp * .35) need = 'encuentro';
    else if (D.sinceEvent > 8) need = 'presion';
    else if (D.branchT > 25 && D.sinceEvent > 5) need = Math.random() < .5 ? 'chaser' : 'encuentro';
    if (need) {
      D.needCd = 4;
      if (need === 'chaser') { D.decisions.ritmo++; if (placeChaser('normal')) D.branchT = 0; }
      else directorBeat(need, 'necesidad'); // si no encontró sitio, lo reintenta tras needCd
      return;
    }
  }
  // Resumen para el panel de sistemas y las pruebas
  function directorSummary() {
    const D = DIR, tot = Object.values(D.time).reduce((a, b) => a + b, 0) || 1;
    const pct = Object.entries(D.time).map(([k, v]) => `${k} ${Math.round(v / tot * 100)} %`).join(' · ');
    const dec = D.decisions.ritmo + D.decisions.azar || 1;
    return `Ritmo: ${PHASE_NAME[D.name]} ${D.phaseT.toFixed(0)}/${D.phaseLen.toFixed(0)} s · presión ${D.pressure.toFixed(1)} · sin combate ${D.sinceCombat.toFixed(0)} s · sin recompensa ${D.sinceReward.toFixed(0)} s · decide el ritmo ${Math.round(D.decisions.ritmo / dec * 100)} % · ${pct}`;
  }
