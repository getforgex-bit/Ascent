  // ================= ESTADO =================
  let best = 0; try { best = +localStorage.getItem('forgex-doom-orbital-best') || 0; } catch (_) {}
  let started = false, time = 0;
  function reset() {
    st = { px: C + .5, py: C + .5, pz: 0, vz: 0, pa: 0, look: 0, ground: true, jumps: 0, kx: 0, ky: 0,
      hp: 100, maxHp: 100, reserve: 30, reserveMax: 60, healLock: 0, still: 0, healing: false, regenN: 0, regenT: 0, regenIdle: 0, regenPend: 0, regenDrip: 0, jumpMul: 1, boxCap: 32,
      shieldT: 0, shieldCd: 0, shieldRecharge: 60, cd: 0, flash: 0, kick: 0, land: 0, dmg: 0, bob: 0,
      inv: [], sel: 0, weapon: null, band: 0, cp: [C + .5, C + .5, 0], cpFlash: 0, top: 0, dead: false,
      enemies: [], items: [], proj: [], msgs: [], flashes: [], lamp: true, skullT: 35, ambT: 6, hbT: 0, pruneT: 2, zone: null, zoneT: 0 };
    PARTS.n = 0;
    st.inv = [{ t: 'weapon', w: 'plasma' }, { t: 'shield' }, { t: 'box', ammo: 'celdas', count: 24 }];
    st.weapon = st.inv[0];
    initWorld();
    directorReset();
    st.pa = gen.ang;
    msg('Asciende. La altura es lo único que cuenta.', '#5ff2e6');
    msg('Las ramas laterales pueden tener recursos… o nada.', '#a99cff');
  }
  reset();

