  // ================= DISPARO =================
  function hitscan(off, dmg, pierce, range) {
    if (BACKEND !== 'js' && wasm && wasm.sim_hitscan) {
      if (wasm.sim_set_player) wasm.sim_set_player(st.px, st.py, st.pz, st.pa, st.look, st.hp, st.reserve);
      wasm.sim_reset_entities();
      const alive = [];
      for (const e of st.enemies) {
        if (e.dead) continue;
        const k = e.type === 'imp' ? 0 : e.type === 'skull' ? 1 : 2;
        const id = wasm.sim_spawn(k, e.x, e.y, e.z);
        if (id) {
          wasm.sim_set_entity(id, k, e.x, e.y, e.z, e.hp);
          alive.push(e);
        }
      }
      const resPtr = wasm.sim_hitscan(off, 0, pierce ? 1 : 0, range);
      const B = wasm.memory.buffer;
      const count = new Uint32Array(B, resPtr, 1)[0];
      const ids = new Uint32Array(B, resPtr + 4, count);
      for (let i = 0; i < count; i++) {
        const id = ids[i];
        const target = alive[id - 1];
        if (target) damageEnemy(target, dmg);
      }
      return;
    }
    const a = st.pa + off, ca = Math.cos(a), sa = Math.sin(a), hits = [], camZ = st.pz + EYE;
    for (const e of st.enemies) {
      if (e.dead) continue;
      const dx = e.x - st.px, dy = e.y - st.py, along = dx * ca + dy * sa;
      if (along <= 0 || along > range) continue;
      const rad = e.type === 'caco' ? .8 : .45;
      if (Math.abs(-dx * sa + dy * ca) > rad) continue;
      const ez = e.type === 'imp' ? e.z + .55 : e.z;
      if (clearPath(st.px, st.py, camZ, e.x, e.y, ez)) hits.push([along, e]);
    }
    hits.sort((p, q) => p[0] - q[0]);
    for (const [, e] of pierce ? hits : hits.slice(0, 1)) damageEnemy(e, dmg);
  }
  function shoot() {
    const w = st.weapon;
    if (!w) { denied('No tienes arma en mano. Elige una con 1–6.'); st.cd = .5; return; }
    const Wd = WEAP[w.w];
    if (ammoOf(Wd.ammo) < 1) { SFX.empty(); msg(`Sin ${AMMO[Wd.ammo].name}.`, '#ff8a7a'); st.cd = .5; return; }
    useAmmo(Wd.ammo); st.cd = Wd.cd; st.flash = .09; st.kick = 1; SFX[w.w]();
    if (w.w === 'plasma') hitscan(rnd(-.01, .01), 1, false, 40);
    else if (w.w === 'escopeta') for (let k = 0; k < 7; k++) hitscan(rnd(-.09, .09), .75, false, 14);
    else {
      hitscan(0, 6, true, 60);
      const ca = Math.cos(st.pa), sa = Math.sin(st.pa);
      for (let k = 1; k < 40; k += .5) { const x = st.px + ca * k, y = st.py + sa * k, z = st.pz + EYE - .15; if (solidAt(x, y, z)) break;
        addPart(x, y, z, 0, 0, .2, .35, rgb(120, 200, 255)); }
    }
  }

