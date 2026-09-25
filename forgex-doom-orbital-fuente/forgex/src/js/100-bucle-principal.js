  // ================= BUCLE PRINCIPAL =================
  // La simulación (física, IA, proyectiles, objetos) avanza a paso fijo: CFG.perf.simHz pasos por segundo,
  // tanto si la pantalla va a 30 como a 240 FPS. El render dibuja cuando el navegador lo pide e interpola
  // las posiciones entre los dos últimos pasos, así el movimiento es suave aunque los ritmos no coincidan.
  // La cámara (ratón y flechas) se aplica en cada fotograma para que la respuesta sea inmediata.
  let last = performance.now(), fps = 60, genT = 0;
  let lastErr = null, errT = 0, simAcc = 0;
  const MAX_STEPS = 8; // si el equipo no da abasto, el juego se ralentiza en lugar de encadenar pasos sin fin
  let errRun = 0; // errores seguidos: si el motor activo falla en muchos fotogramas seguidos, se pasa al siguiente
  function frame(now) {
    try { step(now); errRun = 0; }
    catch (err) {
      lastErr = String(err && err.message || err); errT = 6; console.error(err && err.stack || err); last = now; lerpOut();
      if (++errRun >= 20 && BACKEND !== 'js') {
        const from = engineName(); errRun = 0;
        setBackend(BACKEND === 'webgpu' ? 'rust' : 'js').then(b => msg(`El motor ${from} falló en 20 fotogramas seguidos; ahora dibuja ${engineName()}.`, '#ffb347'));
      }
    }
    if (errT > 0) { errT -= .016; ctx.textAlign = 'left'; ctx.font = PM(600, 13); ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(8, H - 128, 560, 22);
      ctx.fillStyle = '#ff8a7a'; ctx.fillText('Error recuperado, el juego sigue: ' + lastErr.slice(0, 60), 14, H - 117); }
    requestAnimationFrame(frame);
  }
  function applyLook(dt) {
    st.pa += mdx * MSENS; st.look = clamp(st.look - mdy * MSENS * .8, -LOOK_MAX, LOOK_MAX);
    if (keys.ArrowLeft) st.pa -= ROT * dt;
    if (keys.ArrowRight) st.pa += ROT * dt;
    if (keys.ArrowUp) st.look = Math.min(LOOK_MAX, st.look + 1.3 * dt);
    if (keys.ArrowDown) st.look = Math.max(-LOOK_MAX, st.look - 1.5 * dt);
  }
  // ---- interpolación: posición anterior de cada cosa que se mueve ----
  function savePrev() {
    st.ox = st.px; st.oy = st.py; st.oz = st.pz;
    for (const e of st.enemies) { e.ox = e.x; e.oy = e.y; e.oz = e.z; }
    for (const b of st.proj) { b.ox = b.x; b.oy = b.y; b.oz = b.z; }
    for (const it of st.items) if (!it.ground || it.ox === undefined) { it.ox = it.x; it.oy = it.y; it.oz = it.z; }
  }
  const LERP = []; let lerpPl = false;
  // Mientras se dibuja, las posiciones se sustituyen por las interpoladas y después se restauran.
  // Un salto de más de 3 m entre pasos (teletransporte, vuelta al punto seguro) no se interpola.
  function lerpIn(a) {
    LERP.length = 0; lerpPl = false;
    if (a >= 1) return;
    const one = o => {
      if (o.ox === undefined) return;
      const dx = o.x - o.ox, dy = o.y - o.oy, dz = o.z - o.oz;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 3) return;
      o._x = o.x; o._y = o.y; o._z = o.z; o.x = o.ox + dx * a; o.y = o.oy + dy * a; o.z = o.oz + dz * a; LERP.push(o);
    };
    for (const e of st.enemies) one(e);
    for (const b of st.proj) one(b);
    for (const it of st.items) if (!it.ground) one(it);
    if (st.ox !== undefined) { const dx = st.px - st.ox, dy = st.py - st.oy, dz = st.pz - st.oz;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 3) { lerpPl = true; st._x = st.px; st._y = st.py; st._z = st.pz; st.px = st.ox + dx * a; st.py = st.oy + dy * a; st.pz = st.oz + dz * a; } }
  }
  function lerpOut() {
    for (const o of LERP) { o.x = o._x; o.y = o._y; o.z = o._z; }
    LERP.length = 0;
    if (lerpPl) { st.px = st._x; st.py = st._y; st.pz = st._z; lerpPl = false; }
  }
  // ---- un paso de simulación ----
  function simStep(dt) {
    savePrev();
    if (BACKEND !== 'js' && wasm && wasm.sim_step) {
      // Sincronizar st hacia Rust SIM y entidades antes del paso (preservando checkpoint)
      const cpX = st.cp ? st.cp[0] : st.px, cpY = st.cp ? st.cp[1] : st.py, cpZ = st.cp ? st.cp[2] : st.pz;
      wasm.sim_set_player(st.px, st.py, st.pz, st.pa, st.look, st.hp, st.reserve);
      if (wasm.sim_state) {
        const F = new Float32Array(wasm.memory.buffer, wasm.sim_state(), 30);
        if (st.cp) { F[19] = cpX; F[20] = cpY; F[21] = cpZ; }
        if (st.healLock !== undefined) F[13] = st.healLock;
      }
      wasm.sim_reset_entities();
      for (const e of st.enemies) {
        const k = e.type === 'imp' ? 0 : e.type === 'skull' ? 1 : 2;
        const id = wasm.sim_spawn(k, e.x, e.y, e.z);
        if (id) wasm.sim_set_entity(id, k, e.x, e.y, e.z, e.hp);
      }
      wasm.sim_reset_projectiles();
      for (const b of st.proj) {
        const k = b.kind === 'fire' ? 0 : 1;
        wasm.sim_spawn_projectile(k, b.x, b.y, b.z, b.vx, b.vy, b.vz, b.dmg, b.life);
      }
      wasm.sim_reset_items();
      for (const it of st.items) {
        if (!it.ground) {
          wasm.sim_add_item(0, it.x, it.y, it.z, it.vx, it.vy, it.vz);
        }
      }

      const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      const moving = fwd || str;
      if (moving && st.ground) st.bob += dt * 10;
      if (jumpReq && st.jumps === 1) burst(st.px, st.py, st.pz, 10, [rgb(95, 242, 230), rgb(200, 255, 255)], 1.5);

      wasm.sim_input(mdx, mdy, packKeys(keys), jumpReq ? 1 : 0, fireHeld ? 1 : 0);
      mdx = mdy = 0;
      jumpReq = false;

      const ta = performance.now();
      wasm.sim_step(dt);
      simAi += performance.now() - ta;

      // Sincronizar Rust SIM y entidades hacia st después del paso
      const ptr = wasm.sim_state();
      const S = new Float32Array(wasm.memory.buffer, ptr, 30);
      const U = new Uint32Array(wasm.memory.buffer, ptr, 30);

      const oldHp = st.hp;
      st.px = S[0]; st.py = S[1]; st.pz = S[2];
      st.vz = S[3]; st.pa = S[4]; st.look = S[5];
      st.ground = U[6] !== 0; st.jumps = U[7]; st.stuck = S[8];
      st.kx = S[9]; st.ky = S[10];
      st.hp = S[11]; st.reserve = S[12]; st.healLock = S[13];
      st.regenN = U[14]; st.regenT = S[15]; st.regenIdle = S[16];
      st.regenPend = U[17]; st.regenDrip = S[18];
      st.cp[0] = S[19]; st.cp[1] = S[20]; st.cp[2] = S[21];
      st.top = S[22]; st.dead = U[23] !== 0;
      st.shieldT = S[24]; st.shieldCd = S[25];

      if (st.dead && oldHp > 0) die();
      if (oldHp - st.hp >= FALL_DMG - 1 && st.healLock >= FALL_LOCK - 1) {
        SFX.fall();
        st.dmg = .6;
        msg(`Caíste al vacío: −${FALL_DMG} de vida. Curación bloqueada ${FALL_LOCK} s.`, '#ff8a7a');
      }

      // Sincronizar entidades
      const B = wasm.memory.buffer;
      const P_SCRATCH = 0x20000;
      const data = new Float32Array(B, P_SCRATCH, 9);
      let gone = false;
      for (let i = 0; i < st.enemies.length; i++) {
        const e = st.enemies[i];
        wasm.sim_get_entity(i + 1, P_SCRATCH);
        if (data[0] === 0) { gone = true; continue; }
        e.x = data[2]; e.y = data[3]; e.z = data[4];
        e.hp = data[5]; e.hurt = data[6];
        if (data[7] > 0) { e.dead = true; e.deadT = data[7]; }
      }
      if (gone) st.enemies = st.enemies.filter(e => !(e.dead && e.type !== 'imp' && e.deadT > .55));

      // Sincronizar ítems en caída
      let itemIdx = 1;
      for (const it of st.items) {
        if (!it.ground) {
          wasm.sim_get_item(itemIdx++, P_SCRATCH);
          it.x = data[2]; it.y = data[3]; it.z = data[4];
          it.vx = data[5]; it.vy = data[6]; it.vz = data[7];
          if (data[8] > 0.5) it.ground = true;
        }
      }
      let near = null, nd = 1.25;
      for (const it of st.items) {
        if ((it.kind === 'crate' && it.open) || it.kind === 'beacon') continue;
        const d = Math.hypot(it.x - st.px, it.y - st.py);
        if (d < nd && Math.abs(it.z - st.pz) < 1.2) { nd = d; near = it; }
      }
      st.near = near;

      st.cd -= dt; st.shieldT = Math.max(0, st.shieldT - dt); st.shieldCd = Math.max(0, st.shieldCd - dt);
      if (fireHeld && st.cd <= 0) shoot();
    } else {
      physics(dt);
      st.cd -= dt; st.shieldT = Math.max(0, st.shieldT - dt); st.shieldCd = Math.max(0, st.shieldCd - dt);
      if (fireHeld && st.cd <= 0) shoot();
      const ta = performance.now(); updateEnemies(dt); simAi += performance.now() - ta;
      updateProjectiles(dt); updateItems(dt);
    }
    st.ambT -= dt; if (st.ambT <= 0) { SFX.distant(); st.ambT = rnd(9, 22) * (1 - .5 * Math.min(1, axisT(st.px, st.py))); }
    { const bi = bandOf(st.px, st.py); if (bi > st.band) msg(`Te alejas del eje: ${BANDS[bi][2].toLowerCase()}.`, BAND_COL[bi]); st.band = bi; }
    if (st.hp < st.maxHp * .3) { st.hbT -= dt; if (st.hbT <= 0) { SFX.heart(); st.hbT = .95; } }
    genT -= dt; if (genT <= 0) { genT = .5; let n = 0; while (gen.h < st.top + 32 && n++ < 6) nextStep(); }
    st.pruneT -= dt; if (st.pruneT <= 0) { st.pruneT = 2; prune(); }
    let z = null; for (let q = ships.length - 1; q >= 0; q--) { const s = ships[q]; if (st.px >= s.x0 && st.px < s.x0 + s.w && st.py >= s.y0 && st.py < s.y0 + s.h && st.pz >= s.zf - .6 && st.pz < s.zf + (s.hgt || CH)) { z = s; break; } }
    if (z && z !== st.zoneRef) { st.zone = z.name; st.zoneT = 2.6; }
    st.zoneRef = z || null;
  }
  let simAi = 0;

  // ---- AUTO: calidad adaptativa ----
  // Nunca cambia la configuración guardada: calcula valores «efectivos» (EFF) recortando lo que eligió el jugador.
  // Nivel 0 = sin recortes. Recorta un nivel si la carga pasa del 92 % del presupuesto durante 1,5 s;
  // recupera un nivel si baja del 60 % durante 5 s. Si al recuperar vuelve a saturarse en menos de 8 s,
  // ese nivel queda bloqueado 30 s (evita el vaivén).
  const AUTO_LEVELS = [
    {},
    { rt: 2 },
    { rt: 1 },
    { rt: 1, scale: .875 },
    { rt: 1, scale: .75 },
    { rt: 0, scale: .75 },
    { rt: 0, scale: .625, lights: 8 },
    { rt: 0, scale: .5, lights: 8, parts: 1 },
  ];
  const AUTOQ = { level: 0, hi: 0, lo: 0, cool: 0, since: 0, block: new Float64Array(AUTO_LEVELS.length), note: '', load: 0 };
  const LIGHT_CAP = [0, 8, 12];
  function computeEff() {
    const L = CFG.perf.auto ? AUTO_LEVELS[AUTOQ.level] : AUTO_LEVELS[0];
    const cap = (v, c) => c === undefined ? v : Math.min(v, c);
    EFF.rt = BACKEND === 'js' ? 0 : cap(CFG.rt.mode, L.rt);
    EFF.lights = cap(LIGHT_CAP[CFG.graphics.lighting], L.lights);
    EFF.parts = cap(CFG.graphics.particles, L.parts);
    EFF.scale = CFG.graphics.dynamicRes ? cap(1, L.scale) : 1;
    if (EFF.scale !== resScale) { resScale = EFF.scale; applyResolution(false); }
  }
  // ¿cambiaría algo este nivel respecto al anterior? (si no, se salta: p. ej. escalas con la resolución dinámica apagada)
  function effAt(n) {
    const L = AUTO_LEVELS[n];
    return [BACKEND === 'js' ? 0 : Math.min(CFG.rt.mode, L.rt ?? 3), CFG.graphics.dynamicRes ? (L.scale ?? 1) : 1,
      Math.min(LIGHT_CAP[CFG.graphics.lighting], L.lights ?? 16), Math.min(CFG.graphics.particles, L.parts ?? 2)].join();
  }
  const levelDiffers = (a, b) => effAt(a) !== effAt(b);
  function autoTick(dt) {
    const A = AUTOQ;
    if (!CFG.perf.auto) { if (A.level) { A.level = 0; computeEff(); } A.note = ''; return; }
    const target = Math.min(CFG.perf.targetFps, CAPS.refresh + 2), budget = 1000 / target;
    A.load = Math.max(perf.total, perf.gpu, WORKERS.active ? perf.thread : 0) / budget;
    A.cool -= dt; A.since += dt;
    if (A.cool > 0) return;
    if (A.load > .92) { A.hi += dt; A.lo = 0; } else if (A.load < .6) { A.lo += dt; A.hi = 0; } else { A.hi = A.lo = 0; }
    if (A.hi > 1.5 && A.level < AUTO_LEVELS.length - 1) {
      let n = A.level + 1; while (n < AUTO_LEVELS.length - 1 && !levelDiffers(n, A.level)) n++;
      if (!levelDiffers(n, A.level)) { A.hi = 0; return; }
      if (A.since < 8) A.block[A.level] = time + 30; // acababa de recuperar este nivel y no aguantó
      A.level = n; A.hi = 0; A.cool = 2; A.since = 0; computeEff();
    } else if (A.lo > 5 && A.level > 0) {
      let n = A.level - 1; while (n > 0 && !levelDiffers(n, A.level)) n--;
      if (A.block[n] > time) { A.lo = 0; return; }
      A.level = n; A.lo = 0; A.cool = 2; A.since = 0; computeEff();
    }
    const L = AUTO_LEVELS[A.level];
    A.note = A.level === 0 ? `sin recortes, carga ${Math.round(A.load * 100)} %`
      : `nivel ${A.level}: ${[L.rt !== undefined && CFG.rt.mode > L.rt ? 'RT ' + ['apagado', '4 luces', 'todas'][L.rt] : '', L.scale && CFG.graphics.dynamicRes ? 'resolución ' + Math.round(L.scale * 100) + ' %' : '', L.lights ? L.lights + ' luces' : '', L.parts !== undefined ? 'menos partículas' : ''].filter(Boolean).join(', ')}; carga ${Math.round(A.load * 100)} %`;
  }

  let prevNow = 0;
  function step(now) {
    const tS = performance.now();
    const gap = prevNow ? now - prevNow : 16.7; prevNow = now;
    const dt = Math.min((now - last) / 1000, 0.1); last = now; time += dt; fps = fps * .9 + (1 / Math.max(dt, 1e-3)) * .1;
    const live = started && !st.dead && !paused;
    const SIM_DT = 1 / CFG.perf.simHz;
    let steps = 0; simAi = 0;
    if (live) {
      applyLook(dt);
      simAcc += dt;
      while (simAcc >= SIM_DT && steps < MAX_STEPS) { simStep(SIM_DT); simAcc -= SIM_DT; steps++; }
      if (steps === MAX_STEPS) simAcc = 0;
    } else simAcc = 0;
    PERF.c.simSteps = steps;
    mdx = mdy = 0;
    st.land = Math.max(0, st.land - dt * 3); st.kick = Math.max(0, st.kick - dt * 6); st.flash = Math.max(0, st.flash - dt);
    if (!paused) { for (const f of st.flashes) f.life -= dt; st.flashes = st.flashes.filter(f => f.life > 0); updateParts(dt); }
    PERF.c.particles = PARTS.n;
    const tA0 = performance.now(); perfAdd('sim', tA0 - tS); perfAdd('ai', simAi); perfAdd('logic', tA0 - tS);
    computeEff(); autoTick(dt); // (computeEff cada fotograma: cualquier cambio de CFG se aplica al momento)

    lerpIn(live && CFG.perf.interpolate ? simAcc / SIM_DT : 1);
    try { renderWorld(); } finally { lerpOut(); }

    // composición: escena + bloom + viñeta
    const tE = performance.now();
    if (WORKERS.active) { if (WK.next) PERF.img++; workersPresent(); } else { lctx.putImageData(img, 0, 0); PERF.img++; }
    ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false; ctx.drawImage(low, 0, 0, W, H);
    if (CFG.graphics.bloom) {
      g1x.imageSmoothingEnabled = g2x.imageSmoothingEnabled = true;
      if (WORKERS.active) {} // los hilos ya dejaron su parte del brillo reducido en g1
      else if (gfx && g1img) { gfx.bloom_down(RW, RH, 0, RW); g1x.putImageData(g1img, 0, 0); } // Rust reduce el brillo a 1/4 y JS sube solo esa imagen
      else { gctx.putImageData(gimg, 0, 0); g1x.clearRect(0, 0, g1.width, g1.height); g1x.drawImage(glowC, 0, 0, g1.width, g1.height); }
      g2x.clearRect(0, 0, g2.width, g2.height); g2x.drawImage(g1, 0, 0, g2.width, g2.height);
      ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .9; ctx.drawImage(g1, 0, 0, W, H); ctx.globalAlpha = .7; ctx.drawImage(g2, 0, 0, W, H); ctx.globalAlpha = 1;
    }
    composeOverlays(dt);
    const tF = performance.now(); perfAdd('comp', tF - tE);
    drawHUD(dt);
    const tG = performance.now();
    perfAdd('hud', tG - tF); perfAdd('total', tG - tS);
    perfFrame(tG - tS, gap);
    if (wasm && wasm.prof_drain && wasm.prof_buf) {
      const out = new Float32Array(wasm.memory.buffer, wasm.prof_buf(), 7);
      wasm.prof_drain(wasm.prof_buf(), 7);
      PERF.rust = Array.from(out);
    }
    PERF.t += dt; if (PERF.t >= 1 / CFG.perf.statsHz) { PERF.t = 0; perfStats(); }
    if (CFG.debug.overlay) drawPerf();
    if (CFG.debug.systems) drawSystems();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const banner = (big, color, lines) => {
      ctx.fillStyle = 'rgba(4,2,12,.78)'; ctx.fillRect(0, H / 2 - 130, W, 210);
      ctx.font = SS(700, 48); glowText(big, W / 2, H / 2 - 82, color, 24);
      ctx.font = PM(600, 17); ctx.fillStyle = '#e6e2f5'; lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 30 + i * 28));
    };
    if (!started) banner('ASCIENDE', '#5ff2e6', ['Haz clic para empezar. Sube lo más alto que puedas.', 'Llevas un rifle de plasma, 24 celdas y un escudo. Nada más.', 'Las ramas laterales no suben tu marca: solo dan recursos… a veces.']);
    else if (paused) banner('PAUSA', '#5ff2e6', [pauseWhy || 'El juego está detenido: los demonios también esperan.', 'Pulsa P, el botón Continuar o haz clic en la pantalla para seguir.', `Altura actual: ${Math.round(st.pz * 10)} m · Punto seguro: ${Math.round(st.cp[2] * 10)} m`]);
    else if (st.dead) banner('HAS MUERTO', '#ff2828', [`Altura máxima en la ruta: ${Math.round(st.top * 10)} m · Mejor marca: ${Math.round(best * 10)} m`, 'Pulsa R (o FUEGO en pantalla táctil) para intentarlo de nuevo.', 'Cada partida genera una torre distinta.']);
    ctx.textAlign = 'right'; ctx.font = SS(400, 12); ctx.fillStyle = '#6a6488';
    ctx.fillText(`${fps | 0} FPS · ${QUALITIES[quality][0]}${resScale < 1 ? ' ' + Math.round(resScale * 100) + '%' : ''} · ${{ webgpu: 'WEBGPU', rust: 'RUST', js: 'JS' }[BACKEND]}${EFF.rt ? ' · RT' : ''}${CFG.perf.auto && AUTOQ.level ? ' · AUTO −' + AUTOQ.level : ''}${st.lamp ? '' : ' · SIN LINTERNA'}`, W - 12, H - 88);
  }
  // efectos a pantalla completa sobre la escena (fogonazo, arma, viñeta, grano, escudo, curación, daño) y la mira
  function composeOverlays(dt) {
    ctx.globalCompositeOperation = 'lighter';
    if (st.flash > 0) { const fl = ctx.createRadialGradient(W / 2, H * .7, 10, W / 2, H * .7, W * .7);
      fl.addColorStop(0, `rgba(255,200,120,${st.flash * 3})`); fl.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = fl; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'source-over';
    drawGunLit();
    ctx.drawImage(vig, 0, 0);
    if (CFG.graphics.grain) { ctx.save(); ctx.globalAlpha = .07; ctx.globalCompositeOperation = 'overlay'; ctx.translate(-(Math.random() * 128 | 0), -(Math.random() * 128 | 0));
      ctx.fillStyle = grainP; ctx.fillRect(0, 0, W + 128, H + 128); ctx.restore(); }
    { const tAx = axisT(st.px, st.py); if (tAx > .55) { ctx.fillStyle = `rgba(40,0,16,${Math.min(.32, (tAx - .55) * .8)})`; ctx.fillRect(0, 0, W, H); } }
    if (st.shieldT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const sg = ctx.createRadialGradient(W / 2, H / 2, H * .25, W / 2, H / 2, H * .75); sg.addColorStop(0, 'rgba(95,242,230,0)'); sg.addColorStop(1, `rgba(95,242,230,${.55 * st.shieldT / .6 + .15})`);
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    }
    if (st.healing) { const hg = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .8); hg.addColorStop(0, 'rgba(125,255,74,0)'); hg.addColorStop(1, `rgba(125,255,74,${.08 + .05 * Math.sin(time * 6)})`); ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H); }
    if (st.dmg > 0) { st.dmg -= dt; const dg = ctx.createRadialGradient(W / 2, H / 2, H * .2, W / 2, H / 2, H * .8);
      dg.addColorStop(0, 'rgba(200,0,0,0)'); dg.addColorStop(1, `rgba(220,0,0,${Math.min(.9, st.dmg * 2)})`); ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H); }
    // mira
    ctx.strokeStyle = st.shieldT > 0 ? '#ffffff' : '#5ff2e6'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(W / 2 - 10, H / 2); ctx.lineTo(W / 2 - 3, H / 2); ctx.moveTo(W / 2 + 3, H / 2); ctx.lineTo(W / 2 + 10, H / 2);
    ctx.moveTo(W / 2, H / 2 - 10); ctx.lineTo(W / 2, H / 2 - 3); ctx.moveTo(W / 2, H / 2 + 3); ctx.lineTo(W / 2, H / 2 + 10); ctx.stroke();
  }
