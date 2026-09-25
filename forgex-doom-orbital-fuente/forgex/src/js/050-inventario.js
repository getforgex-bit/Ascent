  // ================= INVENTARIO =================
  const sizeOf = it => it.t === 'weapon' ? 2 : 1;
  const used = () => st.inv.reduce((a, it) => a + sizeOf(it), 0);
  const freeSlots = () => SLOTS - used();
  const ORD = { weapon: 0, shield: 1, box: 2, loose: 3 };
  const sortInv = () => st.inv.sort((a, b) => ORD[a.t] - ORD[b.t] || (a.ammo || a.w || '').localeCompare(b.ammo || b.w || ''));
  function slotList() { const s = []; for (const it of st.inv) for (let k = 0; k < sizeOf(it); k++) s.push(it); while (s.length < SLOTS) s.push(null); return s; }
  const ammoOf = type => st.inv.reduce((a, it) => a + (it.ammo === type ? (it.t === 'box' ? it.count : it.t === 'loose' ? 1 : 0) : 0), 0);
  function useAmmo(type) {
    const li = st.inv.findIndex(it => it.t === 'loose' && it.ammo === type);
    if (li >= 0) { st.inv.splice(li, 1); return; }
    const b = st.inv.find(it => it.t === 'box' && it.ammo === type && it.count > 0); if (b) b.count--;
  }
  function consolidate(type) {
    let total = ammoOf(type);
    st.inv = st.inv.filter(it => !(it.t === 'loose' && it.ammo === type));
    for (const b of st.inv) if (b.t === 'box' && b.ammo === type) { b.count = Math.min(st.boxCap, total); total -= b.count; }
    for (let k = 0; k < total; k++) st.inv.push({ t: 'loose', ammo: type });
    sortInv();
  }
  function pickupAmmo(type, n) {
    const boxes = st.inv.filter(it => it.t === 'box' && it.ammo === type);
    const take = Math.min(n, boxes.reduce((a, b) => a + st.boxCap - b.count, 0) + freeSlots());
    let r = take; for (const b of boxes) { const add = Math.min(r, st.boxCap - b.count); b.count += add; r -= add; }
    for (let k = 0; k < r; k++) st.inv.push({ t: 'loose', ammo: type });
    sortInv(); return take;
  }
  function denied(t) { SFX.denied(); msg(t, '#ff8a7a'); }
  function interact(it) {
    const rm = () => { st.items = st.items.filter(i => i !== it); };
    switch (it.kind) {
      case 'crate':
        it.open = true;
        if (!it.content) { SFX.emptyCrate(); msg('El contenedor está vacío.', '#a99cff'); }
        else { SFX.open(); addItem(it.content.kind, it.x, it.y, it.z + .6, Object.assign({}, it.content, { vz: 3 })); msg('Algo había dentro…'); }
        return;
      case 'ammo': {
        const n = pickupAmmo(it.ammo, it.count);
        if (!n) return denied('Sin espacio: suelta algo con Q o consigue una caja.');
        it.count -= n; SFX.pick();
        msg(`+${n} ${AMMO[it.ammo].name}` + (it.count ? ` · ${it.count} se quedan en el suelo` : ''), AMMO[it.ammo].col);
        if (!it.count) rm(); return;
      }
      case 'box': {
        const hasLoose = st.inv.some(i => i.t === 'loose' && i.ammo === it.ammo);
        if (freeSlots() < 1 && !(hasLoose && it.count < st.boxCap)) return denied('Necesitas 1 espacio libre para la caja.');
        st.inv.push({ t: 'box', ammo: it.ammo, count: it.count }); consolidate(it.ammo); SFX.pick(); rm();
        return msg(`Caja de ${AMMO[it.ammo].name} (${it.count}/${st.boxCap}). Guarda hasta ${st.boxCap} de ese tipo.`, AMMO[it.ammo].col);
      }
      case 'weapon': {
        if (freeSlots() < 2) return denied('Un arma ocupa 2 espacios. Suelta algo con Q.');
        const w = { t: 'weapon', w: it.w }; st.inv.push(w); sortInv(); if (!st.weapon) st.weapon = w;
        SFX.pick(); rm(); return msg(`${WEAP[it.w].name} · usa ${AMMO[WEAP[it.w].ammo].name}`, '#ffdc50');
      }
      case 'shield':
        if (st.inv.some(i => i.t === 'shield')) return denied('Ya llevas un escudo.');
        if (freeSlots() < 1) return denied('Necesitas 1 espacio libre.');
        st.inv.push({ t: 'shield' }); sortInv(); SFX.pick(); rm(); return msg('Escudo recuperado.', '#5ff2e6');
      case 'heal':
        if (st.reserve >= st.reserveMax - .5) return denied('Tu reserva de curación ya está llena.');
        st.reserve = Math.min(st.reserveMax, st.reserve + 25); SFX.pick(); rm(); return msg('+25 de reserva de curación.', '#7dff4a');
      case 'upgrade':
        UPG[it.up].apply(st); SFX.pick(); rm(); return msg(`Mejora: ${UPG[it.up].name}, ${UPG[it.up].desc}.`, '#ffcc40');
    }
  }
  function dropSelected() {
    const it = slotList()[st.sel];
    if (!it) return denied('Ese espacio está vacío.');
    st.inv = st.inv.filter(i => i !== it);
    const fx = st.px + Math.cos(st.pa) * .7, fy = st.py + Math.sin(st.pa) * .7, base = { vx: Math.cos(st.pa) * 1.2, vy: Math.sin(st.pa) * 1.2, vz: 2 };
    if (it.t === 'weapon') { addItem('weapon', fx, fy, st.pz + .4, Object.assign(base, { w: it.w })); if (st.weapon === it) st.weapon = st.inv.find(i => i.t === 'weapon') || null; }
    else if (it.t === 'box') addItem('box', fx, fy, st.pz + .4, Object.assign(base, { ammo: it.ammo, count: it.count }));
    else if (it.t === 'loose') addItem('ammo', fx, fy, st.pz + .4, Object.assign(base, { ammo: it.ammo, count: 1 }));
    else addItem('shield', fx, fy, st.pz + .4, base);
    sortInv(); SFX.open();
  }
  function selectSlot(i) { st.sel = (i + SLOTS) % SLOTS; const it = slotList()[st.sel]; if (it && it.t === 'weapon' && st.weapon !== it) { st.weapon = it; msg(`${WEAP[it.w].name} en mano.`); } }
  function itemLabel(it) {
    switch (it.kind) {
      case 'crate': return 'Abrir contenedor';
      case 'ammo': return `Recoger ${it.count} ${AMMO[it.ammo].name}`;
      case 'box': return `Caja de ${AMMO[it.ammo].name} ${it.count}/${st.boxCap} · 1 espacio`;
      case 'weapon': return `${WEAP[it.w].name} · 2 espacios`;
      case 'shield': return 'Escudo · 1 espacio';
      case 'heal': return 'Vial de curación · +25 reserva';
      case 'upgrade': return `Mejora: ${UPG[it.up].name}`;
    }
  }
  const itemIcon = it => it.kind === 'crate' ? (it.open ? (it.content ? chestFrames.looted : chestFrames.empty) : chestFrames.closed) : it.kind === 'ammo' ? ICON[it.ammo] : it.kind === 'box' ? ICON['box_' + it.ammo] : it.kind === 'weapon' ? ICON[it.w] : ICON[it.kind];

