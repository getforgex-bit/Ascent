  // ================= RAMAS RADIALES DE EXPLORACIÓN =================
  // Devuelve si en la plataforma pasa algo (objeto, contenedor o enemigo). Con `force` (latido de la rama) siempre pasa
  // algo; en una región estéril puede ser solo un contenedor, a veces vacío: una razón para mirar, no un premio.
  function decoratePlat(R, tier, threat, force = false) {
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, t = axisT(cx, cy);
    const it = contentAt(cx, cy, R.zt);
    let beat = !!it;
    placeContent(cx, cy, R.zt, it, .35);
    if (R.w >= 2) {
      const ic = [Math.floor(cx), Math.floor(cy)];
      const corners = [[R.x, R.y], [R.x + R.w - 1, R.y], [R.x, R.y + R.h - 1], [R.x + R.w - 1, R.y + R.h - 1]].filter(([i, j]) => i !== ic[0] || j !== ic[1]);
      if (Math.random() < .2) { const [i, j] = pick(corners); addBlock(i, j, R.zt, R.zt + rnd(1.1, 2.2), 2); }
      else if (Math.random() < .12) { const [i, j] = pick(corners); for (const b of cells[j * MW + i] || NONE) if (Math.abs(b.zt - R.zt) < .01) { b.tex = 7; b.acid = true; } worldOp(2, [i, j, R.zt]); }
    }
    const pE = { baja: .05, media: .1, alta: .2 }[threat] * (.7 + t);
    if (R.w >= 2 && Math.random() < pE) { spawn('imp', cx, cy, R.zt); beat = true; }
    else if (Math.random() < pE * .3 && (tier >= 1 || t > .4)) { if (!solidAt(cx, cy, R.zt + 2.2)) { spawn('caco', cx, cy, R.zt + 2.2); beat = true; } }
    else if (Math.random() < pE * .2) { if (!solidAt(cx, cy, R.zt + 1.5)) { spawn('skull', cx, cy, R.zt + 1.5); beat = true; } }
    if (force && !beat) {
      beat = true;
      if (regionAt(cx, cy, R.zt) === 'esteril') addItem('crate', cx, cy, R.zt, { content: Math.random() < .5 ? { kind: 'ammo', ammo: 'celdas', count: randi(1, 2) } : null, open: false });
      else if (Math.random() < .6) placeContent(cx, cy, R.zt, rollType(regionAt(cx, cy, R.zt)), .5);
      else if (R.w >= 2) spawn('imp', cx, cy, R.zt);
      else if (!solidAt(cx, cy, R.zt + 1.5)) spawn('skull', cx, cy, R.zt + 1.5);
      else addItem('crate', cx, cy, R.zt, { content: null, open: false });
    }
    return beat;
  }
  function altar(P, hd, tier, threat) {
    const s = 4, dd = Math.max(P.w, P.h) / 2 + s / 2 + rnd(.6, 1.2), pcx = P.x + P.w / 2, pcy = P.y + P.h / 2;
    const R = { x: Math.round(pcx + Math.cos(hd) * dd - s / 2), y: Math.round(pcy + Math.sin(hd) * dd - s / 2), w: s, h: s, zt: round20(P.zt + rnd(-.2, .5)) };
    if (overlap(P, R) || rectGap(P, R) > 1.8 || Math.hypot(R.x + 2 - C, R.y + 2 - C) > R_MAX + 1) return false;
    if (!clearArea(R.x, R.y, s, s, R.zt - 2.5, R.zt + 3)) return false;
    plat(R.x, R.y, s, s, R.zt, 1.2, 2);
    addBlock(R.x, R.y, R.zt, R.zt + 2.4, 2); addBlock(R.x + 3, R.y + 3, R.zt, R.zt + 2.4, 2);
    for (const [a, b] of [[1.5, 1.5], [2.5, 2.5], [1.5, 2.5]]) placeContent(R.x + a, R.y + b, R.zt, contentAt(R.x + a, R.y + b, R.zt), .6, .3);
    if (Math.random() < { baja: .3, media: .5, alta: .8 }[threat]) { if (Math.random() < .7) spawn('imp', R.x + 2.5, R.y + 1.5, R.zt); else spawn('caco', R.x + 2, R.y + 2, R.zt + 2); }
    gen.altars++; return true;
  }
  function secret(S, tier) {
    const side = S.hd + pick([-1, 1]) * Math.PI / 2, dd = Math.max(S.w, S.h) / 2 + 1 + rnd(.3, .9), pcx = S.x + S.w / 2, pcy = S.y + S.h / 2;
    const R = { x: Math.round(pcx + Math.cos(side) * dd - 1), y: Math.round(pcy + Math.sin(side) * dd - 1), w: 2, h: 2, zt: round20(S.zt - rnd(1.3, 1.9)) };
    if (overlap(S, R) || rectGap(S, R) > 1.6 || Math.hypot(R.x + 1 - C, R.y + 1 - C) > R_MAX) return;
    if (!clearArea(R.x, R.y, 2, 2, R.zt - 1.8, R.zt + 2.8)) return;
    plat(R.x, R.y, 2, 2, R.zt, .5, 1);
    addItem('crate', R.x + 1, R.y + 1, R.zt, { content: contentAt(R.x + 1, R.y + 1, R.zt, .3), open: false });
    gen.secrets++;
  }
  // Cada rama decide por sí sola longitud, dificultad, amenaza, desvíos, construcciones, final y contenido
  function genBranch(node, ang, tier, depth) {
    const Lk = wpick([['corta', .35], ['media', .4], ['larga', .25]])[0];
    const target = (Lk === 'corta' ? rnd(25, 45) : Lk === 'media' ? rnd(60, 100) : rnd(120, 220)) * (depth ? .35 : 1);
    const diff = pick(['facil', 'normal', 'normal', 'dificil']), threat = pick(['baja', 'media', 'media', 'alta']);
    const tex = Math.random() < .5 ? 1 : 2;
    let P = node, heading = ang, trav = 0, hitLimit = false, ended = false, nextPOI = rnd(18, 40), zBase = node.zt; const plats = [];
    // Latidos: una rama larga no puede ser un vacío largo. Cada 3–5 plataformas pasa algo (5–8 en las profundas o
    // lejanas, que pueden estar más vacías pero nunca del todo).
    const beatGap = () => depth || axisT(P.x, P.y) > .6 ? randi(5, 8) : randi(3, 5);
    let sinceBeat = 0, gap = beatGap();
    for (let i = 0; i < 600 && trav < target; i++) {
      if (depth === 0 && plats.length && trav >= nextPOI) { // punto de interés en mitad de la rama
        nextPOI = trav + rnd(35, 80);
        const r = Math.random(), t = axisT(P.x + P.w / 2, P.y + P.h / 2);
        let kind = r < .5 ? (t > .08 && target - trav > 20 ? 'maze' : 'house') : r < .8 ? 'house' : null;
        if (t > .18 && target - trav > 40 && Math.random() < .14) kind = 'mega';
        if (kind) {
          const res = placeBuilding(P, heading, kind, tier, { cont: kind === 'house' ? Math.random() < .55 : Math.random() < .85, extra: kind === 'mega' ? randi(3, 5) : kind === 'maze' ? randi(0, 2) : 0 });
          if (res) { trav += res.len; if (!res.landing) { ended = true; break; } P = res.landing; P.hd = heading = res.hd; zBase = P.zt; plats.push(P); continue; }
        }
      }
      heading += rnd(-.28, .28) + (Math.random() < .1 ? pick([-.7, .7]) : 0);
      let placed = null;
      for (const [dev, dz] of [[0, 0], [.45, 0], [-.45, 0], [0, 1], [0, -1], [.9, 0], [-.9, 0], [.45, 1], [-.45, -1], [1.4, 0], [-1.4, 0], [0, 2], [0, -2], [.9, 2], [-.9, -2], [1.9, 0], [-1.9, 0], [1.4, 2], [-1.4, -2]]) {
        const hd = heading + dev, size = diff === 'facil' ? randi(2, 3) : diff === 'dificil' ? (Math.random() < .7 ? 1 : 2) : randi(1, 3);
        const gap = diff === 'facil' ? rnd(.3, 1) : diff === 'dificil' ? rnd(1, 1.7) : rnd(.5, 1.4);
        const dd = Math.max(P.w, P.h) / 2 + size / 2 + gap, pcx = P.x + P.w / 2, pcy = P.y + P.h / 2;
        const R = { x: Math.round(pcx + Math.cos(hd) * dd - size / 2), y: Math.round(pcy + Math.sin(hd) * dd - size / 2), w: size, h: size,
          zt: round20(clamp(P.zt + rnd(-.45, .65) + dz * .9, zBase - 4, zBase + 5)) };
        if (Math.hypot(R.x + size / 2 - C, R.y + size / 2 - C) > R_MAX) { hitLimit = true; continue; }
        if (overlap(P, R) || rectGap(P, R) > 1.8) continue;
        const th = rnd(.35, .9);
        if (!clearArea(R.x, R.y, size, size, R.zt - th - 1.3, R.zt + 2.8)) continue;
        placed = { R, th, hd }; break;
      }
      if (!placed) break;
      hitLimit = false;
      const { R, th, hd } = placed; heading = hd; R.hd = hd;
      plat(R.x, R.y, R.w, R.h, R.zt, th, tex);
      trav += Math.hypot(R.x - P.x, R.y - P.y); P = R; plats.push(R);
      if (decoratePlat(R, tier, threat, ++sinceBeat >= gap)) { gen.maxQuiet = Math.max(gen.maxQuiet, sinceBeat - 1); sinceBeat = 0; gap = beatGap(); }
    }
    if (!plats.length) return 0;
    gen.branches++; gen.branchPlats += plats.length; if (!depth) gen.lens.push(Math.round(trav)); if (!depth && trav < target && !ended) gen.stuck++;
    gen.maxReach = Math.max(gen.maxReach, axisT(P.x + P.w / 2, P.y + P.h / 2));
    if (!ended) {
      const tEnd = axisT(P.x + P.w / 2, P.y + P.h / 2);
      if (depth === 0 && (hitLimit || tEnd > .85) && Math.random() < .10 && makeFarlands(P, tier)) { /* Farlands */ }
      else if (hitLimit) { addItem('beacon', P.x + P.w / 2, P.y + P.h / 2, P.zt); gen.limits++; }
      else if (plats.length >= 3) { // final de la rama
        const r = Math.random(), t = axisT(P.x + P.w / 2, P.y + P.h / 2);
        if (r < (depth ? .3 : .45)) { if (!placeBuilding(P, heading, 'house', tier, { cont: false, extra: 0 })) altar(P, heading, tier, threat); }
        else if (!depth && r < .55 && t > .2) { if (!placeBuilding(P, heading, 'mega', tier, { cont: false, extra: randi(3, 5) })) altar(P, heading, tier, threat); }
        else if (!depth && r < .7 && t > .08) { if (!placeBuilding(P, heading, 'maze', tier, { cont: false, extra: randi(1, 2) })) altar(P, heading, tier, threat); }
        else if (r < .8) altar(P, heading, tier, threat);
      }
    }
    if (depth === 0) for (let k = Math.floor(plats.length / 15); k > 0; k--) if (Math.random() < .5) { // desvíos laterales
      const s = plats[randi(1, plats.length - 2)]; if (s && s.hd != null) genBranch(s, s.hd + pick([-1, 1]) * rnd(.9, 1.4), tier, 1); }
    for (let k = Math.max(1, Math.floor(plats.length / 12)); k > 0; k--) if (plats.length >= 3 && Math.random() < .15) { const s = plats[randi(1, plats.length - 1)]; if (s.hd != null) secret(s, tier); }
    return plats.length;
  }
  // FARLANDS: tres megamasmorras encadenadas, siempre por fuera del radio de generación
  function makeFarlands(P, tier) {
    const rOut = Math.atan2(P.y + P.h / 2 - C, P.x + P.w / 2 - C);
    let Q = P; // la rama se prolonga hasta el borde para que haya forma de llegar
    for (let k = 0; k < 30; k++) {
      const qx = Q.x + Q.w / 2, qy = Q.y + Q.h / 2; if (Math.hypot(qx - C, qy - C) >= R_MAX - 3) break;
      const R = { x: Math.round(qx + Math.cos(rOut) * (Q.w / 2 + 2) - 1), y: Math.round(qy + Math.sin(rOut) * (Q.h / 2 + 2) - 1), w: 2, h: 2, zt: Q.zt };
      if (overlap(Q, R) || rectGap(Q, R) > 1.8 || !clearArea(R.x, R.y, 2, 2, R.zt - 1.6, R.zt + 2.6)) break;
      plat(R.x, R.y, 2, 2, R.zt, .5, 2); R.hd = rOut; Q = R;
    }
    const r1 = placeBuilding(Q, rOut, 'mega', tier + 2, { cont: true, contPerp: true, extra: randi(2, 4), far: true });
    if (!r1) return false;
    let parts = 1, cur = r1;
    for (let k = 0; k < 2 && cur && cur.landing; k++) {
      const r = placeBuilding(cur.landing, cur.hd, 'mega', tier + 2, { cont: k === 0, extra: randi(2, 4), far: true });
      if (!r) break; parts++; cur = r;
    }
    gen.farlands++; gen.farParts += parts; return true;
  }
  // Nodo de bifurcación: 1–4 ramas en cruz (+) o equis (×) con rotación completa al azar
  function makeNode(R, tier) {
    const n = wpick([[1, .4], [2, .3], [3, .2], [4, .1]])[0], rot = rnd(0, TAU);
    let arms = [0, 1, 2, 3];
    if (n === 1) arms = [randi(0, 3)];
    else if (n === 2) { const k = randi(0, 3); arms = Math.random() < .8 ? [k, (k + 2) % 4] : [k, (k + 1) % 4]; }
    else if (n === 3) arms.splice(randi(0, 3), 1);
    let made = 0;
    for (const a of arms) if (genBranch(R, rot + a * Math.PI / 2 + rnd(-.12, .12), tier, 0) > 0) made++;
    gen.nodes++; gen.armsTried += arms.length; gen.armsMade += made;
    return made;
  }

  // Ruta central: espiral de plataformas alrededor del eje, con impulsores ocasionales
  function nextStep() {
    const P = gen.last;
    for (let t = 0; t < 50; t++) {
      const pad = !gen.afterPad && gen.steps > 5 && Math.random() < .1;
      const size = pad ? 1 : (Math.random() < .55 ? 2 : 3);
      const dh = gen.afterPad ? rnd(3.2, 4.2) : pad ? 0 : rnd(.55, 1.1);
      const ang = gen.ang + rnd(.3, .8) * gen.dir, r = clamp(gen.r + rnd(-1.4, 1.4), 3, 7);
      const R = { x: Math.round(C + Math.cos(ang) * r - size / 2), y: Math.round(C + Math.sin(ang) * r - size / 2), w: size, h: size, zt: Math.round((P.zt + dh) * 20) / 20 };
      if (overlap(P, R) || rectGap(P, R) > (gen.afterPad ? 1.5 : pad ? 1 : 1.9)) continue;
      const th = pad ? .6 : rnd(.5, 1.1);
      if (!clearArea(R.x, R.y, size, size, R.zt - th - 1.3, R.zt + 2.8)) continue;
      return placeStep(R, th, pad, ang, r);
    }
    gen.dir *= -1; gen.fails++;
    if (gen.fails > 3) {
      const a = Math.atan2(P.y + P.h / 2 - C, P.x + P.w / 2 - C) + .9 * gen.dir;
      placeStep({ x: Math.round(C + Math.cos(a) * 5 - 1), y: Math.round(C + Math.sin(a) * 5 - 1), w: 2, h: 2, zt: P.zt + .8 }, .6, false, a, 5);
    }
  }
  function placeStep(R, th, pad, ang, r) {
    const band = Math.floor(R.zt / 25) % 2;
    plat(R.x, R.y, R.w, R.h, R.zt, th, pad ? 3 : (Math.random() < .75 ? [1, 2][band] : [2, 1][band]), pad ? PAD : 0, true);
    const afterPad = gen.afterPad;
    Object.assign(gen, { last: R, h: R.zt, ang, r, afterPad: pad, fails: 0 }); gen.steps++; R.pad = pad; gen.route.push(R);
    if (pad) return;
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    // la ruta central ya no depende solo del azar: estas tiradas quedan al 40 % y el Director de Ritmo pone el resto
    if (gen.steps > 4 && Math.random() < Math.min(.38, .1 + R.zt * .005) * ROUTE_RANDOM) spawn('imp', cx, cy, R.zt);
    else if (Math.random() < .05) addItem('ammo', cx, cy, R.zt, { ammo: Math.random() < .7 ? 'celdas' : 'cartuchos', count: randi(1, 3) });
    // nodo de bifurcación: no siempre aparece
    if (R.zt >= gen.nodeNext && R.w >= 2 && !afterPad) {
      gen.nodeNext = R.zt + rnd(6, 10);
      if (Math.random() < .7 && makeNode(R, gen.tier) > 0) gen.tier++;
    }
    if (gen.tier >= 2 && Math.random() < .05 * ROUTE_RANDOM) { const x = cx + rnd(-3, 3), y = cy + rnd(-3, 3); if (!solidAt(x, y, R.zt + 2.5)) spawn('caco', x, y, R.zt + 2.5); }
  }
  function initWorld() {
    cells = new Array(MW * MH); cellIdx = new Set(); ships = []; lights = []; worldOp(4, []);
    CHUNKS.map.clear(); CHUNKS.key = ''; CHUNKS.win = CHUNKS.stream ? chunkWindow(st.px, st.py, st.pz, 0) : null;
    gen = { route: [], maxQuiet: 0, h: 0, ang: rnd(0, TAU), r: 5, dir: Math.random() < .5 ? 1 : -1, last: null, steps: 0, fails: 0, afterPad: false, tier: 0, nodeNext: rnd(4, 6),
      regions: {}, rolls: 0, hits: 0, nodes: 0, armsTried: 0, branches: 0, branchPlats: 0, altars: 0, secrets: 0, maxReach: 0, lens: [], limits: 0, armsMade: 0, shipsMade: 0, dungeons: 0, houses: 0, linked: 0, stuck: 0, megas: 0, farlands: 0, farParts: 0 };
    plat(C - 2, C - 2, 5, 5, 0, 1.5, 1, 0, true);
    gen.last = { x: C - 2, y: C - 2, w: 5, h: 5, zt: 0 }; gen.route.push(gen.last);
    let n = 0; while (gen.h < 34 && n++ < 400) nextStep();
  }
  function prune() {
    const minZ = Math.min(st.cp[2], st.pz) - 22;
    pruneWorld(minZ);
    st.enemies = st.enemies.filter(e => e.z > minZ); st.items = st.items.filter(i => i.z > minZ); ships = ships.filter(s => s.zf > minZ); lights = lights.filter(l => l.z > minZ);
    gen.route = gen.route.filter(R => R.zt > minZ);
  }
